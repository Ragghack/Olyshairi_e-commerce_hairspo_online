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
  notes: {
    type: String
  },
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