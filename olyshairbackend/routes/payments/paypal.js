const express = require('express');
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();

// Import node-fetch properly for CommonJS
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Determine PayPal environment
const getPayPalBaseURL = () => {
  const isProduction = process.env.NODE_ENV === 'production' && 
                       process.env.PAYPAL_CLIENT_ID && 
                       process.env.PAYPAL_CLIENT_SECRET;
  return isProduction ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
};

const PAYPAL_BASE = getPayPalBaseURL();

// Enhanced error handler for PayPal API
const handlePayPalError = (error, res) => {
  console.error('PayPal API Error:', error);
  
  if (error.message) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Payment service unavailable'
  });
};

// Enhanced access token function with better error handling
async function getAccessToken(retries = 3) {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Validate environment variables
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        throw new Error('PayPal credentials not configured');
      }

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
        const errorText = await response.text();
        throw new Error(`PayPal auth failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.access_token) {
        throw new Error('No access token received from PayPal');
      }
      
      return data.access_token;
    } catch (error) {
      console.error(`PayPal auth attempt ${attempt} failed:`, error.message);
      
      if (attempt < retries) {
        console.log(`Retrying PayPal auth... ${retries - attempt} attempts left`);
        await delay(1000 * attempt); // Exponential backoff
      } else {
        throw new Error(`PayPal authentication failed after ${retries} attempts: ${error.message}`);
      }
    }
  }
}

// Enhanced create order endpoint - FIXED FOR FRONTEND
router.post('/create-order', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, items, currency = 'EUR' } = req.body;
    
    console.log('🔄 Creating PayPal order with:', { amount, items, currency });
    
    // Enhanced validation
    if (!amount || amount <= 0 || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        error: 'Valid amount is required'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order items are required'
      });
    }

    const token = await getAccessToken();
    
    // Enhanced order payload
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { 
          currency_code: currency, 
          value: parseFloat(amount).toFixed(2)
        },
        items: items.map(item => ({
          name: item.name?.substring(0, 127) || 'Product', // PayPal limit
          unit_amount: { 
            currency_code: currency, 
            value: parseFloat(item.price || 0).toFixed(2)
          },
          quantity: String(item.quantity || 1),
          sku: item.sku ? item.sku.substring(0, 127) : item.id ? item.id.substring(0, 127) : 'SKU001'
        })),
        description: `Order from OLYS HAIR - ${items.length} item(s)`
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/order-confirmation`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/checkout`,
        brand_name: 'OLYS HAIR'
      }
    };

    console.log('📦 PayPal order payload:', JSON.stringify(orderPayload, null, 2));

    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ PayPal order creation failed:', data);
      throw new Error(data.message || `Failed to create PayPal order: ${response.status}`);
    }

    // Validate PayPal response
    if (!data.id || !data.links) {
      throw new Error('Invalid response from PayPal');
    }

    const approvalLink = data.links.find(link => link.rel === 'approve');
    if (!approvalLink) {
      throw new Error('No approval link found in PayPal response');
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

    console.log('✅ PayPal order created successfully:', data.id);

    // FIXED: Return the exact structure frontend expects
    const responseData = {
      success: true,
      orderId: data.id, // This is what frontend expects to return
      approvalUrl: approvalLink.href,
      internalOrderId: order._id
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Create order error:', error);
    handlePayPalError(error, res);
  }
});

// Enhanced capture endpoint - FIXED FOR FRONTEND
router.post('/capture/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('🔄 Capturing PayPal order:', orderId);
    
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
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ PayPal capture failed:', data);
      throw new Error(data.message || `Failed to capture payment: ${response.status}`);
    }

    // Validate capture response
    if (data.status !== 'COMPLETED') {
      throw new Error(`Payment not completed. Status: ${data.status}`);
    }

    // Get transaction ID safely
    let transactionId = null;
    try {
      transactionId = data.purchase_units[0]?.payments?.captures[0]?.id;
    } catch (e) {
      console.warn('Could not extract transaction ID from PayPal response:', e);
    }

    // Update order status
    await Order.findOneAndUpdate(
      { paypalOrderId: orderId },
      { 
        paymentStatus: 'completed',
        'metadata.capture': data,
        paidAt: new Date()
      }
    );

    console.log('✅ PayPal payment captured successfully:', orderId);

    // FIXED: Return the exact structure frontend expects
    const responseData = {
      success: true,
      status: data.status,
      transactionId: transactionId, // This is what frontend expects
      orderId: data.id
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Capture order error:', error);
    handlePayPalError(error, res);
  }
});

// Webhook handler for PayPal events
router.post('/webhook', express.json({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookEvent = req.body;
    
    // Verify webhook signature (important for production)
    // Implement PayPal webhook verification here
    
    console.log('Received PayPal webhook:', webhookEvent.event_type);
    
    switch (webhookEvent.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { 
            paymentStatus: 'completed',
            paidAt: new Date()
          }
        );
        break;
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.FAILED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { paymentStatus: 'failed' }
        );
        break;
      case 'CHECKOUT.ORDER.APPROVED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { paymentStatus: 'approved' }
        );
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Add health check endpoint for PayPal
router.get('/health', async (req, res) => {
  try {
    const token = await getAccessToken(1); // Quick test with 1 retry
    res.json({ 
      status: 'OK', 
      paypal: 'connected',
      environment: process.env.NODE_ENV || 'development',
      baseUrl: PAYPAL_BASE
    });
  } catch (error) {
    console.error('PayPal health check failed:', error.message);
    res.status(503).json({ 
      status: 'ERROR', 
      paypal: 'disconnected',
      error: error.message,
      baseUrl: PAYPAL_BASE
    });
  }
});

// Add CORS headers to all responses
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://www.olyshair.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Handle preflight requests
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://www.olyshair.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.sendStatus(200);
});

module.exports = router;