const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const adminAuth = require('../middleware/adminAuth');
const auth = require('../middleware/auth');

// ===== Debug Info on Load =====
console.log('🔍 [OrderRoute] Model type:', typeof Order);
console.log('🔍 [OrderRoute] Model name:', Order?.modelName);
console.log('🔍 [OrderRoute] Has .find():', typeof Order.find === 'function');

// ===============================
// 📊 GET ORDER STATISTICS (must come before /:id)
// ===============================
router.get('/stats/overview', adminAuth, async (req, res) => {
  try {
    console.log('📊 Calculating order statistics...');
    
    const [totalOrders, pendingOrders, completedOrders, cancelledOrders] = await Promise.all([
      Order.countDocuments({ isDeleted: false }),
      Order.countDocuments({ status: 'pending', isDeleted: false }),
      Order.countDocuments({ status: 'delivered', isDeleted: false }),
      Order.countDocuments({ status: 'cancelled', isDeleted: false })
    ]);

    // Revenue by status
    const revenueStats = await Order.aggregate([
      { $match: { isDeleted: false } },
      { 
        $group: { 
          _id: '$status',
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Monthly revenue for charts
    const monthlyRevenue = await Order.aggregate([
      { 
        $match: { 
          status: 'delivered', 
          isDeleted: false,
          createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) }
        } 
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Popular products
    const popularProducts = await Order.aggregate([
      { $match: { isDeleted: false } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' }
    ]);

    const totalRevenue = revenueStats.find(stat => stat._id === 'delivered')?.total || 0;

    return res.json({
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
      revenueStats,
      monthlyRevenue,
      popularProducts
    });
  } catch (error) {
    console.error('❌ Order stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 📦 GET ALL ORDERS (Paginated with Advanced Filtering)
// ===============================
router.get('/', adminAuth, async (req, res) => {
  try {
    console.log('📦 Fetching orders with filters...');
    
    const {
      page = 1,
      limit = 10,
      status,
      paymentMethod,
      dateFrom,
      dateTo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = { isDeleted: false };
    
    // Status filter
    if (status && status !== 'all') filter.status = status;
    
    // Payment method filter
    if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;
    
    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    
    // Search filter (order number, customer name, email)
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'user.firstName': { $regex: search, $options: 'i' } },
        { 'user.lastName': { $regex: search, $options: 'i' } },
        { 'user.email': { $regex: search, $options: 'i' } }
      ];
    }

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('user', 'firstName lastName email phoneNumber avatar')
        .populate('items.product', 'name images category')
        .sort(sort)
        .limit(parseInt(limit))
        .skip((page - 1) * limit)
        .lean(),
      Order.countDocuments(filter)
    ]);

    console.log(`✅ Found ${orders.length} orders.`);

    return res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Get orders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 🔍 GET SINGLE ORDER WITH ENHANCED DETAILS
// ===============================
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phoneNumber address')
      .populate('items.product', 'name images category description');

    if (!order)
      return res.status(404).json({ error: 'Order not found' });

    // Check if user is authorized to view this order
    const isAdmin = req.user.role === 'admin';
    const isOwner = order.user._id.toString() === req.user.id;
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    return res.json({ order });
  } catch (error) {
    console.error('❌ Get order error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 👤 GET USER ORDERS (Customer Dashboard)
// ===============================
router.get('/user/my-orders', auth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc' 
    } = req.query;

    const filter = { 
      user: req.user.id, 
      isDeleted: false 
    };
    
    if (status && status !== 'all') filter.status = status;

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('items.product', 'name images category')
        .sort(sort)
        .limit(parseInt(limit))
        .skip((page - 1) * limit)
        .lean(),
      Order.countDocuments(filter)
    ]);

    return res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('❌ Get user orders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 👤 GET USER ORDER COUNT (For Shop Page)
// ===============================
router.get('/user/count', auth, async (req, res) => {
  try {
    const count = await Order.countDocuments({ 
      user: req.user.id, 
      isDeleted: false 
    });

    return res.json({ count });
  } catch (error) {
    console.error('❌ Get user order count error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 🛒 CREATE NEW ORDER (Checkout Process)
// ===============================
router.post('/', auth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      items,
      shippingAddress,
      billingAddress,
      paymentMethod,
      paymentStatus = 'pending',
      shippingMethod,
      notes
    } = req.body;

    console.log('🛒 Creating new order for user:', req.user.id);

    // Validate items and calculate total
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(400).json({ error: `Product not found: ${item.productId}` });
      }

      if (product.stock < item.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.stock}` 
        });
      }

      // Update product stock
      product.stock -= item.quantity;
      await product.save({ session });

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        image: product.images?.[0]?.url || product.image
      });
    }

    // Add shipping cost
    const shippingCost = calculateShippingCost(shippingMethod, totalAmount);
    totalAmount += shippingCost;

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Create order
    const order = new Order({
      orderNumber,
      user: req.user.id,
      items: orderItems,
      totalAmount,
      shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      paymentMethod,
      paymentStatus,
      shippingMethod,
      shippingCost,
      notes,
      status: 'pending'
    });

    await order.save({ session });
    await session.commitTransaction();

    console.log(`✅ Order created successfully: ${order.orderNumber}`);

    // Populate order for response
    const populatedOrder = await Order.findById(order._id)
      .populate('user', 'firstName lastName email')
      .populate('items.product', 'name images');

    return res.status(201).json({
      message: 'Order created successfully',
      order: populatedOrder
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Create order error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    session.endSession();
  }
});

// ===============================
// 🚚 UPDATE ORDER STATUS WITH NOTIFICATIONS
// ===============================
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, trackingNumber, adminNotes } = req.body;

    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phoneNumber');

    if (!order)
      return res.status(404).json({ error: 'Order not found' });

    // Update order status
    order.status = status;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (adminNotes) order.adminNotes = adminNotes;
    
    // Set delivered date if status is delivered
    if (status === 'delivered') {
      order.deliveredAt = new Date();
    }

    await order.save();

    // TODO: Send notification to user (email, push, etc.)
    console.log(`📧 Order status updated: ${order.orderNumber} -> ${status}`);

    return res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('❌ Update order status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 💰 UPDATE PAYMENT STATUS
// ===============================
router.put('/:id/payment-status', adminAuth, async (req, res) => {
  try {
    const { paymentStatus, transactionId } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        paymentStatus,
        ...(transactionId && { transactionId })
      },
      { new: true }
    ).populate('user', 'firstName lastName email');

    if (!order)
      return res.status(404).json({ error: 'Order not found' });

    return res.json({
      message: 'Payment status updated successfully',
      order
    });
  } catch (error) {
    console.error('❌ Update payment status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 📦 BULK ORDER STATUS UPDATE
// ===============================
router.put('/bulk/status', adminAuth, async (req, res) => {
  try {
    const { orderIds, status, trackingNumber } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Order IDs are required' });
    }

    const updateData = { status };
    if (trackingNumber) updateData.trackingNumber = trackingNumber;

    const result = await Order.updateMany(
      { _id: { $in: orderIds }, isDeleted: false },
      updateData
    );

    return res.json({
      message: `Updated ${result.modifiedCount} orders successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('❌ Bulk update order status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 🗑️ SOFT DELETE ORDER
// ===============================
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { 
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id
      },
      { new: true }
    );

    if (!order)
      return res.status(404).json({ error: 'Order not found' });

    return res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('❌ Delete order error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 🔄 CANCEL ORDER (User & Admin)
// ===============================
router.put('/:id/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order)
      return res.status(404).json({ error: 'Order not found' });

    // Check authorization
    const isAdmin = req.user.role === 'admin';
    const isOwner = order.user.toString() === req.user.id;
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if order can be cancelled
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ 
        error: `Order cannot be cancelled in ${order.status} status` 
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    if (isAdmin) order.cancelledBy = req.user.id;

    await order.save();

    // Restore product stock
    await restoreProductStock(order.items);

    return res.json({
      message: 'Order cancelled successfully',
      order
    });
  } catch (error) {
    console.error('❌ Cancel order error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 📈 ORDER ANALYTICS
// ===============================
router.get('/analytics/dashboard', adminAuth, async (req, res) => {
  try {
    const { period = 'month' } = req.query; // day, week, month, year
    
    const dateRange = getDateRange(period);
    
    const analytics = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange.start, $lte: dateRange.end },
          isDeleted: false
        }
      },
      {
        $facet: {
          // Revenue trends
          revenueTrend: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                },
                revenue: { $sum: "$totalAmount" },
                orders: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],
          // Status distribution
          statusDistribution: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                revenue: { $sum: "$totalAmount" }
              }
            }
          ],
          // Payment method distribution
          paymentMethods: [
            {
              $group: {
                _id: "$paymentMethod",
                count: { $sum: 1 },
                revenue: { $sum: "$totalAmount" }
              }
            }
          ],
          // Top customers
          topCustomers: [
            {
              $group: {
                _id: "$user",
                orderCount: { $sum: 1 },
                totalSpent: { $sum: "$totalAmount" }
              }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "user"
              }
            }
          ]
        }
      }
    ]);

    return res.json(analytics[0]);
  } catch (error) {
    console.error('❌ Order analytics error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 🎭 MOCK ORDERS (development)
// ===============================
router.get('/mock/orders', adminAuth, (req, res) => {
  console.log('🎭 Serving mock orders data...');
  
  const mockOrders = [
    {
      _id: '1',
      orderNumber: 'OL-2874',
      user: { 
        firstName: 'Rose', 
        lastName: 'Wilson', 
        email: 'rose@example.com',
        avatar: '/images/avatars/1.jpg'
      },
      status: 'delivered',
      paymentMethod: 'credit_card',
      paymentStatus: 'paid',
      totalAmount: 199.99,
      shippingCost: 9.99,
      createdAt: new Date('2024-01-15'),
      deliveredAt: new Date('2024-01-20'),
      items: [
        { 
          product: { 
            name: 'Brazilian Body Wave',
            images: ['/images/products/brazilian-wave.jpg'],
            category: 'extensions'
          }, 
          quantity: 1, 
          price: 199.99 
        }
      ],
      shippingAddress: {
        firstName: 'Rose',
        lastName: 'Wilson',
        address: '123 Main St',
        city: 'New York',
        zipCode: '10001',
        country: 'USA'
      }
    },
    {
      _id: '2',
      orderNumber: 'OL-2861',
      user: { 
        firstName: 'Sarah', 
        lastName: 'Johnson', 
        email: 'sarah@example.com',
        avatar: '/images/avatars/2.jpg'
      },
      status: 'processing',
      paymentMethod: 'paypal',
      paymentStatus: 'paid',
      totalAmount: 259.99,
      shippingCost: 9.99,
      createdAt: new Date('2024-01-14'),
      items: [
        { 
          product: { 
            name: 'Peruvian Straight',
            images: ['/images/products/peruvian-straight.jpg'],
            category: 'extensions'
          }, 
          quantity: 1, 
          price: 199.99 
        },
        { 
          product: { 
            name: 'Hair Care Kit',
            images: ['/images/products/hair-care-kit.jpg'],
            category: 'accessories'
          }, 
          quantity: 1, 
          price: 60.00 
        }
      ],
      shippingAddress: {
        firstName: 'Sarah',
        lastName: 'Johnson',
        address: '456 Oak Ave',
        city: 'Los Angeles',
        zipCode: '90210',
        country: 'USA'
      }
    }
  ];

  return res.json({
    orders: mockOrders,
    totalPages: 1,
    currentPage: 1,
    total: mockOrders.length
  });
});

// ===============================
// 🧪 TEST MODEL INTEGRITY
// ===============================
router.get('/test/model', adminAuth, async (req, res) => {
  try {
    console.log('🧪 Testing Order model integrity...');
    
    const testOrder = new Order({
      orderNumber: 'TEST-001',
      user: new mongoose.Types.ObjectId(),
      items: [{
        product: new mongoose.Types.ObjectId(),
        quantity: 1,
        price: 99.99
      }],
      totalAmount: 99.99,
      paymentMethod: 'credit_card',
      shippingAddress: {
        firstName: 'Test',
        lastName: 'User',
        address: '123 Test St',
        city: 'Test City',
        zipCode: '12345',
        country: 'Test Country'
      }
    });

    const validationError = testOrder.validateSync();
    if (validationError) {
      return res.json({
        success: false,
        error: 'Validation failed',
        details: validationError.errors
      });
    }

    return res.json({
      success: true,
      message: 'Order model works correctly',
      modelName: Order.modelName
    });
  } catch (error) {
    console.error('❌ Order model test error:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
});

// ===============================
// 🔧 UTILITY FUNCTIONS
// ===============================

// Generate unique order number
async function generateOrderNumber() {
  const today = new Date();
  const dateString = today.getFullYear() + 
                    String(today.getMonth() + 1).padStart(2, '0') + 
                    String(today.getDate()).padStart(2, '0');
  
  const lastOrder = await Order.findOne(
    { orderNumber: new RegExp(`^OL-${dateString}`) },
    {},
    { sort: { createdAt: -1 } }
  );

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.split('-')[2]) || 0;
    sequence = lastSequence + 1;
  }

  return `OL-${dateString}-${String(sequence).padStart(3, '0')}`;
}

// Calculate shipping cost
function calculateShippingCost(method, orderAmount) {
  const shippingRates = {
    standard: 9.99,
    express: 19.99,
    overnight: 29.99
  };

  // Free shipping for orders over $200
  if (orderAmount > 200) {
    return 0;
  }

  return shippingRates[method] || 9.99;
}

// Restore product stock when order is cancelled
async function restoreProductStock(items) {
  for (const item of items) {
    await Product.findByIdAndUpdate(
      item.product,
      { $inc: { stock: item.quantity } }
    );
  }
}

// Get date range for analytics
function getDateRange(period) {
  const now = new Date();
  let start = new Date();

  switch (period) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setMonth(now.getMonth() - 1);
  }

  return { start, end: now };
}

module.exports = router;