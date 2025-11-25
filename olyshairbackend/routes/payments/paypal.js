const express = require('express');
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();

// Import node-fetch properly for CommonJS
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ==================== PAYPAL CONFIGURATION ====================
// Enhanced PayPal environment detection
const getPayPalBaseURL = () => {
  console.log('🔧 PayPal Configuration Analysis:', {
    NODE_ENV: process.env.NODE_ENV,
    PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT || 'Not set',
    CLIENT_ID_PREFIX: process.env.PAYPAL_CLIENT_ID ? process.env.PAYPAL_CLIENT_ID.substring(0, 5) + '...' : 'MISSING',
    HAS_CLIENT_SECRET: !!process.env.PAYPAL_CLIENT_SECRET
  });

  // Method 1: Explicit PayPal environment variable (highest priority)
  if (process.env.PAYPAL_ENVIRONMENT) {
    const isProduction = process.env.PAYPAL_ENVIRONMENT === 'production';
    console.log('🎯 Using explicit PAYPAL_ENVIRONMENT:', process.env.PAYPAL_ENVIRONMENT);
    return isProduction ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }
  
  // Method 2: Check client ID pattern detection
  if (process.env.PAYPAL_CLIENT_ID) {
    // Live client IDs typically start with 'A' but not 'AZ' (sandbox starts with 'AZ')
    const isLiveClient = process.env.PAYPAL_CLIENT_ID.startsWith('A') && 
                        !process.env.PAYPAL_CLIENT_ID.startsWith('AZ');
    console.log('🎯 Detected from Client ID - Live Environment:', isLiveClient);
    return isLiveClient ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }
  
  // Method 3: Fallback to NODE_ENV
  console.log('🎯 Fallback to NODE_ENV:', process.env.NODE_ENV);
  return process.env.NODE_ENV === 'production' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';
};

const PAYPAL_BASE = getPayPalBaseURL();

// Log final configuration
console.log('🚀 PayPal Final Configuration:', {
  baseURL: PAYPAL_BASE,
  environment: process.env.PAYPAL_ENVIRONMENT || 'auto-detected',
  nodeEnv: process.env.NODE_ENV,
  clientId: process.env.PAYPAL_CLIENT_ID ? '***' + process.env.PAYPAL_CLIENT_ID.slice(-4) : 'MISSING',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET ? '***' + process.env.PAYPAL_CLIENT_SECRET.slice(-4) : 'MISSING'
});

// ==================== ERROR HANDLER ====================
const handlePayPalError = (error, res) => {
  console.error('❌ PayPal API Error:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  if (error.message.includes('invalid_client') || error.message.includes('Authentication failed')) {
    return res.status(500).json({
      success: false,
      error: 'PayPal authentication failed. Please check your API credentials.',
      details: 'Ensure you are using the correct environment (live/sandbox) and valid credentials'
    });
  }
  
  if (error.message.includes('PAYPAL_CLIENT_ID') || error.message.includes('PAYPAL_CLIENT_SECRET')) {
    return res.status(500).json({
      success: false,
      error: 'PayPal configuration incomplete',
      details: 'Please check your environment variables for PayPal credentials'
    });
  }
  
  res.status(500).json({
    success: false,
    error: error.message || 'Payment service temporarily unavailable',
    details: 'Please try again or use an alternative payment method'
  });
};

// ==================== ACCESS TOKEN MANAGEMENT ====================
async function getAccessToken(retries = 3) {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔑 PayPal Auth Attempt ${attempt}/${retries} to: ${PAYPAL_BASE}`);
      
      // Validate environment variables with detailed error
      if (!process.env.PAYPAL_CLIENT_ID) {
        throw new Error('PAYPAL_CLIENT_ID environment variable is missing');
      }
      
      if (!process.env.PAYPAL_CLIENT_SECRET) {
        throw new Error('PAYPAL_CLIENT_SECRET environment variable is missing');
      }

      const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
      
      const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: { 
          'Authorization': `Basic ${basic}`, 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'grant_type=client_credentials'
      });

      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Failed to parse PayPal response:', responseText);
        throw new Error(`Invalid response from PayPal: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok) {
        console.error(`❌ PayPal auth failed (Attempt ${attempt}):`, {
          status: response.status,
          statusText: response.statusText,
          url: `${PAYPAL_BASE}/v1/oauth2/token`,
          error: data
        });
        
        if (data.error === 'invalid_client') {
          throw new Error(`PayPal authentication failed: Invalid client credentials. Please verify your CLIENT_ID and CLIENT_SECRET for ${PAYPAL_BASE.includes('sandbox') ? 'SANDBOX' : 'LIVE'} environment`);
        }
        
        throw new Error(`PayPal auth failed: ${response.status} - ${data.error || response.statusText}`);
      }

      if (!data.access_token) {
        throw new Error('No access token received from PayPal');
      }
      
      console.log('✅ PayPal authentication successful');
      return data.access_token;
      
    } catch (error) {
      console.error(`❌ PayPal auth attempt ${attempt} failed:`, error.message);
      
      if (attempt < retries) {
        const waitTime = 1000 * attempt;
        console.log(`⏳ Retrying PayPal auth in ${waitTime}ms... (${retries - attempt} attempts left)`);
        await delay(waitTime);
      } else {
        const finalError = new Error(`PayPal authentication failed after ${retries} attempts: ${error.message}`);
        finalError.originalError = error;
        throw finalError;
      }
    }
  }
}

// ==================== CREATE ORDER ENDPOINT ====================
router.post('/create-order', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, items, currency = 'EUR' } = req.body;
    
    console.log('🔄 Creating PayPal order with:', { 
      amount, 
      currency,
      itemsCount: items?.length || 0,
      timestamp: new Date().toISOString()
    });
    
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

    // Validate each item
    for (const [index, item] of items.entries()) {
      if (!item.name || !item.price || !item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Item ${index + 1} is missing required fields (name, price, or quantity)`
        });
      }
    }

    const token = await getAccessToken();
    
    // Enhanced order payload with better item handling
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { 
          currency_code: currency, 
          value: parseFloat(amount).toFixed(2),
          breakdown: {
            item_total: {
              currency_code: currency,
              value: parseFloat(amount).toFixed(2)
            }
          }
        },
        items: items.map((item, index) => ({
          name: (item.name || `Product ${index + 1}`).substring(0, 127),
          unit_amount: { 
            currency_code: currency, 
            value: parseFloat(item.price || 0).toFixed(2)
          },
          quantity: String(item.quantity || 1),
          sku: item.sku ? item.sku.substring(0, 127) : item.id ? item.id.substring(0, 127) : `SKU${index + 1}`,
          category: 'PHYSICAL_GOODS'
        })),
        description: `Order from OLYS HAIR - ${items.length} item(s)`
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/order-confirmation`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/checkout`,
        brand_name: 'OLYS HAIR',
        locale: 'en-US'
      }
    };

    console.log('📦 PayPal order payload:', JSON.stringify(orderPayload, null, 2));

    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'PayPal-Request-Id': `olys-${Date.now()}`
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ PayPal order creation failed:', {
        status: response.status,
        error: data,
        payload: orderPayload
      });
      throw new Error(data.message || `Failed to create PayPal order: ${response.status}`);
    }

    // Validate PayPal response
    if (!data.id || !data.links) {
      console.error('❌ Invalid PayPal response:', data);
      throw new Error('Invalid response from PayPal - missing order ID or links');
    }

    const approvalLink = data.links.find(link => link.rel === 'approve');
    if (!approvalLink) {
      throw new Error('No approval link found in PayPal response');
    }

    // Create order record in database
    const order = await Order.create({
      user: req.user?.id,
      items: items,
      total: amount,
      currency,
      paymentProvider: 'paypal',
      paymentStatus: 'created',
      paypalOrderId: data.id,
      metadata: {
        paypal_response: data,
        created_at: new Date()
      }
    });

    console.log('✅ PayPal order created successfully:', {
      orderId: data.id,
      internalOrderId: order._id,
      status: data.status,
      approvalUrl: approvalLink.href
    });

    // Return the exact structure frontend expects
    const responseData = {
      success: true,
      orderId: data.id,
      approvalUrl: approvalLink.href,
      internalOrderId: order._id,
      status: data.status
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Create order error:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    handlePayPalError(error, res);
  }
});

// ==================== CAPTURE PAYMENT ENDPOINT ====================
router.post('/capture/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('🔄 Capturing PayPal order:', {
      orderId,
      timestamp: new Date().toISOString()
    });
    
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
        'Prefer': 'return=representation',
        'PayPal-Request-Id': `capture-${Date.now()}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ PayPal capture failed:', {
        orderId,
        status: response.status,
        error: data
      });
      throw new Error(data.message || `Failed to capture payment: ${response.status}`);
    }

    // Validate capture response
    if (data.status !== 'COMPLETED') {
      console.warn('⚠️ PayPal capture not completed:', {
        orderId,
        status: data.status,
        response: data
      });
    }

    // Get transaction ID safely
    let transactionId = null;
    let captureAmount = null;
    
    try {
      transactionId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      captureAmount = data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
    } catch (e) {
      console.warn('Could not extract transaction details from PayPal response:', e);
    }

    // Update order status in database
    const updatedOrder = await Order.findOneAndUpdate(
      { paypalOrderId: orderId },
      { 
        paymentStatus: 'completed',
        transactionId: transactionId,
        paidAt: new Date(),
        'metadata.capture_response': data,
        'metadata.captured_at': new Date(),
        'metadata.capture_amount': captureAmount
      },
      { new: true }
    );

    if (!updatedOrder) {
      console.warn('⚠️ Order not found in database for PayPal order ID:', orderId);
    }

    console.log('✅ PayPal payment captured successfully:', {
      orderId,
      transactionId,
      status: data.status,
      amount: captureAmount
    });

    // Return the exact structure frontend expects
    const responseData = {
      success: true,
      status: data.status,
      transactionId: transactionId,
      orderId: data.id,
      capturedAmount: captureAmount
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Capture order error:', {
      message: error.message,
      orderId: req.params.orderId,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    handlePayPalError(error, res);
  }
});

// ==================== WEBHOOK HANDLER ====================
router.post('/webhook', express.json({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookEvent = req.body;
    
    console.log('📩 Received PayPal webhook:', {
      event_type: webhookEvent.event_type,
      resource_type: webhookEvent.resource_type,
      resource_id: webhookEvent.resource?.id,
      timestamp: new Date().toISOString()
    });
    
    // TODO: Implement PayPal webhook signature verification for production
    // const paypalWebhookVerify = require('../../middleware/paypalWebhookVerify');
    // await paypalWebhookVerify(req);
    
    switch (webhookEvent.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { 
            paymentStatus: 'completed',
            paidAt: new Date(),
            transactionId: webhookEvent.resource.id,
            'metadata.webhook_capture': webhookEvent
          }
        );
        console.log('✅ Webhook: Payment captured for order:', webhookEvent.resource.id);
        break;
        
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.FAILED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { 
            paymentStatus: 'failed',
            'metadata.webhook_failure': webhookEvent
          }
        );
        console.log('❌ Webhook: Payment failed for order:', webhookEvent.resource.id);
        break;
        
      case 'CHECKOUT.ORDER.APPROVED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { 
            paymentStatus: 'approved',
            'metadata.webhook_approval': webhookEvent
          }
        );
        console.log('✅ Webhook: Order approved:', webhookEvent.resource.id);
        break;
        
      case 'CHECKOUT.ORDER.COMPLETED':
        await Order.findOneAndUpdate(
          { paypalOrderId: webhookEvent.resource.id },
          { 
            paymentStatus: 'completed',
            paidAt: new Date(),
            'metadata.webhook_completion': webhookEvent
          }
        );
        console.log('✅ Webhook: Order completed:', webhookEvent.resource.id);
        break;
        
      default:
        console.log('ℹ️ Webhook: Unhandled event type:', webhookEvent.event_type);
    }

    res.status(200).json({ received: true, processed: true });
    
  } catch (error) {
    console.error('❌ Webhook processing error:', {
      message: error.message,
      event: req.body?.event_type,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
});

// ==================== HEALTH CHECK ENDPOINT ====================
router.get('/health', async (req, res) => {
  try {
    const healthInfo = {
      timestamp: new Date().toISOString(),
      paypal: {
        baseURL: PAYPAL_BASE,
        environment: process.env.PAYPAL_ENVIRONMENT || 'auto-detected',
        nodeEnv: process.env.NODE_ENV,
        hasClientId: !!process.env.PAYPAL_CLIENT_ID,
        hasClientSecret: !!process.env.PAYPAL_CLIENT_SECRET,
        clientIdPrefix: process.env.PAYPAL_CLIENT_ID ? process.env.PAYPAL_CLIENT_ID.substring(0, 5) + '...' : 'MISSING'
      },
      server: {
        frontendUrl: process.env.FRONTEND_URL,
        backendUrl: process.env.BACKEND_URL
      }
    };

    console.log('🔧 Health Check Request:', healthInfo);

    const token = await getAccessToken(1); // Quick test with 1 retry
    
    res.json({ 
      status: 'OK', 
      paypal: 'connected',
      ...healthInfo,
      credentials: 'valid',
      access_token: 'received'
    });
    
  } catch (error) {
    console.error('❌ PayPal health check failed:', {
      message: error.message,
      baseURL: PAYPAL_BASE,
      hasClientId: !!process.env.PAYPAL_CLIENT_ID,
      hasClientSecret: !!process.env.PAYPAL_CLIENT_SECRET,
      timestamp: new Date().toISOString()
    });
    
    res.status(503).json({ 
      status: 'ERROR', 
      paypal: 'disconnected',
      error: error.message,
      baseUrl: PAYPAL_BASE,
      environment: process.env.PAYPAL_ENVIRONMENT || process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== GET ORDER DETAILS ENDPOINT ====================
router.get('/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required'
      });
    }

    const token = await getAccessToken();
    
    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Get order details failed:', {
        orderId,
        status: response.status,
        error: data
      });
      throw new Error(data.message || `Failed to get order details: ${response.status}`);
    }

    res.json({
      success: true,
      order: data
    });

  } catch (error) {
    console.error('❌ Get order details error:', error);
    handlePayPalError(error, res);
  }
});

// ==================== CORS & SECURITY HEADERS ====================
router.use((req, res, next) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL, 
    'https://www.olyshair.com',
    'https://olyshair.com',
    'http://localhost:3000',
    'https://olyshairi-e-commerce-hairspo-online.vercel.app'
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, PayPal-Request-Id');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Handle preflight requests
router.options('*', (req, res) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL, 
    'https://www.olyshair.com',
    'https://olyshair.com',
    'http://localhost:3000',
    'https://olyshairi-e-commerce-hairspo-online.vercel.app'
  ].filter(Boolean);
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, PayPal-Request-Id');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

module.exports = router;