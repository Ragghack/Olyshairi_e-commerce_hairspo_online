// routes/adminUsers.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const adminAuth = require('../middleware/adminAuth');

// GET ALL USERS (ADMIN)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      role, 
      search,
      isSuspended 
    } = req.query;

    // Build filter
    const filter = {};
    
    if (role && role !== 'all') {
      filter.role = role;
    }
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isSuspended !== undefined) {
      filter.isSuspended = isSuspended === 'true';
    }

    const options = {
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
      sort: { createdAt: -1 }
    };

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip(options.skip)
        .select('-passwordHash -__v')
        .lean(),
      User.countDocuments(filter)
    ]);

    // Get order and booking counts for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const [orderCount, bookingCount] = await Promise.all([
        require('../models/Order').countDocuments({ user: user._id }),
        require('../models/Booking').countDocuments({ user: user._id })
      ]);
      
      return {
        ...user,
        orderCount,
        bookingCount
      };
    }));

    return res.json({
      success: true,
      users: usersWithStats,
      pagination: {
        totalPages: Math.ceil(total / options.limit),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / options.limit),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('❌ Admin get users error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch users',
      details: error.message 
    });
  }
});

// GET USER DETAILS (ADMIN)
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-passwordHash -__v')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user statistics
    const [orderCount, bookingCount] = await Promise.all([
      require('../models/Order').countDocuments({ user: user._id }),
      require('../models/Booking').countDocuments({ user: user._id })
    ]);

    const userWithStats = {
      ...user,
      orderCount,
      bookingCount
    };

    return res.json({
      success: true,
      user: userWithStats
    });

  } catch (error) {
    console.error('❌ Get user details error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch user details',
      details: error.message
    });
  }
});

// UPDATE USER STATUS (SUSPEND/ACTIVATE)
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { isSuspended, reason } = req.body;

    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if trying to suspend another admin (only super-admin can do this)
    if (isSuspended && user.role === 'admin' && req.user.role !== 'super-admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super-admins can suspend other admins'
      });
    }

    user.isSuspended = isSuspended;
    user.suspensionReason = isSuspended ? (reason || 'Suspended by admin') : null;
    user.suspendedAt = isSuspended ? new Date() : null;
    user.suspendedBy = isSuspended ? req.user.id : null;

    await user.save();

    return res.json({
      success: true,
      message: `User ${isSuspended ? 'suspended' : 'activated'} successfully`,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuspended: user.isSuspended,
        suspensionReason: user.suspensionReason,
        suspendedAt: user.suspendedAt
      }
    });

  } catch (error) {
    console.error('❌ Update user status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update user status',
      details: error.message
    });
  }
});

// UPDATE USER DETAILS (ADMIN)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, address, role, notes, isSuspended } = req.body;

    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update basic info
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (address !== undefined) user.address = address;
    if (notes !== undefined) user.notes = notes;

    // Handle role changes (only super-admin can change roles)
    if (role && req.user.role === 'super-admin') {
      user.role = role;
    }

    // Handle suspension
    if (isSuspended !== undefined) {
      // Check permissions
      if (user.role === 'admin' && req.user.role !== 'super-admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super-admins can suspend other admins'
        });
      }

      user.isSuspended = isSuspended;
      if (isSuspended) {
        user.suspendedAt = new Date();
        user.suspendedBy = req.user.id;
        user.suspensionReason = req.body.suspensionReason || 'Suspended by admin';
      } else {
        user.suspendedAt = null;
        user.suspendedBy = null;
        user.suspensionReason = null;
      }
    }

    await user.save();

    const updatedUser = await User.findById(id)
      .select('-passwordHash -__v')
      .lean();

    return res.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('❌ Update user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update user',
      details: error.message
    });
  }
});

module.exports = router;