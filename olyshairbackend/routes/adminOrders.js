// routes/adminOrders.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth');

// GET ALL ORDERS (ADMIN)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      startDate, 
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = { isDeleted: false };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.email': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const options = {
      sort,
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip(options.skip)
        .populate('user', 'firstName lastName email phone')
        .populate('items.product', 'name images sku price')
        .select('-__v')
        .lean(),
      Order.countDocuments(filter)
    ]);

    // Format orders for admin display
    const formattedOrders = orders.map(order => ({
      ...order,
      customerName: order.user 
        ? `${order.user.firstName} ${order.user.lastName}`
        : `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
      customerEmail: order.user ? order.user.email : order.shippingAddress.email,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0)
    }));

    return res.json({
      success: true,
      orders: formattedOrders,
      pagination: {
        totalPages: Math.ceil(total / options.limit),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / options.limit),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('❌ Admin get orders error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// GET ORDER STATISTICS (ADMIN)
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'today':
        dateFilter = { createdAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) } };
        break;
      case '7days':
        dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 7)) } };
        break;
      case '30days':
        dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 30)) } };
        break;
      case '90days':
        dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 90)) } };
        break;
    }

    const stats = await Order.aggregate([
      { $match: { ...dateFilter, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          processingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      pendingOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0
    };

    return res.json({
      success: true,
      stats: result,
      period
    });

  } catch (error) {
    console.error('❌ Admin order stats error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order statistics',
      details: error.message 
    });
  }
});

// ADD TO YOUR adminOrders.js
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await Order.findOne({ _id: id, isDeleted: false });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Update order status
    order.status = status;
    
    // Add status history
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: status,
      changedAt: new Date(),
      changedBy: req.user.id,
      notes: notes
    });

    await order.save();

    // Populate the updated order for response
    const updatedOrder = await Order.findById(id)
      .populate('user', 'firstName lastName email')
      .lean();

    return res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: updatedOrder
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
// ADD TO YOUR adminOrders.js
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({ _id: id, isDeleted: false })
      .populate('user', 'firstName lastName email phone')
      .populate('items.product', 'name images sku price category')
      .select('-__v')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Format for admin display
    const orderDetails = {
      ...order,
      customerName: order.user 
        ? `${order.user.firstName} ${order.user.lastName}`
        : `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
      customerEmail: order.user ? order.user.email : order.shippingAddress.email,
      customerPhone: order.user ? order.user.phone : order.shippingAddress.phone,
      totalItems: order.items.reduce((sum, item) => sum + item.quantity, 0)
    };

    return res.json({
      success: true,
      order: orderDetails
    });

  } catch (error) {
    console.error('❌ Get order details error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch order details',
      details: error.message
    });
  }
});// DELETE ORDER (ADMIN ONLY - SOFT DELETE)
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
// GET TODAY'S FILTERED SALES (PAID ORDERS ONLY)
router.get('/sales/today-filtered', adminAuth, async (req, res) => {
  try {
    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get tomorrow's date at midnight
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Filter for today's orders with completed payments
    const result = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
          isDeleted: false,
          status: { $ne: 'cancelled' }, // Exclude cancelled orders
          $or: [
            { paymentStatus: 'paid' },
            { paymentStatus: 'completed' },
            { paymentStatus: 'succeeded' }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          averageOrderValue: { $avg: '$totalAmount' }
        }
      }
    ]);
    
    // If no results, return zeros
    if (result.length === 0) {
      return res.json({
        success: true,
        totalSales: 0,
        orderCount: 0,
        averageOrderValue: 0
      });
    }
    
    return res.json({
      success: true,
      totalSales: result[0].totalSales || 0,
      orderCount: result[0].orderCount || 0,
      averageOrderValue: result[0].averageOrderValue || 0
    });
    
  } catch (error) {
    console.error('❌ Today sales filtered error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch today\'s sales',
      details: error.message
    });
  }
});
module.exports = router;