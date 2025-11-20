const express = require('express');
const Stripe = require('stripe');
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();

// Enhanced Stripe initialization with error handling
let stripe;
try {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is missing from environment variables');
    // Don't throw error to allow server to start
  } else {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    console.log('Stripe initialized successfully');
  }
} catch (error) {
  console.error('Stripe initialization failed:', error);
}

// Enhanced error handler
const handleStripeError = (error, res) => {
  console.error('Stripe Error:', error);

  // Handle Stripe-specific errors
  if (error.type) {
    switch (error.type) {
      case 'StripeCardError':
        return res.status(402).json({
          success: false,
          error: 'Your card was declined. Please try another card.',
          code: 'card_declined'
        });
      case 'StripeRateLimitError':
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
          code: 'rate_limit'
        });
      case 'StripeAPIError':
      case 'StripeConnectionError':
        return res.status(503).json({
          success: false,
          error: 'Payment service temporarily unavailable.',
          code: 'service_unavailable'
        });
      case 'StripeAuthenticationError':
        return res.status(500).json({
          success: false,
          error: 'Payment configuration error.',
          code: 'configuration_error'
        });
      default:
        return res.status(500).json({
          success: false,
          error: 'An unexpected error occurred.',
          code: 'unexpected_error'
        });
    }
  }

  // Handle generic errors
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'internal_error'
  });
};

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    stripe: !!stripe,
    timestamp: new Date().toISOString()
  });
});

// Create payment intent
router.post('/create-payment-intent', validatePaymentRequest, async (req, res) => {
  try {
    // Check if Stripe is initialized
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Payment service temporarily unavailable'
      });
    }

    const { amount, currency = 'eur', items, metadata = {} } = req.body;

    // Validate amount (Stripe expects amount in cents for EUR)
    const amountInCents = Math.round(amount * 100);
    if (amountInCents < 50) { // Minimum €0.50
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least €0.50'
      });
    }

    // Calculate exact amount from items to prevent mismatch
    const calculatedAmount = items?.reduce((total, item) => 
      total + (Math.round(item.price * 100) * item.quantity), 0
    ) || amountInCents;

    // Validate calculated amount
    if (calculatedAmount < 50) {
      return res.status(400).json({
        success: false,
        error: 'Total amount must be at least €0.50'
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: calculatedAmount,
      currency: currency.toLowerCase(),
      metadata: {
        integration: 'olyshair',
        customer_email: metadata.email,
        user_id: req.user?.id || 'guest',
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
      items: items || [],
      total: amount,
      currency,
      paymentProvider: 'stripe',
      paymentStatus: 'pending',
      stripePaymentIntentId: paymentIntent.id,
      metadata: {
        ...metadata,
        client_secret: paymentIntent.client_secret
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      orderId: order._id,
      paymentIntentId: paymentIntent.id,
      amount: calculatedAmount
    });

  } catch (error) {
    console.error('Create Payment Intent Error:', error);
    handleStripeError(error, res);
  }
});

// Confirm payment intent
router.post('/confirm-payment', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: 'Payment service temporarily unavailable'
      });
    }

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
      default:
        orderStatus = paymentIntent.status;
    }

    await Order.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      { 
        paymentStatus: orderStatus,
        'metadata.paymentIntent': paymentIntent
      }
    );

    res.json({
      success: true,
      status: paymentIntent.status,
      orderStatus,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Confirm Payment Error:', error);
    handleStripeError(error, res);
  }
});

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Check if Stripe is initialized
  if (!stripe) {
    console.error('Stripe not initialized for webhook');
    return res.status(503).send('Service unavailable');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
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
    console.log(`Processing webhook: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: paymentIntent.id },
          { 
            paymentStatus: 'completed',
            'metadata.webhook': {
              type: event.type,
              receivedAt: new Date()
            }
          }
        );
        console.log(`Payment succeeded for intent: ${paymentIntent.id}`);
        break;
      
      case 'payment_intent.payment_failed':
        const failedIntent = event.data.object;
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: failedIntent.id },
          { 
            paymentStatus: 'failed',
            'metadata.webhook': {
              type: event.type,
              receivedAt: new Date(),
              error: failedIntent.last_payment_error
            }
          }
        );
        console.log(`Payment failed for intent: ${failedIntent.id}`);
        break;
      
      case 'payment_intent.canceled':
        const canceledIntent = event.data.object;
        await Order.findOneAndUpdate(
          { stripePaymentIntentId: canceledIntent.id },
          { 
            paymentStatus: 'cancelled',
            'metadata.webhook': {
              type: event.type,
              receivedAt: new Date()
            }
          }
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