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

// ✅ FIXED: Create Order Endpoint with proper breakdown
router.post('/create-order', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, items, currency = 'EUR' } = req.body;
    
    console.log('🔄 Creating PayPal order with:', { 
      amount, 
      currency, 
      itemsCount: items?.length
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

    // ✅ Calculate item total properly
    const itemTotal = items.reduce((total, item) => {
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 1;
      return total + (price * quantity);
    }, 0);

    console.log('💰 Amount calculations:', {
      providedAmount: amount,
      calculatedItemTotal: itemTotal.toFixed(2)
    });

    // ✅ CORRECT PayPal payload with proper breakdown
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: parseFloat(amount).toFixed(2),
          breakdown: {
            item_total: {
              currency_code: currency,
              value: itemTotal.toFixed(2) // ✅ REQUIRED when items are specified
            }
          }
        },
        items: items.map((item, index) => ({
          name: (item.name || `Product ${index + 1}`).substring(0, 126),
          description: (item.description || item.name || `Product ${index + 1}`).substring(0, 126),
          unit_amount: {
            currency_code: currency,
            value: parseFloat(item.price || 0).toFixed(2)
          },
          quantity: (item.quantity || 1).toString(),
          category: 'PHYSICAL_GOODS',
          sku: item.sku || `SKU${index + 1}`
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
      console.error('❌ PayPal API error details:', JSON.stringify(data, null, 2));
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

    // ✅ Return format that PayPal SDK expects
    res.json({
      id: data.id,  // PayPal expects 'id' not 'orderId'
      status: data.status
    });

  } catch (error) {
    console.error('❌ Create order error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ ALTERNATIVE: Simple version without items (if you still have issues)
router.post('/create-order-simple', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, currency = 'EUR' } = req.body;
    
    console.log('🔄 Creating simple PayPal order:', { amount, currency });

    const token = await getAccessToken();

    // ✅ SIMPLEST PayPal payload - no items, just amount
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: parseFloat(amount).toFixed(2)
        }
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/order-success`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/checkout`
      }
    };

    console.log('📦 Simple PayPal payload:', JSON.stringify(orderPayload, null, 2));

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
      const errorMsg = data.details?.[0]?.description || data.message || 'PayPal API error';
      throw new Error(errorMsg);
    }

    // Create order in database
    const order = await Order.create({
      user: req.user?.id,
      totalAmount: amount,
      currency: currency,
      paymentProvider: 'paypal',
      paymentStatus: 'pending',
      paypalOrderId: data.id,
      status: 'created'
    });

    console.log('✅ Simple PayPal order created:', data.id);

    res.json({
      id: data.id,
      status: data.status
    });

  } catch (error) {
    console.error('❌ Simple create order error:', error.message);
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

module.exports = router;