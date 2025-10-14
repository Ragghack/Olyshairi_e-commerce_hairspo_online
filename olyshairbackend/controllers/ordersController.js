// controllers/ordersController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');

// ===============================
// 🎯 ORDER CONTROLLER FUNCTIONS
// ===============================

class OrdersController {
  
  // Get all orders with filtering and pagination
  static async getOrders(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        status, 
        customer, 
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
      
      if (customer) {
        filter.user = customer;
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
          .populate('items.product', 'name images sku')
          .select('-__v')
          .lean(),
        Order.countDocuments(filter)
      ]);

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
      console.error('❌ Get orders error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch orders',
        details: error.message 
      });
    }
  }

  // Get single order
  static async getOrder(req, res) {
    try {
      const { id } = req.params;

      const order = await Order.findById(id)
        .populate('user', 'firstName lastName email phone')
        .populate('items.product', 'name images sku category')
        .select('-__v')
        .lean();

      if (!order) {
        return res.status(404).json({ 
          success: false,
          error: 'Order not found' 
        });
      }

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
  }

  // Update order status
  static async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, trackingNumber, adminNotes } = req.body;

      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid status',
          validStatuses 
        });
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({ 
          success: false,
          error: 'Order not found' 
        });
      }

      // Update order
      order.status = status;
      
      if (trackingNumber) {
        order.trackingNumber = trackingNumber;
      }
      
      if (adminNotes) {
        order.adminNotes = adminNotes;
      }

      // Set delivered/cancelled dates if applicable
      if (status === 'delivered' && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }
      
      if (status === 'cancelled' && !order.cancelledAt) {
        order.cancelledAt = new Date();
        order.paymentStatus = 'refunded';
      }

      await order.save();

      return res.json({
        success: true,
        message: 'Order status updated successfully',
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          trackingNumber: order.trackingNumber
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
  }

  // Get order statistics
  static async getOrderStats(req, res) {
    try {
      const { period = '30days' } = req.query;
      
      let dateFilter = {};
      const now = new Date();
      
      switch (period) {
        case '7days':
          dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 7)) } };
          break;
        case '30days':
          dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 30)) } };
          break;
        case '90days':
          dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 90)) } };
          break;
        case 'year':
          dateFilter = { createdAt: { $gte: new Date(now.setFullYear(now.getFullYear() - 1)) } };
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
      console.error('❌ Get order stats error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch order statistics',
        details: error.message 
      });
    }
  }
}

module.exports = OrdersController;