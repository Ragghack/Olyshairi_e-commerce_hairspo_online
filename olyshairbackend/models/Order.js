const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  items: [{ productId: String, name: String, price: Number, qty: Number }],
  total: Number,
  paymentProvider: String, // 'stripe' | 'paypal' | 'klarna'
  paymentStatus: String,
  metadata: Object,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
