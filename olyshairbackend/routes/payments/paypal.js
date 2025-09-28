const express = require('express');
const fetch = require('node-fetch');
const Order = require('../../models/Order');

const router = express.Router();

const PAYPAL_BASE = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function getAccessToken(){
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const d = await r.json();
  return d.access_token;
}

router.post('/create-order', async (req,res) => {
  try {
    const { amount, items } = req.body;
    const token = await getAccessToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: String(amount) }, items }]
      })
    });
    const data = await r.json();
    const order = await Order.create({ user: req.user?.id, items, total: amount, paymentProvider:'paypal', paymentStatus:'created', metadata: data });
    res.json(data);
  } catch(err){ res.status(500).send({ error: err.message }); }
});

router.post('/capture/:orderId', async (req,res) => {
  // call PayPal capture endpoint with order id from client, update Order
});
module.exports = router;
