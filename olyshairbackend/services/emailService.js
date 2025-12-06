// services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER || 'shop@olyshair.com',
        pass: process.env.EMAIL_PASSWORD || 'Olysh@ir2025'
      }
    });
  }

  // Generate HTML email templates
  generateOrderConfirmationTemplate(order) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #392625; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f5f2; }
          .order-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>OLYS HAIR</h1>
            <h2>Order Confirmation</h2>
          </div>
          <div class="content">
            <p>Hello ${order.customerName},</p>
            <p>Thank you for your order! Your order #${order.orderNumber} has been confirmed.</p>
            
            <div class="order-details">
              <h3>Order Details</h3>
              <p><strong>Order Number:</strong> ${order.orderNumber}</p>
              <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${order.status}</p>
              <p><strong>Total Amount:</strong> €${order.totalAmount?.toFixed(2) || '0.00'}</p>
            </div>
            
            <p>We will notify you when your order ships.</p>
            <p>You can track your order anytime from your dashboard.</p>
            
            <a href="https://www.olyshair.com/customerdashboard.html?section=orders" 
               style="display: inline-block; background-color: #c8a97e; color: white; 
                      padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">
              View Order Details
            </a>
          </div>
          <div class="footer">
            <p>OLYS HAIR © ${new Date().getFullYear()}</p>
            <p>For any questions, contact us at support@olyshair.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateBookingConfirmationTemplate(booking) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #392625; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f5f2; }
          .booking-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>OLYS HAIR</h1>
            <h2>Booking Confirmation</h2>
          </div>
          <div class="content">
            <p>Hello ${booking.customerName},</p>
            <p>Your wig service booking has been confirmed!</p>
            
            <div class="booking-details">
              <h3>Booking Details</h3>
              <p><strong>Booking ID:</strong> ${booking._id}</p>
              <p><strong>Service:</strong> Wig Renovation</p>
              <p><strong>Number of Wigs:</strong> ${booking.wigCount}</p>
              <p><strong>Total Price:</strong> €${booking.totalPrice || (booking.wigCount * 15)}</p>
              <p><strong>Status:</strong> ${booking.status}</p>
              ${booking.estimatedCompletion ? `<p><strong>Estimated Completion:</strong> ${new Date(booking.estimatedCompletion).toLocaleDateString()}</p>` : ''}
            </div>
            
            <p>We will contact you if we need more information about your wigs.</p>
            <p>You can track your booking status from your dashboard.</p>
            
            <a href="https://www.olyshair.com/customerdashboard.html?section=bookings" 
               style="display: inline-block; background-color: #c8a97e; color: white; 
                      padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">
              View Booking Details
            </a>
          </div>
          <div class="footer">
            <p>OLYS HAIR © ${new Date().getFullYear()}</p>
            <p>For any questions, contact us at bookings@olyshair.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generateStatusUpdateTemplate(type, item, newStatus, message) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #392625; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f5f2; }
          .status-update { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .status-${newStatus.toLowerCase()} { 
            display: inline-block; 
            padding: 5px 10px; 
            border-radius: 20px; 
            font-weight: bold; 
            color: white; 
          }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>OLYS HAIR</h1>
            <h2>Status Update</h2>
          </div>
          <div class="content">
            <p>Hello ${item.customerName},</p>
            
            <div class="status-update">
              <p>Your ${type === 'order' ? 'order' : 'booking'} status has been updated:</p>
              <p><strong>${type === 'order' ? 'Order' : 'Booking'} ID:</strong> ${type === 'order' ? item.orderNumber : item._id}</p>
              <p><strong>New Status:</strong> <span class="status-${newStatus.toLowerCase()}">${newStatus}</span></p>
              ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
              ${item.trackingNumber ? `<p><strong>Tracking Number:</strong> ${item.trackingNumber}</p>` : ''}
            </div>
            
            <p>You can view more details in your dashboard.</p>
            
            <a href="https://www.olyshair.com/customerdashboard.html?section=${type === 'order' ? 'orders' : 'bookings'}" 
               style="display: inline-block; background-color: #c8a97e; color: white; 
                      padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">
              View Details
            </a>
          </div>
          <div class="footer">
            <p>OLYS HAIR © ${new Date().getFullYear()}</p>
            <p>For any questions, contact us at support@olyshair.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Send email method
  async sendEmail(to, subject, htmlContent, textContent = null) {
    try {
      const mailOptions = {
        from: `"OLYS HAIR" <${process.env.EMAIL_USER || 'shop@olyshair.com'}>`,
        to: to,
        subject: subject,
        html: htmlContent,
        text: textContent || htmlContent.replace(/<[^>]*>/g, '')
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${to}: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();