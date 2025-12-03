// routes/adminReports.js (Create new file)
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const moment = require('moment');

// GET SALES REPORT DATA
router.get('/sales', adminAuth, async (req, res) => {
  try {
    const { days = 30, startDate, endDate } = req.query;
    
    let dateFilter = {};
    
    if (startDate || endDate) {
      dateFilter = { createdAt: {} };
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    } else {
      dateFilter = { 
        createdAt: { 
          $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) 
        } 
      };
    }

    // Get orders data
    const orders = await Order.aggregate([
      { $match: { ...dateFilter, isDeleted: false, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$totalAmount' },
          // Group by day for chart data
          dailySales: {
            $push: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              amount: '$totalAmount'
            }
          }
        }
      }
    ]);

    // Get bookings data
    const bookings = await Booking.aggregate([
      { $match: { ...dateFilter, isDeleted: false, status: 'completed' } },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          bookingRevenue: { $sum: '$totalPrice' },
          averageBookingValue: { $avg: '$totalPrice' }
        }
      }
    ]);

    // Get customer data
    const newCustomers = await User.countDocuments({
      ...dateFilter,
      role: 'customer'
    });

    // Format daily sales for chart
    let dailyData = [];
    if (orders[0] && orders[0].dailySales) {
      const salesByDay = {};
      orders[0].dailySales.forEach(sale => {
        if (!salesByDay[sale.date]) {
          salesByDay[sale.date] = 0;
        }
        salesByDay[sale.date] += sale.amount;
      });
      
      dailyData = Object.entries(salesByDay).map(([date, amount]) => ({
        date,
        amount
      })).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    const result = {
      period: days + ' days',
      dateRange: {
        start: dateFilter.createdAt.$gte,
        end: dateFilter.createdAt.$lte || new Date()
      },
      sales: orders[0] ? {
        totalSales: orders[0].totalSales || 0,
        totalOrders: orders[0].totalOrders || 0,
        averageOrderValue: orders[0].averageOrderValue || 0,
        dailyData
      } : {
        totalSales: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        dailyData: []
      },
      bookings: bookings[0] ? {
        totalBookings: bookings[0].totalBookings || 0,
        bookingRevenue: bookings[0].bookingRevenue || 0,
        averageBookingValue: bookings[0].averageBookingValue || 0
      } : {
        totalBookings: 0,
        bookingRevenue: 0,
        averageBookingValue: 0
      },
      customers: {
        newCustomers
      }
    };

    res.json({
      success: true,
      report: result
    });

  } catch (error) {
    console.error('❌ Sales report error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate sales report' 
    });
  }
});

// EXPORT CSV - SALES REPORT
router.get('/export/csv', adminAuth, async (req, res) => {
  try {
    const { days = 30, type = 'sales' } = req.query;
    
    const dateFilter = { 
      createdAt: { 
        $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) 
      },
      isDeleted: false
    };

    let data = [];
    let filename = '';
    let fields = [];

    switch (type) {
      case 'sales':
        // Get detailed order data
        const orders = await Order.find({
          ...dateFilter,
          status: { $ne: 'cancelled' }
        })
        .populate('user', 'firstName lastName email')
        .populate('items.product', 'name sku')
        .sort({ createdAt: -1 });

        data = orders.map(order => ({
          'Order ID': order.orderNumber,
          'Date': moment(order.createdAt).format('YYYY-MM-DD HH:mm:ss'),
          'Customer': order.user 
            ? `${order.user.firstName} ${order.user.lastName}`
            : `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
          'Email': order.user ? order.user.email : order.shippingAddress.email,
          'Status': order.status,
          'Items': order.items.length,
          'Subtotal': order.subtotal,
          'Tax': order.tax,
          'Shipping': order.shippingFee,
          'Total': order.totalAmount,
          'Payment Method': order.paymentMethod,
          'Payment Status': order.paymentStatus
        }));

        filename = `sales_report_${moment().format('YYYY-MM-DD')}.csv`;
        fields = [
          'Order ID', 'Date', 'Customer', 'Email', 'Status', 'Items',
          'Subtotal', 'Tax', 'Shipping', 'Total', 'Payment Method', 'Payment Status'
        ];
        break;

      case 'bookings':
        // Get booking data
        const bookings = await Booking.find(dateFilter)
          .populate('userId', 'firstName lastName email')
          .sort({ createdAt: -1 });

        data = bookings.map(booking => ({
          'Booking ID': booking._id.toString().substring(0, 8),
          'Date': moment(booking.createdAt).format('YYYY-MM-DD HH:mm:ss'),
          'Customer': booking.customerName || 
                     (booking.userId ? `${booking.userId.firstName} ${booking.userId.lastName}` : 'N/A'),
          'Email': booking.customerEmail || (booking.userId?.email || 'N/A'),
          'Service': booking.service || 'Wig Renovation',
          'Wig Count': booking.wigCount,
          'Total Price': booking.totalPrice || (booking.wigCount * 15),
          'Status': booking.status,
          'Estimated Completion': booking.estimatedCompletion 
            ? moment(booking.estimatedCompletion).format('YYYY-MM-DD')
            : 'N/A',
          'Notes': booking.notes || ''
        }));

        filename = `bookings_report_${moment().format('YYYY-MM-DD')}.csv`;
        fields = [
          'Booking ID', 'Date', 'Customer', 'Email', 'Service', 'Wig Count',
          'Total Price', 'Status', 'Estimated Completion', 'Notes'
        ];
        break;

      case 'customers':
        // Get customer data
        const customers = await User.find({
          ...dateFilter,
          role: 'customer'
        }).sort({ createdAt: -1 });

        data = customers.map(customer => ({
          'Customer ID': customer._id.toString().substring(0, 8),
          'Date Joined': moment(customer.createdAt).format('YYYY-MM-DD'),
          'First Name': customer.firstName,
          'Last Name': customer.lastName,
          'Email': customer.email,
          'Phone': customer.phoneNumber || 'N/A',
          'Last Login': customer.lastLogin 
            ? moment(customer.lastLogin).format('YYYY-MM-DD HH:mm:ss')
            : 'Never',
          'Status': customer.isActive ? 'Active' : 'Inactive',
          'Loyalty Points': customer.loyaltyPoints || 0
        }));

        filename = `customers_report_${moment().format('YYYY-MM-DD')}.csv`;
        fields = [
          'Customer ID', 'Date Joined', 'First Name', 'Last Name', 'Email',
          'Phone', 'Last Login', 'Status', 'Loyalty Points'
        ];
        break;

      case 'summary':
        // Get summary data
        const [orderStats, bookingStats, customerStats] = await Promise.all([
          Order.aggregate([
            { $match: { ...dateFilter, status: { $ne: 'cancelled' } } },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$totalAmount' },
                avgOrderValue: { $avg: '$totalAmount' }
              }
            }
          ]),
          Booking.aggregate([
            { $match: { ...dateFilter, status: 'completed' } },
            {
              $group: {
                _id: null,
                totalBookings: { $sum: 1 },
                totalRevenue: { $sum: '$totalPrice' },
                avgBookingValue: { $avg: '$totalPrice' }
              }
            }
          ]),
          User.countDocuments({ ...dateFilter, role: 'customer' })
        ]);

        data = [{
          'Period': `${days} days`,
          'Start Date': moment().subtract(days, 'days').format('YYYY-MM-DD'),
          'End Date': moment().format('YYYY-MM-DD'),
          'Total Orders': orderStats[0]?.totalOrders || 0,
          'Order Revenue': orderStats[0]?.totalRevenue || 0,
          'Avg Order Value': orderStats[0]?.avgOrderValue || 0,
          'Total Bookings': bookingStats[0]?.totalBookings || 0,
          'Booking Revenue': bookingStats[0]?.totalRevenue || 0,
          'Avg Booking Value': bookingStats[0]?.avgBookingValue || 0,
          'New Customers': customerStats,
          'Report Generated': moment().format('YYYY-MM-DD HH:mm:ss')
        }];

        filename = `summary_report_${moment().format('YYYY-MM-DD')}.csv`;
        fields = Object.keys(data[0]);
        break;
    }

    // Convert to CSV
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);

    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csv);

  } catch (error) {
    console.error('❌ CSV export error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export CSV' 
    });
  }
});

// EXPORT PDF - SALES REPORT
router.get('/export/pdf', adminAuth, async (req, res) => {
  try {
    const { days = 30, type = 'summary' } = req.query;
    
    const dateFilter = { 
      createdAt: { 
        $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) 
      },
      isDeleted: false
    };

    // Get data for PDF
    const [orderStats, bookingStats, customerStats] = await Promise.all([
      Order.aggregate([
        { $match: { ...dateFilter, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            avgOrderValue: { $avg: '$totalAmount' },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            }
          }
        }
      ]),
      Booking.aggregate([
        { $match: { ...dateFilter, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            totalRevenue: { $sum: '$totalPrice' },
            avgBookingValue: { $avg: '$totalPrice' }
          }
        }
      ]),
      User.countDocuments({ ...dateFilter, role: 'customer' })
    ]);

    const orderData = orderStats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      pendingOrders: 0,
      completedOrders: 0
    };

    const bookingData = bookingStats[0] || {
      totalBookings: 0,
      totalRevenue: 0,
      avgBookingValue: 0
    };

    // Create PDF document
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="sales_report_${moment().format('YYYY-MM-DD')}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add content to PDF
    // Header
    doc.fontSize(24)
       .fillColor('#392625')
       .text('OLYS HAIR', { align: 'center' });
    
    doc.moveDown(0.5);
    doc.fontSize(16)
       .fillColor('#666')
       .text('Sales Report', { align: 'center' });
    
    doc.moveDown();
    doc.fontSize(12)
       .fillColor('#999')
       .text(`Period: Last ${days} days`, { align: 'center' });
    doc.text(`Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')}`, { align: 'center' });
    
    doc.moveDown(1);

    // Report Summary
    doc.fontSize(14)
       .fillColor('#392625')
       .text('Report Summary');
    
    doc.moveDown(0.5);
    doc.fontSize(12)
       .fillColor('#333')
       .text(`Period: Last ${days} days (${moment().subtract(days, 'days').format('MMM D, YYYY')} - ${moment().format('MMM D, YYYY')})`);
    
    doc.moveDown(1);

    // Sales Statistics
    doc.fontSize(12)
       .fillColor('#392625')
       .text('Sales Statistics');
    
    doc.moveDown(0.5);
    doc.fontSize(10)
       .fillColor('#333')
       .text(`Total Orders: ${orderData.totalOrders}`, { continued: true })
       .fillColor(orderData.totalOrders > 0 ? '#28a745' : '#666')
       .text(` (€${orderData.totalRevenue.toFixed(2)})`);
    
    doc.text(`Average Order Value: €${orderData.avgOrderValue.toFixed(2)}`);
    doc.text(`Pending Orders: ${orderData.pendingOrders}`);
    doc.text(`Completed Orders: ${orderData.completedOrders}`);
    
    doc.moveDown(0.5);
    doc.text(`Total Bookings: ${bookingData.totalBookings}`, { continued: true })
       .fillColor(bookingData.totalBookings > 0 ? '#28a745' : '#666')
       .text(` (€${bookingData.totalRevenue.toFixed(2)})`);
    
    doc.text(`Average Booking Value: €${bookingData.avgBookingValue.toFixed(2)}`);
    doc.text(`New Customers: ${customerStats}`);
    
    doc.moveDown(1);

    // Revenue Breakdown
    doc.fontSize(12)
       .fillColor('#392625')
       .text('Revenue Breakdown');
    
    doc.moveDown(0.5);
    
    const totalRevenue = orderData.totalRevenue + bookingData.totalRevenue;
    const orderPercentage = totalRevenue > 0 ? (orderData.totalRevenue / totalRevenue * 100).toFixed(1) : 0;
    const bookingPercentage = totalRevenue > 0 ? (bookingData.totalRevenue / totalRevenue * 100).toFixed(1) : 0;
    
    doc.fontSize(10)
       .fillColor('#333')
       .text(`Product Sales: €${orderData.totalRevenue.toFixed(2)} (${orderPercentage}%)`);
    doc.text(`Booking Revenue: €${bookingData.totalRevenue.toFixed(2)} (${bookingPercentage}%)`);
    
    // Add a simple bar chart visualization
    if (totalRevenue > 0) {
      doc.moveDown(1);
      doc.fontSize(10)
         .fillColor('#666')
         .text('Revenue Distribution:');
      
      const barWidth = 300;
      const orderBarWidth = (orderData.totalRevenue / totalRevenue) * barWidth;
      const bookingBarWidth = barWidth - orderBarWidth;
      
      // Order revenue bar
      doc.rect(50, doc.y + 5, orderBarWidth, 15)
         .fillColor('#392625')
         .fill();
      
      // Booking revenue bar
      doc.rect(50 + orderBarWidth, doc.y, bookingBarWidth, 15)
         .fillColor('#c8b4a8')
         .fill();
      
      doc.moveDown(2);
      
      // Legend
      doc.fontSize(8);
      doc.rect(50, doc.y, 10, 10).fillColor('#392625').fill();
      doc.text(' Product Sales', 65, doc.y - 8);
      
      doc.rect(150, doc.y, 10, 10).fillColor('#c8b4a8').fill();
      doc.text(' Booking Revenue', 165, doc.y - 8);
    }
    
    doc.moveDown(2);

    // Footer
    doc.fontSize(8)
       .fillColor('#999')
       .text('OLYS HAIR - Professional Hair Solutions', { align: 'center' });
    doc.text('www.olyshair.com | contact@olyshair.com', { align: 'center' });
    doc.text('Report ID: ' + moment().format('YYYYMMDDHHmmss'), { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('❌ PDF export error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export PDF' 
    });
  }
});

// DETAILED PDF REPORT (More comprehensive)
router.get('/export/detailed-pdf', adminAuth, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const dateFilter = { 
      createdAt: { 
        $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) 
      },
      isDeleted: false
    };

    // Get detailed data
    const [orders, bookings, topProducts] = await Promise.all([
      Order.find({
        ...dateFilter,
        status: { $ne: 'cancelled' }
      })
      .populate('user', 'firstName lastName')
      .sort({ totalAmount: -1 })
      .limit(10),
      
      Booking.find({
        ...dateFilter,
        status: 'completed'
      })
      .populate('userId', 'firstName lastName')
      .sort({ totalPrice: -1 })
      .limit(10),
      
      Order.aggregate([
        { $match: { ...dateFilter, status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
          }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 5 }
      ])
    ]);

    // Create PDF
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="detailed_report_${moment().format('YYYY-MM-DD')}.pdf"`);

    doc.pipe(res);

    // Header
    doc.fontSize(24)
       .fillColor('#392625')
       .text('OLYS HAIR', { align: 'center' });
    
    doc.moveDown(0.5);
    doc.fontSize(16)
       .fillColor('#666')
       .text('Detailed Sales Report', { align: 'center' });
    
    doc.moveDown();
    doc.fontSize(12)
       .fillColor('#999')
       .text(`Period: Last ${days} days`, { align: 'center' });
    doc.text(`Generated: ${moment().format('MMMM D, YYYY h:mm A')}`, { align: 'center' });
    
    doc.moveDown(1.5);

    // Top Orders
    if (orders.length > 0) {
      doc.fontSize(14)
         .fillColor('#392625')
         .text('Top 10 Orders');
      
      doc.moveDown(0.5);
      
      orders.forEach((order, index) => {
        doc.fontSize(10)
           .fillColor('#333')
           .text(`${index + 1}. Order #${order.orderNumber} - €${order.totalAmount.toFixed(2)}`, { indent: 20 });
        
        if (order.user) {
          doc.fontSize(9)
             .fillColor('#666')
             .text(`   Customer: ${order.user.firstName} ${order.user.lastName}`, { indent: 30 });
        }
        
        doc.fontSize(9)
           .fillColor('#666')
           .text(`   Status: ${order.status} | Date: ${moment(order.createdAt).format('MMM D')}`, { indent: 30 });
      });
      
      doc.moveDown(1);
    }

    // Top Bookings
    if (bookings.length > 0) {
      doc.fontSize(14)
         .fillColor('#392625')
         .text('Top 10 Bookings');
      
      doc.moveDown(0.5);
      
      bookings.forEach((booking, index) => {
        doc.fontSize(10)
           .fillColor('#333')
           .text(`${index + 1}. Booking - €${(booking.totalPrice || (booking.wigCount * 15)).toFixed(2)}`, { indent: 20 });
        
        doc.fontSize(9)
           .fillColor('#666')
           .text(`   Service: ${booking.service || 'Wig Renovation'} (${booking.wigCount} wigs)`, { indent: 30 });
        
        if (booking.userId) {
          doc.fontSize(9)
             .fillColor('#666')
             .text(`   Customer: ${booking.userId.firstName} ${booking.userId.lastName}`, { indent: 30 });
        }
      });
      
      doc.moveDown(1);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8)
       .fillColor('#999')
       .text('Confidential - For Internal Use Only', { align: 'center' });
    doc.text(`Report ID: ${moment().format('YYYYMMDDHHmmss')}`, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error('❌ Detailed PDF export error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export detailed PDF' 
    });
  }
});

module.exports = router;