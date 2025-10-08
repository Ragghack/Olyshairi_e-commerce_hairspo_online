const express = require('express');
const Stripe = require('stripe');
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Centralized Stripe error handling
const handleStripeError = (error, res) => {
  console.error('Stripe Error:', error);

  switch (error.type) {
    case 'StripeCardError':
      return res.status(402).json({
        success: false,
        error: error.message
      });
    case 'StripeRateLimitError':
    case 'StripeAPIError':
    case 'StripeConnectionError':
    case 'StripeAuthenticationError':
      return res.status(503).json({
        success: false,
        error: 'Payment service temporarily unavailable'
      });
    default:
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
  }
};

router.post('/create-payment-intent', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, currency = 'usd', items, metadata = {} } = req.body;

    // Validate amount (Stripe expects amount in cents)
    const amountInCents = Math.round(amount * 100);
    if (amountInCents < 50) { // Minimum $0.50
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least $0.50'
      });
    }

    // Calculate exact amount from items to prevent mismatch
    const calculatedAmount = items?.reduce((total, item) => 
      total + (Math.round(item.price * 100) * item.quantity), 0
    ) || amountInCents;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: calculatedAmount,
      currency: currency.toLowerCase(),
      metadata: {
        integration: 'olyshair',
        customer_email: metadata.email,
        ...metadata
      },
      automatic_payment_methods: {
        enabled: true,
      },
      // Add shipping if available
      ...(metadata.shipping && { shipping: metadata.shipping })
    });

    // Create provisional order
    const order = await Order.create({
      user: req.user?.id,
      items,
      total: amount,
      currency,
      paymentProvider: 'stripe',
      paymentStatus: 'pending',
      stripePaymentIntentId: paymentIntent.id,
      metadata: {
        ...metadata,
        client_secret: paymentIntent.client_secret // Store for reference
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      orderId: order._id,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    handleStripeError(error, res);
  }
});

// Confirm payment intent
router.post('/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Payment intent ID is required'
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Update order status based on payment intent status
    let orderStatus = 'pending';
    switch (paymentIntent.status) {
      case 'succeeded':
        orderStatus = 'completed';
        break;
      case 'canceled':
        orderStatus = 'cancelled';
        break;
      case 'requires_payment_method':
        orderStatus = 'failed';
        break;
    }

    await Order.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      { paymentStatus: orderStatus }
    );

    res.json({
      success: true,
      status: paymentIntent.status,
      orderStatus
    });

  } catch (error) {
    handleStripeError(error, res);
  }
});

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: paymentIntent.id },
          { paymentStatus: 'completed' }
        );
        break;
      
      case 'payment_intent.payment_failed':
        const failedIntent = event.data.object;
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: failedIntent.id },
          { paymentStatus: 'failed' }
        );
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;