const express = require('express');
const Stripe = require('stripe');
const Order = require('../../models/Order');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// create payment intent
router.post('/create-payment-intent', async (req,res) => {
  const { amount, currency = 'usd', items, metadata } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: { integration: 'olyshair', ...metadata },
      // automatic payment methods enables Apple Pay / Google Pay
      automatic_payment_methods: { enabled: true }
    });
    // optionally create provisional order
    const order = await Order.create({ user: req.user?.id, items, total: amount, paymentProvider:'stripe', paymentStatus: 'pending', metadata });
    res.json({ clientSecret: paymentIntent.client_secret, orderId: order._id });
  } catch(err) { res.status(500).send({ error: err.message }); }
});

module.exports = router;
