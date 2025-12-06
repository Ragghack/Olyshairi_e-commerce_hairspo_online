// services/notificationService.js - UPDATED
const Notification = require('../models/Notification');
const emailService = require('./emailService');

class NotificationService {
  
  async createNotification(userId, notificationData) {
    try {
      const notification = new Notification({
        userId,
        ...notificationData
      });
      
      await notification.save();
      
      // Send email if requested and email data is provided
      if (notificationData.sendEmail && notificationData.emailData) {
        await this.sendNotificationEmail(userId, notification, notificationData.emailData);
      }
      
      return notification;
    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    }
  }

  async sendNotificationEmail(userId, notification, emailData) {
    try {
      // Get user email from user service (you need to implement this)
      // For now, we'll assume emailData contains the email
      const userEmail = emailData.userEmail;
      
      if (!userEmail) {
        console.warn('⚠️ No email provided for notification');
        return;
      }
      
      const emailSubject = notification.emailSubject || notification.title;
      const emailHtml = notification.emailContent || this.generateNotificationEmail(notification);
      
      await emailService.sendEmail(userEmail, emailSubject, emailHtml);
      
      // Mark as email sent
      notification.emailSent = true;
      await notification.save();
      
    } catch (error) {
      console.error('❌ Error sending notification email:', error);
    }
  }

  generateNotificationEmail(notification) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #392625; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f5f2; }
          .notification-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .action-btn { display: inline-block; background-color: #c8a97e; color: white; 
                        padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>OLYS HAIR</h1>
            <h2>Notification</h2>
          </div>
          <div class="content">
            <h3>${notification.title}</h3>
            <div class="notification-details">
              <p>${notification.message}</p>
              ${notification.metadata?.actionUrl ? `
                <a href="${notification.metadata.actionUrl}" class="action-btn">
                  ${notification.metadata.actionText || 'View Details'}
                </a>
              ` : ''}
            </div>
            <p>You can view this notification in your dashboard.</p>
          </div>
          <div class="footer">
            <p>OLYS HAIR © ${new Date().getFullYear()}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendOrderStatusUpdate(order, status, message = null) {
    try {
      // Create notification
      const notification = await this.createNotification(order.customerId, {
        type: 'order',
        title: `Order Status Updated: ${getOrderStatusLabel(status)}`,
        message: message || `Your order #${order.orderNumber} status has been updated to ${getOrderStatusLabel(status)}.`,
        priority: status === 'cancelled' ? 'high' : 'medium',
        metadata: {
          orderId: order._id,
          actionUrl: `https://www.olyshair.com/customerdashboard.html?section=orders&order=${order.orderNumber}`,
          actionText: 'View Order Details'
        },
        sendEmail: true,
        emailData: {
          userEmail: order.customerEmail,
          orderNumber: order.orderNumber,
          status: status
        }
      });

      // Update order status history if it exists
      if (order.statusHistory) {
        order.statusHistory.push({
          status: status,
          changedAt: new Date(),
          notes: message || 'Status updated',
          changedBy: 'system'
        });
        await order.save();
      }

      return notification;
    } catch (error) {
      console.error('❌ Error sending order status update:', error);
      throw error;
    }
  }

  async sendBookingStatusUpdate(booking, status, message = null) {
    try {
      const notification = await this.createNotification(booking.customerId, {
        type: 'booking',
        title: `Booking Status Updated: ${getBookingStatusLabel(status)}`,
        message: message || `Your booking #${booking._id} status has been updated to ${getBookingStatusLabel(status)}.`,
        priority: status === 'cancelled' ? 'high' : 'medium',
        metadata: {
          bookingId: booking._id,
          actionUrl: `https://www.olyshair.com/customerdashboard.html?section=bookings&booking=${booking._id}`,
          actionText: 'View Booking Details'
        },
        sendEmail: true,
        emailData: {
          userEmail: booking.customerEmail,
          bookingId: booking._id,
          status: status
        }
      });

      // Update booking status history
      if (booking.statusHistory) {
        booking.statusHistory.push({
          status: status,
          changedAt: new Date(),
          notes: message || 'Status updated',
          changedBy: 'system'
        });
        await booking.save();
      }

      return notification;
    } catch (error) {
      console.error('❌ Error sending booking status update:', error);
      throw error;
    }
  }

  async getUserNotifications(userId, limit = 20, page = 1, filter = {}) {
    try {
      const query = { userId, ...filter };
      
      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();
      
      const total = await Notification.countDocuments(query);
      
      return {
        notifications,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      };
    } catch (error) {
      console.error('❌ Error getting user notifications:', error);
      throw error;
    }
  }

  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { $set: { read: true, readAt: new Date() } },
        { new: true }
      );
      
      return notification;
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      throw error;
    }
  }

  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, read: false },
        { $set: { read: true, readAt: new Date() } }
      );
      
      return result;
    } catch (error) {
      console.error('❌ Error marking all notifications as read:', error);
      throw error;
    }
  }

  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        userId
      });
      
      return notification;
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      throw error;
    }
  }

  async getUnreadCount(userId) {
    try {
      return await Notification.countDocuments({
        userId,
        read: false
      });
    } catch (error) {
      console.error('❌ Error getting unread count:', error);
      throw error;
    }
  }
}

// Helper functions
function getOrderStatusLabel(status) {
  const labels = {
    'pending': 'Pending',
    'processing': 'Processing',
    'confirmed': 'Confirmed',
    'shipped': 'Shipped',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled'
  };
  return labels[status] || status;
}

function getBookingStatusLabel(status) {
  const labels = {
    'pending': 'Pending',
    'confirmed': 'Confirmed',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled'
  };
  return labels[status] || status;
}

module.exports = new NotificationService();