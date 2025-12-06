// models/Notification.js - FIXED
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['order', 'booking', 'system', 'promotion', 'security'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  read: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  metadata: {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    actionUrl: String,
    actionText: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  readAt: Date
}, {
  timestamps: true
});

// Indexes for better query performance
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;