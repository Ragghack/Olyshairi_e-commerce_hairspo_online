const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth');

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
    
    const [totalOrders, pendingOrders, completedOrders] = await Promise.all([
      Order.countDocuments({ isDeleted: false }),
      Order.countDocuments({ status: 'pending', isDeleted: false }),
      Order.countDocuments({ status: 'delivered', isDeleted: false })
    ]);

    const revenue = await Order.aggregate([
      { $match: { status: 'delivered', isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const totalRevenue = revenue.length ? revenue[0].total : 0;

    return res.json({
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue
    });
  } catch (error) {
    console.error('❌ Order stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 📦 GET ALL ORDERS (Paginated)
// ===============================
router.get('/', adminAuth, async (req, res) => {
  try {
    console.log('📦 Fetching orders...');
    
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = { isDeleted: false };
    if (status && status !== 'all') filter.status = status;

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('user', 'firstName lastName email')
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
// 🔍 GET SINGLE ORDER
// ===============================
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('items.product');

    if (!order)
      return res.status(404).json({ error: 'Order not found' });

    return res.json({ order });
  } catch (error) {
    console.error('❌ Get order error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===============================
// 🚚 UPDATE ORDER STATUS
// ===============================
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, trackingNumber } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status,
        ...(trackingNumber && { trackingNumber })
      },
      { new: true }
    ).populate('user', 'firstName lastName email');

    if (!order)
      return res.status(404).json({ error: 'Order not found' });

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
// 🗑️ SOFT DELETE ORDER
// ===============================
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
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
// 🎭 MOCK ORDERS (development)
// ===============================
router.get('/mock/orders', adminAuth, (req, res) => {
  console.log('🎭 Serving mock orders data...');
  
  const mockOrders = [
    {
      _id: '1',
      orderNumber: 'OL-2874',
      user: { firstName: 'Roseu', lastName: 'User', email: 'roseu@example.com' },
      status: 'delivered',
      totalAmount: 199.99,
      createdAt: new Date(),
      items: [{ product: { name: 'Brazilian Body Wave' }, quantity: 1, price: 199.99 }]
    },
    {
      _id: '2',
      orderNumber: 'OL-2861',
      user: { firstName: 'Sarah', lastName: 'User', email: 'sarah@example.com' },
      status: 'processing',
      totalAmount: 259.99,
      createdAt: new Date(),
      items: [
        { product: { name: 'Peruvian Straight' }, quantity: 1, price: 199.99 },
        { product: { name: 'Hair Care Kit' }, quantity: 1, price: 60.00 }
      ]
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
      paymentMethod: 'credit_card'
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

module.exports = router;
