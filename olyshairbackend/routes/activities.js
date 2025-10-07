const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const adminAuth = require('../middleware/adminAuth');
const auth = require('../middleware/auth'); // ✅ Added

// Debug checks
console.log('🔍 Order model in activities:', typeof Order, Order?.modelName);
console.log('🔍 Order.find in activities:', typeof Order?.find);

// ============================
// DASHBOARD STATS (Admin)
// ============================
router.get('/dashboard-stats', adminAuth, async (req, res) => {
  try {
    console.log('📊 Fetching dashboard stats...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrders = await Order.find({
      createdAt: { $gte: today, $lt: tomorrow },
      status: 'completed'
    });

    const totalSalesToday = todayOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const newOrdersCount = await Order.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } });
    const lowStockProducts = await Product.countDocuments({ stock: { $lt: 10 }, isActive: true });
    const newCustomersCount = await User.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } });

    res.json({
      totalSalesToday,
      newOrdersCount,
      lowStockProducts,
      newCustomersCount
    });
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================
// RECENT ACTIVITIES
// ============================
router.get('/recent-activities', auth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const activities = await Activity.find()
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    res.json({ activities });
  } catch (error) {
    console.error('Recent activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================
// USER ACTIVITIES
// ============================
router.get('/user-activities/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const activities = await Activity.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Activity.countDocuments({ user: userId });
    res.json({
      activities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('User activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================
// SALES ANALYTICS
// ============================
router.get('/sales-analytics', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalSales: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ salesData });
  } catch (error) {
    console.error('Sales analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
