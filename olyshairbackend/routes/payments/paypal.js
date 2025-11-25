const express = require('express');
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();

// Import node-fetch properly for CommonJS
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ==================== PAYPAL CONFIGURATION ====================
const getPayPalBaseURL = () => {
  if (process.env.PAYPAL_ENVIRONMENT === 'production') {
    return 'https://api-m.paypal.com';
  }
  return 'https://api-m.sandbox.paypal.com';
};

const PAYPAL_BASE = getPayPalBaseURL();

console.log('🚀 PayPal Configuration:', {
  baseURL: PAYPAL_BASE,
  environment: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
  clientId: process.env.PAYPAL_CLIENT_ID ? '***' + process.env.PAYPAL_CLIENT_ID.slice(-4) : 'MISSING'
});

// ==================== ACCESS TOKEN MANAGEMENT ====================
async function getAccessToken() {
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      throw new Error('PayPal credentials missing');
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`PayPal auth failed: ${data.error} - ${data.error_description}`);
    }

    return data.access_token;
  } catch (error) {
    console.error('❌ PayPal auth error:', error.message);
    throw error;
  }
}

// ==================== FIXED CREATE ORDER ENDPOINT ====================
router.post('/create-order', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, items, currency = 'EUR' } = req.body;
    
    console.log('🔄 Creating PayPal order:', { 
      amount, 
      currency, 
      itemsCount: items?.length 
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

    const token = await getAccessToken();
    
    // Calculate item total properly
    const itemsTotal = items.reduce((sum, item) => {
      const itemPrice = parseFloat(item.price) || 0;
      const itemQuantity = parseInt(item.quantity) || 1;
      return sum + (itemPrice * itemQuantity);
    }, 0);

    console.log('💰 Amount calculations:', {
      providedAmount: amount,
      calculatedTotal: itemsTotal.toFixed(2)
    });

    // ✅ FIXED: Simplified PayPal order payload
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: parseFloat(amount).toFixed(2),
          breakdown: {
            item_total: {
              currency_code: currency,
              value: itemsTotal.toFixed(2)
            }
          }
        },
        items: items.map((item, index) => ({
          name: (item.name || `Product ${index + 1}`).substring(0, 127),
          unit_amount: {
            currency_code: currency,
            value: parseFloat(item.price || 0).toFixed(2)
          },
          quantity: parseInt(item.quantity || 1).toString(),
          sku: item.sku || item.id || `SKU${index + 1}`,
          category: 'PHYSICAL_GOODS'
        }))
      }],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/order-confirmation`,
        cancel_url: `${process.env.FRONTEND_URL || 'https://www.olyshair.com'}/checkout`
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
      throw new Error(data.details?.[0]?.description || data.message || 'PayPal API error');
    }

    // Find approval link
    const approvalLink = data.links.find(link => link.rel === 'approve');
    if (!approvalLink) {
      throw new Error('No approval link in PayPal response');
    }

    // Create order record in database
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

    // Return response in exact format frontend expects
    res.json({
      success: true,
      orderId: data.id,
      approvalUrl: approvalLink.href,
      internalOrderId: order._id
    });

  } catch (error) {
    console.error('❌ Create order error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create PayPal order'
    });
  }
});

// ==================== CAPTURE PAYMENT ENDPOINT ====================
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
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ PayPal capture failed:', data);
      throw new Error(data.details?.[0]?.description || data.message || 'Capture failed');
    }

    // Extract transaction ID safely
    const transactionId = data.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const captureAmount = data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;

    // Update order in database
    await Order.findOneAndUpdate(
      { paypalOrderId: orderId },
      { 
        paymentStatus: 'completed',
        status: 'confirmed',
        transactionId: transactionId,
        paidAt: new Date()
      }
    );

    console.log('✅ PayPal payment captured successfully:', transactionId);

    res.json({
      success: true,
      status: data.status,
      transactionId: transactionId,
      orderId: data.id,
      capturedAmount: captureAmount
    });

  } catch (error) {
    console.error('❌ Capture order error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to capture payment'
    });
  }
});

// ==================== HEALTH CHECK ====================
router.get('/health', async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({ 
      status: 'OK', 
      paypal: 'connected',
      environment: process.env.PAYPAL_ENVIRONMENT || 'sandbox'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      paypal: 'disconnected',
      error: error.message 
    });
  }
});

module.exports = router;