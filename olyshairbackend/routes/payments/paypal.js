const express = require('express');
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// PayPal Configuration
const PAYPAL_BASE = process.env.PAYPAL_ENVIRONMENT === 'production' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

console.log('🚀 PayPal Configuration:', {
  baseURL: PAYPAL_BASE,
  environment: process.env.PAYPAL_ENVIRONMENT || 'sandbox'
});

// Get Access Token
async function getAccessToken() {
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      throw new Error('PayPal credentials missing');
    }

    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: { 
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`PayPal auth failed: ${data.error_description || data.error}`);
    }

    return data.access_token;
  } catch (error) {
    console.error('❌ PayPal auth error:', error.message);
    throw error;
  }
}

// ✅ FIXED: Create Order Endpoint
router.post('/create-order', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, items, currency = 'EUR' } = req.body;
    
    console.log('🔄 Creating PayPal order with:', { 
      amount, 
      currency, 
      itemsCount: items?.length,
      items: items.map(item => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity
      }))
    });

    // Validate input
    if (!amount || amount <= 0) {
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

    // ✅ SIMPLIFIED PayPal payload - This is the key fix
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: parseFloat(amount).toFixed(2)
        },
        items: items.map((item, index) => ({
          name: (item.name || `Product ${index + 1}`).substring(0, 126),
          description: (item.description || item.name || `Product ${index + 1}`).substring(0, 126),
          unit_amount: {
            currency_code: currency,
            value: parseFloat(item.price || 0).toFixed(2)
          },
          quantity: (item.quantity || 1).toString(),
          category: 'PHYSICAL_GOODS'
        }))
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/order-success`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/checkout`
      }
    };

    console.log('📦 Final PayPal payload:', JSON.stringify(orderPayload, null, 2));

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

    console.log('📨 PayPal API Response:', {
      status: response.status,
      data: data
    });

    if (!response.ok) {
      const errorMsg = data.details?.[0]?.description || data.message || 'PayPal API error';
      console.error('❌ PayPal API error details:', data);
      throw new Error(errorMsg);
    }

    // Validate response structure
    if (!data.id) {
      throw new Error('No order ID in PayPal response');
    }

    const approvalLink = data.links.find(link => link.rel === 'approve');
    if (!approvalLink) {
      throw new Error('No approval link in PayPal response');
    }

    // Create order in database
    const order = await Order.create({
      user: req.user?.id,
      items: items,
      totalAmount: amount,
      currency: currency,
      paymentProvider: 'paypal',
      paymentStatus: 'pending',
      paypalOrderId: data.id,
      status: 'created'
    });

    console.log('✅ PayPal order created successfully:', data.id);

    // ✅ CRITICAL: Return EXACT format that PayPal SDK expects
    res.json({
      id: data.id,  // PayPal expects 'id' not 'orderId'
      status: data.status,
      links: data.links
    });

  } catch (error) {
    console.error('❌ Create order error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Capture Payment
router.post('/capture/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('🔄 Capturing PayPal order:', orderId);

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
      throw new Error(data.details?.[0]?.description || data.message || 'Capture failed');
    }

    // Update order in database
    await Order.findOneAndUpdate(
      { paypalOrderId: orderId },
      { 
        paymentStatus: 'completed',
        status: 'confirmed',
        transactionId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        paidAt: new Date()
      }
    );

    console.log('✅ PayPal payment captured successfully');

    res.json({
      success: true,
      status: 'COMPLETED',
      transactionId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
      orderId: data.id
    });

  } catch (error) {
    console.error('❌ Capture error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    await getAccessToken();
    res.json({ 
      status: 'OK', 
      paypal: 'connected',
      environment: process.env.PAYPAL_ENVIRONMENT || 'sandbox'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      error: error.message 
    });
  }
});
// Debug endpoint to test PayPal configuration
router.get('/debug/config', async (req, res) => {
  try {
    const token = await getAccessToken();
    
    res.json({
      success: true,
      config: {
        baseUrl: PAYPAL_BASE,
        environment: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
        hasClientId: !!process.env.PAYPAL_CLIENT_ID,
        hasClientSecret: !!process.env.PAYPAL_CLIENT_SECRET,
        tokenReceived: !!token
      }
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;