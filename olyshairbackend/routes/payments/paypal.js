const express = require('express');
const mongoose = require('mongoose'); // Add this import
const Order = require('../../models/Order');
const { validatePaymentRequest } = require('../../middleware/validation');

const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

router.use((req, res, next) => {
  console.log(`💸 PayPal Route: ${req.method} ${req.path}`);
  console.log('Headers:', {
    authorization: req.headers.authorization ? 'Present' : 'Missing',
    'content-type': req.headers['content-type']
  });
  next();
});

// PayPal Configuration
const PAYPAL_ENV = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
const PAYPAL_BASE = PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

console.log('🚀 PayPal Configuration:', {
  baseURL: PAYPAL_BASE,
  environment: PAYPAL_ENV,
  hasClientId: !!process.env.PAYPAL_CLIENT_ID,
  hasClientSecret: !!process.env.PAYPAL_CLIENT_SECRET,
  frontendUrl: process.env.FRONTEND_URL || 'Not set'
});

// Get Access Token
async function getAccessToken() {
  try {
    console.log('🔐 Getting PayPal access token...');
    
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      console.error('❌ PayPal credentials missing in environment');
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

    console.log('🔑 PayPal auth response:', {
      status: response.status,
      hasToken: !!data.access_token
    });

    if (!response.ok) {
      console.error('❌ PayPal auth failed:', data);
      throw new Error(`PayPal auth failed: ${data.error_description || data.error}`);
    }

    console.log('✅ PayPal auth successful');
    return data.access_token;
  } catch (error) {
    console.error('❌ PayPal auth error:', error.message);
    throw error;
  }
}

// ✅ FIXED: Create Order Endpoint with proper schema compatibility
router.post('/create-order', validatePaymentRequest, async (req, res) => {
  try {
    console.log('📥 PayPal create-order received:', {
      bodyKeys: Object.keys(req.body),
      hasOrderNumber: !!req.body.orderNumber,
      orderNumber: req.body.orderNumber,
      hasEmail: !!req.body.email,
      hasGuestEmail: !!req.body.guestEmail,
      user: req.user?.id || 'no user'
    });
    
    const { amount, items, currency = 'EUR', shipping = 0, tax = 0, discount = 0 } = req.body;
    
    console.log('🔄 Creating PayPal order with:', { 
      amount, 
      currency, 
      itemsCount: items?.length,
      shipping,
      tax,
      discount
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

    // ✅ Calculate all amounts properly for PayPal
    const itemTotal = items.reduce((total, item) => {
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 1;
      return total + (price * quantity);
    }, 0);

    const shippingAmount = parseFloat(shipping) || 0;
    const taxAmount = parseFloat(tax) || 0;
    const discountAmount = parseFloat(discount) || 0;

    // ✅ Calculate the final total that should match the provided amount
    const calculatedTotal = itemTotal + shippingAmount + taxAmount - discountAmount;

    console.log('💰 PayPal amount calculations:', {
      providedAmount: amount,
      itemTotal: itemTotal.toFixed(2),
      shipping: shippingAmount.toFixed(2),
      tax: taxAmount.toFixed(2),
      discount: discountAmount.toFixed(2),
      calculatedTotal: calculatedTotal.toFixed(2),
      matches: parseFloat(amount).toFixed(2) === calculatedTotal.toFixed(2)
    });

    // ✅ If amounts don't match, use the calculated total for PayPal
    const paypalTotal = parseFloat(amount).toFixed(2) === calculatedTotal.toFixed(2) 
      ? parseFloat(amount).toFixed(2) 
      : calculatedTotal.toFixed(2);

    // ✅ CORRECT PayPal payload with complete breakdown
    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: paypalTotal,
          breakdown: {
            item_total: {
              currency_code: currency,
              value: itemTotal.toFixed(2)
            },
            shipping: {
              currency_code: currency,
              value: shippingAmount.toFixed(2)
            },
            tax_total: {
              currency_code: currency,
              value: taxAmount.toFixed(2)
            },
            discount: {
              currency_code: currency,
              value: discountAmount.toFixed(2)
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

    // ✅ FIXED: Create order in database with proper schema validation
    const orderNumber = req.body.orderNumber || `OL-${Date.now()}`;

    // Convert frontend productId/product to proper ObjectId for schema
// Convert frontend productId/product to proper ObjectId for schema
const validatedItems = items.map((item, index) => {
  // Get product ID from frontend (could be productId or product)
  const productIdFromFrontend = item.productId || item.product;
  
  // Create a valid ObjectId - your schema requires this
  let productObjectId;
  try {
    // Check if it's already a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(productIdFromFrontend)) {
      productObjectId = new mongoose.Types.ObjectId(productIdFromFrontend);
    } else {
      // If not valid, create a new ObjectId
      productObjectId = new mongoose.Types.ObjectId();
      console.warn(`⚠️ Invalid product ID for item ${index}, generated placeholder: ${productObjectId}`);
    }
  } catch (error) {
    productObjectId = new mongoose.Types.ObjectId();
    console.warn(`⚠️ Error creating ObjectId for item ${index}, generated: ${productObjectId}`);
  }

  // Return item with proper schema fields - BOTH product AND productId
  return {
    product: productObjectId, // ✅ ObjectId field
    productId: productIdFromFrontend || productObjectId.toString(), // ✅ String field (REQUIRED)
    name: item.name || `Product ${index + 1}`,
    price: parseFloat(item.price || 0),
    quantity: parseInt(item.quantity || 1),
    image: item.image || '',
    sku: item.sku || `SKU${index + 1}`
  };
});

    // Prepare order data matching your schema
    const orderData = {
      orderNumber: orderNumber,
      user: req.user?.id || null,
      guestEmail: req.body.email || req.body.guestEmail,
      
      // Items with proper schema structure
      items: validatedItems,

      // Pricing
      subtotal: parseFloat(itemTotal),
      shippingCost: parseFloat(shippingAmount),
      taxAmount: parseFloat(taxAmount),
      discountAmount: parseFloat(discountAmount),
      totalAmount: parseFloat(paypalTotal),

      // Status
      paymentMethod: 'paypal',
      paymentStatus: 'pending',
      status: 'pending',

      // Payment provider info
      paypalOrderId: data.id,

      // Shipping method
      shippingMethod: req.body.shippingMethod || 'standard'
    };

    // Add addresses if provided
    if (req.body.shippingAddress) {
      orderData.shippingAddress = {
        firstName: req.body.shippingAddress.firstName || req.body.firstName || 'Customer',
        lastName: req.body.shippingAddress.lastName || req.body.lastName || 'Guest',
        email: req.body.shippingAddress.email || req.body.email,
        address: req.body.shippingAddress.address || req.body.address || 'Not provided',
        city: req.body.shippingAddress.city || req.body.city || 'Not provided',
        state: req.body.shippingAddress.state || '',
        zipCode: req.body.shippingAddress.zipCode || req.body.zipCode || '00000',
        country: req.body.shippingAddress.country || req.body.country || 'Not provided',
        phone: req.body.shippingAddress.phone || req.body.phone || '000-000-0000'
      };
    }

    if (req.body.billingAddress) {
      orderData.billingAddress = {
        firstName: req.body.billingAddress.firstName || req.body.firstName || 'Customer',
        lastName: req.body.billingAddress.lastName || req.body.lastName || 'Guest',
        email: req.body.billingAddress.email || req.body.email,
        address: req.body.billingAddress.address || req.body.address || 'Not provided',
        city: req.body.billingAddress.city || req.body.city || 'Not provided',
        state: req.body.billingAddress.state || '',
        zipCode: req.body.billingAddress.zipCode || req.body.zipCode || '00000',
        country: req.body.billingAddress.country || req.body.country || 'Not provided',
        phone: req.body.billingAddress.phone || req.body.phone || '000-000-0000'
      };
    }

    // Metadata for debugging
    orderData.metadata = {
      originalAmount: parseFloat(amount),
      calculatedAmount: parseFloat(paypalTotal),
      breakdown: {
        item_total: parseFloat(itemTotal),
        shipping: parseFloat(shippingAmount),
        tax: parseFloat(taxAmount),
        discount: parseFloat(discountAmount)
      }
    };

    console.log('📝 Creating order in database with data:', JSON.stringify(orderData, null, 2));

    // Create the order
    const order = await Order.create(orderData);
    console.log('✅ Order created successfully with ID:', order._id);

    // ✅ Return format that PayPal SDK expects
    res.json({
      id: data.id,
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

// ✅ SIMPLE VERSION: Without items (for testing)
router.post('/create-order-simple', validatePaymentRequest, async (req, res) => {
  try {
    const { amount, currency = 'EUR' } = req.body;
    
    console.log('🔄 Creating simple PayPal order:', { amount, currency });

    const token = await getAccessToken();

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

    // Create simple order in database
    const order = await Order.create({
      user: req.user?.id,
      orderNumber: `OL-SIMPLE-${Date.now()}`,
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Simple Order',
        price: parseFloat(amount),
        quantity: 1
      }],
      subtotal: parseFloat(amount),
      shippingCost: 0,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: parseFloat(amount),
      paymentMethod: 'paypal',
      paymentStatus: 'pending',
      status: 'pending',
      paypalOrderId: data.id
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
    const updatedOrder = await Order.findOneAndUpdate(
      { paypalOrderId: orderId },
      { 
        paymentStatus: 'completed',
        status: 'confirmed',
        transactionId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        paidAt: new Date()
      },
      { new: true }
    );

    console.log('✅ PayPal payment captured successfully:', {
      orderId: updatedOrder?._id,
      transactionId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id
    });

    res.json({
      success: true,
      status: 'COMPLETED',
      transactionId: data.purchase_units?.[0]?.payments?.captures?.[0]?.id,
      orderId: data.id,
      databaseOrderId: updatedOrder?._id
    });

  } catch (error) {
    console.error('❌ Capture error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'PayPal routes are working',
    environment: PAYPAL_ENV,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;