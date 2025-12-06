const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    required: true
  },
  service: {
    type: String,
    default: 'Wig Renovation'
  },
  wigCount: {
    type: Number,
    required: true,
    min: 1
  },
  
notes: String,
  estimatedCompletion: Date,
  actualCompletion: Date,
  trackingNumber: String,
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    notes: String,
    changedBy: String
  }],

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  totalPrice: {
    type: Number,
    default: 15 // €15 per wig
  },
  estimatedCompletion: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deletionReason: {
    type: String,
    default: null
  }
  
}, {
  timestamps: true
});

// Calculate total price before saving
bookingSchema.pre('save', function(next) {
  this.totalPrice = this.wigCount * 15;
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);