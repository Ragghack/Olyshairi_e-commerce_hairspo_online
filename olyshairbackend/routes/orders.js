const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Add mongoose import
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth'); // Changed from auth to adminAuth

// Add debug logging to verify Order model
console.log('🔍 Order model type in orders:', typeof Order);
console.log('🔍 Order model name in orders:', Order?.modelName);
console.log('🔍 Order.find function:', typeof Order.find);

// Get all orders with filtering and pagination
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
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const orders = await Order.find(filter)
      .populate('user', 'firstName lastName email')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(filter);

    console.log(`📦 Found ${orders.length} orders`);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('❌ Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single order
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'firstName lastName email phoneNumber')
      .populate('items.product');
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({ order });
  } catch (error) {
    console.error('❌ Get order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status
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

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete order (soft delete)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('❌ Delete order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order statistics
router.get('/stats/overview', adminAuth, async (req, res) => {
  try {
    console.log('📊 Fetching order statistics...');
    
    const totalOrders = await Order.countDocuments({ isDeleted: false });
    const pendingOrders = await Order.countDocuments({ 
      status: 'pending', 
      isDeleted: false 
    });
    const completedOrders = await Order.countDocuments({ 
      status: 'delivered', 
      isDeleted: false 
    });
    
    const totalRevenueResult = await Order.aggregate([
      { 
        $match: { 
          status: 'delivered', 
          isDeleted: false 
        } 
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    console.log('📊 Order stats calculated:', {
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue: totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0
    });

    res.json({
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue: totalRevenueResult.length > 0 ? totalRevenueResult[0].total : 0
    });
  } catch (error) {
    console.error('❌ Order stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mock data for development (fallback if Order model fails)
router.get('/mock/orders', adminAuth, async (req, res) => {
  try {
    console.log('🎭 Using mock orders data...');
    
    const mockOrders = [
      {
        _id: '1',
        orderNumber: 'OL-2874',
        user: {
          firstName: 'Roseu',
          lastName: 'User',
          email: 'roseu@example.com'
        },
        status: 'delivered',
        totalAmount: 199.99,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        items: [
          {
            product: {
              name: 'Brazilian Body Wave'
            },
            quantity: 1,
            price: 199.99
          }
        ]
      },
      {
        _id: '2',
        orderNumber: 'OL-2861',
        user: {
          firstName: 'Sarah',
          lastName: 'User',
          email: 'sarah@example.com'
        },
        status: 'processing',
        totalAmount: 259.99,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        items: [
          {
            product: {
              name: 'Peruvian Straight'
            },
            quantity: 1,
            price: 199.99
          },
          {
            product: {
              name: 'Hair Care Kit'
            },
            quantity: 1,
            price: 60.00
          }
        ]
      },
      {
        _id: '3',
        orderNumber: 'OL-2843',
        user: {
          firstName: 'Michael',
          lastName: 'User',
          email: 'michael@example.com'
        },
        status: 'shipped',
        totalAmount: 179.99,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        items: [
          {
            product: {
              name: 'Malaysian Curly'
            },
            quantity: 1,
            price: 179.99
          }
        ]
      }
    ];

    res.json({
      orders: mockOrders,
      totalPages: 1,
      currentPage: 1,
      total: mockOrders.length
    });
  } catch (error) {
    console.error('❌ Mock orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test route to verify Order model
router.get('/test/model', adminAuth, async (req, res) => {
  try {
    console.log('🧪 Testing Order model...');
    
    // Test if Order model is working
    const testOrder = new Order({
      orderNumber: 'TEST-001',
      user: req.user._id, // Use current admin user
      items: [{
        product: '507f1f77bcf86cd799439011', // Mock product ID
        quantity: 1,
        price: 99.99
      }],
      totalAmount: 99.99,
      status: 'pending',
      paymentMethod: 'credit_card'
    });

    // Just test creation without saving
    const isValid = testOrder.validateSync();
    
    if (isValid) {
      return res.json({
        success: false,
        error: 'Order validation failed',
        details: isValid.errors
      });
    }

    res.json({
      success: true,
      message: 'Order model is working correctly',
      modelType: typeof Order,
      modelName: Order.modelName,
      hasFind: typeof Order.find === 'function',
      hasCreate: typeof Order.create === 'function'
    });
  } catch (error) {
    console.error('❌ Order model test error:', error);
    res.json({
      success: false,
      error: error.message,
      modelType: typeof Order
    });
  }
});

module.exports = router;