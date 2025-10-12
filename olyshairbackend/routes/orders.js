// routes/orders.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken')
// ===== Debug Info on Load =====
console.log('🔍 [OrdersRoute] Route loaded successfully');

// ===============================
// 📦 GET USER ORDERS
// ===============================
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    console.log('📦 Fetching user orders for:', req.user.id);

    const filter = { user: req.user.id, isDeleted: false };
    
    // Status filter
    if (status && status !== 'all') {
      filter.status = status;
    }

    const options = {
      sort: { createdAt: -1 },
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip(options.skip)
        .select('-__v')
        .lean(),
      Order.countDocuments(filter)
    ]);

    console.log(`✅ Found ${orders.length} orders for user`);

    return res.json({
      success: true,
      orders,
      pagination: {
        totalPages: Math.ceil(total / options.limit),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / options.limit),
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('❌ Get user orders error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// ===============================
// 🔍 GET SINGLE ORDER
// ===============================
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 Fetching order:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid order ID format' 
      });
    }

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user.id,
      isDeleted: false 
    })
    .populate('items.product', 'name images sku')
    .select('-__v')
    .lean();

    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }

    console.log('✅ Order found:', order.orderNumber);
    return res.json({
      success: true,
      order
    });
  } catch (error) {
    console.error('❌ Get order error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order',
      details: error.message 
    });
  }
});

// ===============================
// ➕ CREATE NEW ORDER
// ===============================
router.post('/', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orderData = req.body;
    
    console.log('➕ Creating new order for user:', req.user.id);

    // Validate required fields
    const requiredFields = ['items', 'shippingAddress', 'paymentMethod', 'totalAmount'];
    const missingFields = requiredFields.filter(field => !orderData[field]);
    
    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Validate items and check stock
    for (const item of orderData.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: `Product not found: ${item.product}` 
        });
      }

      if (!product.isActive) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: `Product is not available: ${product.name}` 
        });
      }

      if (product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}` 
        });
      }

      // Update product stock
      product.stock -= item.quantity;
      product.salesCount += item.quantity;
      await product.save({ session });
    }

    // Create order
    const order = new Order({
      ...orderData,
      user: req.user.id,
      shippingAddress: orderData.shippingAddress,
      billingAddress: orderData.billingAddress || orderData.shippingAddress
    });

    await order.save({ session });
    await session.commitTransaction();

    console.log(`✅ Order created successfully: ${order.orderNumber}`);
    
    // Populate the created order
    const populatedOrder = await Order.findById(order._id)
      .populate('items.product', 'name images sku')
      .select('-__v')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: populatedOrder
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Create order error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: errors 
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: 'Failed to create order',
      details: error.message 
    });
  } finally {
    session.endSession();
  }
});

// ===============================
// ✏️ UPDATE ORDER STATUS (User can cancel if pending)
// ===============================
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log('✏️ Updating order status:', { id, status });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid order ID format' 
      });
    }

    // Users can only cancel their own orders
    if (status !== 'cancelled') {
      return res.status(403).json({ 
        success: false,
        error: 'You can only cancel orders' 
      });
    }

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user.id,
      isDeleted: false 
    });

    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }

    // Check if order can be cancelled
    if (!order.canBeCancelled()) {
      return res.status(400).json({ 
        success: false,
        error: 'Order cannot be cancelled at this stage' 
      });
    }

    // Update order status
    order.status = 'cancelled';
    order.paymentStatus = 'cancelled';
    order.cancelledAt = new Date();
    
    await order.save();

    console.log(`✅ Order cancelled: ${order.orderNumber}`);

    return res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status
      }
    });

  } catch (error) {
    console.error('❌ Update order status error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to update order status',
      details: error.message 
    });
  }
});

// ===============================
// 📧 GET ORDER INVOICE
// ===============================
router.get('/:id/invoice', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📧 Generating invoice for order:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid order ID format' 
      });
    }

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user.id,
      isDeleted: false 
    })
    .populate('user', 'firstName lastName email phone')
    .select('-__v')
    .lean();

    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }

    // Generate invoice data
    const invoice = {
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      status: order.status,
      customer: order.user ? {
        name: `${order.user.firstName} ${order.user.lastName}`,
        email: order.user.email,
        phone: order.user.phone
      } : {
        name: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
        email: order.guestEmail,
        phone: order.shippingAddress.phone
      },
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      items: order.items,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    };

    console.log('✅ Invoice generated for:', order.orderNumber);
    return res.json({
      success: true,
      invoice
    });

  } catch (error) {
    console.error('❌ Get invoice error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to generate invoice',
      details: error.message 
    });
  }
});

// ===============================
// 🔄 REORDER FUNCTIONALITY
// ===============================
router.post('/:id/reorder', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    
    console.log('🔄 Reordering:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false,
        error: 'Invalid order ID format' 
      });
    }

    const originalOrder = await Order.findOne({ 
      _id: id, 
      user: req.user.id,
      isDeleted: false 
    }).session(session);

    if (!originalOrder) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }

    // Check stock for all items
    for (const item of originalOrder.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product || !product.isActive || product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          error: `Product ${product?.name || 'Unknown'} is not available for reorder` 
        });
      }
    }

    // Create new order based on original order
    const newOrder = new Order({
      user: req.user.id,
      items: originalOrder.items.map(item => ({
        product: item.product,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image,
        sku: item.sku
      })),
      shippingAddress: originalOrder.shippingAddress,
      billingAddress: originalOrder.billingAddress,
      shippingMethod: originalOrder.shippingMethod,
      paymentMethod: originalOrder.paymentMethod,
      subtotal: originalOrder.subtotal,
      shippingCost: originalOrder.shippingCost,
      taxAmount: originalOrder.taxAmount,
      discountAmount: 0, // Reset discount for reorder
      totalAmount: originalOrder.subtotal + originalOrder.shippingCost + originalOrder.taxAmount
    });

    // Update product stock
    for (const item of originalOrder.items) {
      const product = await Product.findById(item.product).session(session);
      product.stock -= item.quantity;
      product.salesCount += item.quantity;
      await product.save({ session });
    }

    await newOrder.save({ session });
    await session.commitTransaction();

    console.log(`✅ Reorder created: ${newOrder.orderNumber} from ${originalOrder.orderNumber}`);

    const populatedOrder = await Order.findById(newOrder._id)
      .populate('items.product', 'name images sku')
      .select('-__v')
      .lean();

    return res.status(201).json({
      success: true,
      message: 'Reorder created successfully',
      order: populatedOrder
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Reorder error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to create reorder',
      details: error.message 
    });
  } finally {
    session.endSession();
  }
});

// ===============================
// 🧪 TEST ORDERS ENDPOINT
// ===============================
router.get('/test/endpoint', auth, (req, res) => {
  return res.json({
    success: true,
    message: 'Orders endpoint is working!',
    user: req.user.id,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;