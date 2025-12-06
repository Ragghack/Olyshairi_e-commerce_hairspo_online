const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');

// Get user bookings
router.get('/', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get all bookings (admin)
router.get('/all', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const bookings = await Booking.find()
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, bookings });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Create new booking
router.post('/', auth, async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, wigCount, notes } = req.body;

    const booking = new Booking({
      userId: req.user.id,
      customerName,
      customerEmail,
      customerPhone,
      wigCount: parseInt(wigCount),
      notes,
      status: 'pending'
    });

    await booking.save();

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Update booking status (admin)
router.put('/:id/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { status, estimatedCompletion } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status, estimatedCompletion },
      { new: true }
    ).populate('userId', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ success: true, booking });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

// Get booking statistics
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ status: 'pending' });
    const completedBookings = await Booking.countDocuments({ status: 'completed' });
    const revenue = await Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalBookings,
        pendingBookings,
        completedBookings,
        totalRevenue: revenue[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get booking stats error:', error);
    res.status(500).json({ error: 'Failed to fetch booking statistics' });
  }
});
// DELETE BOOKING (ADMIN ONLY)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }

    const { id } = req.params;
    const { hardDelete = false, reason } = req.body;

    // Find the booking
    const booking = await Booking.findById(id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if booking can be deleted (only cancelled bookings)
    if (booking.status !== 'cancelled' && !hardDelete) {
      return res.status(400).json({
        success: false,
        error: 'Only cancelled bookings can be deleted. Use hardDelete=true to force delete.',
        allowedStatus: 'cancelled',
        currentStatus: booking.status
      });
    }

    if (hardDelete) {
      // PERMANENT DELETE
      // Add additional checks for permanent deletion
      if (booking.status === 'completed' && req.user.role !== 'super-admin') {
        return res.status(403).json({
          success: false,
          error: 'Only super-admins can delete completed bookings'
        });
      }
      
      await Booking.findByIdAndDelete(id);
      console.log(`🔄 Booking ${id} permanently deleted by admin ${req.user.id}`);
      
      return res.json({
        success: true,
        message: 'Booking permanently deleted',
        warning: 'This action cannot be undone'
      });
    } else {
      // SOFT DELETE (Recommended)
      booking.isDeleted = true;
      booking.deletedAt = new Date();
      booking.deletedBy = req.user.id;
      booking.deletionReason = reason || 'Deleted by admin';
      
      await booking.save();
      
      return res.json({
        success: true,
        message: 'Booking moved to trash (soft deleted)',
        booking: {
          id: booking._id,
          customerName: booking.customerName,
          status: booking.status,
          deletedAt: booking.deletedAt,
          canRestore: true
        }
      });
    }

  } catch (error) {
    console.error('❌ Delete booking error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete booking',
      details: error.message
    });
  }
});

// RESTORE DELETED BOOKING (ADMIN)
router.post('/:id/restore', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }

    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, isDeleted: true });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Deleted booking not found'
      });
    }

    booking.isDeleted = false;
    booking.deletedAt = null;
    booking.deletedBy = null;
    booking.deletionReason = null;
    
    await booking.save();

    return res.json({
      success: true,
      message: 'Booking restored successfully',
      booking: {
        id: booking._id,
        customerName: booking.customerName,
        status: booking.status,
        wigCount: booking.wigCount
      }
    });

  } catch (error) {
    console.error('❌ Restore booking error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to restore booking',
      details: error.message
    });
  }
});

// GET DELETED BOOKINGS (ADMIN)
router.get('/trash', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }

    const { page = 1, limit = 20 } = req.query;

    const deletedBookings = await Booking.find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('userId', 'firstName lastName email')
      .populate('deletedBy', 'firstName lastName')
      .select('-__v')
      .lean();

    const total = await Booking.countDocuments({ isDeleted: true });

    return res.json({
      success: true,
      bookings: deletedBookings,
      pagination: {
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('❌ Get deleted bookings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch deleted bookings',
      details: error.message
    });
  }
});

// BULK DELETE BOOKINGS (ADMIN)
router.post('/bulk-delete', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. Admin privileges required.' 
      });
    }

    const { bookingIds, reason } = req.body;

    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No booking IDs provided'
      });
    }

    // Check if all bookings are cancellable
    const bookings = await Booking.find({
      _id: { $in: bookingIds },
      isDeleted: false
    });

    const nonCancellable = bookings.filter(booking => booking.status !== 'cancelled');
    
    if (nonCancellable.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Some bookings cannot be deleted (not cancelled)',
        nonCancellable: nonCancellable.map(b => ({
          id: b._id,
          customerName: b.customerName,
          status: b.status
        }))
      });
    }

    // Perform soft delete
    const result = await Booking.updateMany(
      { _id: { $in: bookingIds }, isDeleted: false },
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id,
        deletionReason: reason || 'Bulk deleted by admin'
      }
    );

    return res.json({
      success: true,
      message: `${result.modifiedCount} bookings moved to trash`,
      deletedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Bulk delete bookings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete bookings',
      details: error.message
    });
  }
});

// In bookings.js
const notificationService = require('../services/notificationService');

// In create booking endpoint
router.post('/', auth, async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, wigCount, notes } = req.body;

    const booking = new Booking({
      userId: req.user.id,
      customerName,
      customerEmail,
      customerPhone,
      wigCount: parseInt(wigCount),
      notes,
      status: 'pending'
    });

    await booking.save();

    // Send notification and email
    await notificationService.createNotification(req.user.id, {
      type: 'booking',
      title: 'Booking Request Submitted',
      message: `Your wig service booking for ${wigCount} wig(s) has been submitted`,
      data: { booking: booking.toObject() },
      priority: 'high',
      metadata: {
        bookingId: booking._id,
        actionUrl: `/customerdashboard.html?section=bookings&booking=${booking._id}`,
        actionText: 'View Booking'
      },
      emailSubject: 'Wig Service Booking Confirmation',
      sendEmail: true
    });

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      booking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// In update booking status endpoint
router.put('/:id/status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { status, estimatedCompletion, notifyCustomer = true, statusMessage } = req.body;
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status, estimatedCompletion },
      { new: true }
    ).populate('userId', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Send notification if requested
    if (notifyCustomer !== false) {
      await notificationService.sendBookingStatusUpdate(
        booking,
        status,
        statusMessage || `Your booking status has been updated to: ${status}`
      );
    }

    res.json({ success: true, booking });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
});

module.exports = router;