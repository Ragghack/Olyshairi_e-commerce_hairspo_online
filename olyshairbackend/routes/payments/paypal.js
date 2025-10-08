const express = require('express');
const fetch = require('node-fetch');
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();

// Determine PayPal environment
const getPayPalBaseURL = () => {
  const isProduction = process.env.NODE_ENV === 'production' && 
                       process.env.PAYPAL_CLIENT_ID && 
                       process.env.PAYPAL_CLIENT_SECRET;
  return isProduction ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
};

const PAYPAL_BASE = getPayPalBaseURL();

// Centralized error handler for PayPal API
const handlePayPalError = (error, res) => {
  console.error('PayPal API Error:', error);
  
  if (error.response?.data) {
    return res.status(error.response.status).json({
      success: false,
      error: error.response.data.message || 'PayPal API error'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Payment service unavailable'
  });
};

// Get access token with retry logic
async function getAccessToken(retries = 3) {
  try {
    const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: { 
        'Authorization': `Basic ${basic}`, 
        'Content-Type': 'application/x-www-form-urlencoded' 
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      throw new Error(`PayPal auth failed: ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying PayPal auth... ${retries} attempts left`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return getAccessToken(retries - 1);
    }
    throw error;
  }
}

router.post('/create-order', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, items, currency = 'USD' } = req.body;
    
    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    const token = await getAccessToken();
    
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { 
          currency_code: currency, 
          value: String(amount) 
        },
        items: items?.map(item => ({
          name: item.name,
          unit_amount: { currency_code: currency, value: String(item.price) },
          quantity: String(item.quantity),
          sku: item.sku || item.id
        }))
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.FRONTEND_URL}/order-confirmation`,
        cancel_url: `${process.env.FRONTEND_URL}/checkout`
      }
    };

    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to create PayPal order');
    }

    // Create order record
    const order = await Order.create({
      user: req.user?.id,
      items,
      total: amount,
      currency,
      paymentProvider: 'paypal',
      paymentStatus: 'created',
      paypalOrderId: data.id,
      metadata: data
    });

    res.json({
      success: true,
      orderId: data.id,
      approvalUrl: data.links.find(link => link.rel === 'approve').href,
      internalOrderId: order._id
    });

  } catch (error) {
    handlePayPalError(error, res);
  }
});

router.post('/capture/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const token = await getAccessToken();
    
    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to capture payment');
    }

    // Update order status
    await Order.findOneAndUpdate(
      { paypalOrderId: orderId },
      { 
        paymentStatus: 'completed',
        'metadata.capture': data
      }
    );

    res.json({
      success: true,
      status: data.status,
      transactionId: data.purchase_units[0].payments.captures[0].id
    });

  } catch (error) {
    handlePayPalError(error, res);
  }
});

// Webhook handler for PayPal events
router.post('/webhook', express.json({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookEvent = req.body;
    
    // Verify webhook signature (important for production)
    // Implement PayPal webhook verification here
    
    switch (webhookEvent.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { paymentStatus: 'completed' }
        );
        break;
      case 'PAYMENT.CAPTURE.DENIED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { paymentStatus: 'failed' }
        );
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;