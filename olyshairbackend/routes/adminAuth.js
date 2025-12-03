const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const adminAuth = require('../middleware/adminAuth');
const { secret, expiresIn } = require('../config/jwt');

// Admin registration (only for development or by super admin)
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new admin user
    const passwordHash = await bcrypt.hash(password, 12);
    
    const user = new User({
      firstName,
      lastName,
      email,
      passwordHash,
      phoneNumber,
      role: 'admin'
    });

    await user.save();

    // Generate JWT token with consistent payload and secret
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        role: user.role 
      },
      secret, // Use centralized secret
      { expiresIn } // Use centralized expiresIn
    );

    res.status(201).json({
      message: 'Admin registered successfully',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is admin
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Check password
    const isValidPassword = await user.checkPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Use consistent payload and centralized JWT config
    const token = jwt.sign(
      { 
        id: user._id,  // Consistent with auth middleware
        email: user.email,
        role: user.role 
      },
      secret, // Use centralized secret instead of process.env.JWT_SECRET
      { expiresIn } // Use centralized expiresIn instead of hardcoded '24h'
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// 🔍 GET SINGLE ORDER DETAILS (ADMIN)

// Get admin profile
router.get('/profile', adminAuth, async (req, res) => {
  try {
    // The adminAuth middleware already attached the user
    const user = req.user;
    res.json({ 
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        lastLogin: user.lastLogin,
        memberSince: user.memberSince
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE ORDER (ADMIN ONLY - SOFT DELETE)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { hardDelete = false, reason } = req.body;

    // Find the order
    const order = await Order.findOne({ _id: id, isDeleted: false });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if order can be deleted (only cancelled orders)
    if (order.status !== 'cancelled' && !hardDelete) {
      return res.status(400).json({
        success: false,
        error: 'Only cancelled orders can be deleted. Use hardDelete=true to force delete.',
        allowedStatus: 'cancelled',
        currentStatus: order.status
      });
    }

    if (hardDelete) {
      // PERMANENT DELETE (USE WITH CAUTION)
      // Only allow for test orders or very specific cases
      if (req.user.role !== 'super-admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super-admins can perform hard deletes'
        });
      }
      
      await Order.findByIdAndDelete(id);
      console.log(`🔄 Order ${id} permanently deleted by admin ${req.user.id}`);
      
      return res.json({
        success: true,
        message: 'Order permanently deleted',
        warning: 'This action cannot be undone'
      });
    } else {
      // SOFT DELETE (Recommended)
      order.isDeleted = true;
      order.deletedAt = new Date();
      order.deletedBy = req.user.id;
      order.deletionReason = reason || 'Deleted by admin';
      
      await order.save();
      
      return res.json({
        success: true,
        message: 'Order moved to trash (soft deleted)',
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          deletedAt: order.deletedAt,
          canRestore: true
        }
      });
    }

  } catch (error) {
    console.error('❌ Delete order error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete order',
      details: error.message
    });
  }
});

// RESTORE DELETED ORDER (ADMIN)
router.post('/:id/restore', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({ _id: id, isDeleted: true });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Deleted order not found'
      });
    }

    order.isDeleted = false;
    order.deletedAt = null;
    order.deletedBy = null;
    order.deletionReason = null;
    
    await order.save();

    return res.json({
      success: true,
      message: 'Order restored successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status
      }
    });

  } catch (error) {
    console.error('❌ Restore order error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to restore order',
      details: error.message
    });
  }
});

// GET DELETED ORDERS (ADMIN)
router.get('/trash', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const deletedOrders = await Order.find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('user', 'firstName lastName email')
      .populate('deletedBy', 'firstName lastName')
      .select('-__v')
      .lean();

    const total = await Order.countDocuments({ isDeleted: true });

    return res.json({
      success: true,
      orders: deletedOrders,
      pagination: {
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('❌ Get deleted orders error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch deleted orders',
      details: error.message
    });
  }
});

// BULK DELETE ORDERS (ADMIN)
router.post('/bulk-delete', adminAuth, async (req, res) => {
  try {
    const { orderIds, reason } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No order IDs provided'
      });
    }

    // Check if all orders are cancellable
    const orders = await Order.find({
      _id: { $in: orderIds },
      isDeleted: false
    });

    const nonCancellable = orders.filter(order => order.status !== 'cancelled');
    
    if (nonCancellable.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Some orders cannot be deleted (not cancelled)',
        nonCancellable: nonCancellable.map(o => ({
          id: o._id,
          orderNumber: o.orderNumber,
          status: o.status
        }))
      });
    }

    // Perform soft delete
    const result = await Order.updateMany(
      { _id: { $in: orderIds }, isDeleted: false },
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
        deletionReason: reason || 'Bulk deleted by admin'
      }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} orders moved to trash`,
      deletedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Bulk delete orders error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete orders',
      details: error.message
    });
  }
});
module.exports = router;