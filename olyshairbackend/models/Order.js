const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  image: String,
  sku: String
}, { _id: false });

const addressSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, default: '' },
  zipCode: { type: String, required: true },
  country: { type: String, required: true },
  phone: { type: String, required: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Allow guest checkout
  },
  guestEmail: {
    type: String,
    required: function() { return !this.user; }
  },
  items: [orderItemSchema],
  
  // Enhanced pricing structure
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  shippingCost: {
    type: Number,
    required: true,
    min: 0
  },
  taxAmount: {
    type: Number,
    required: true,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Enhanced status tracking
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  
  // Enhanced payment tracking
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'paypal', 'stripe', 'apple_pay', 'klarna'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  
  // Enhanced shipping information
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  shippingMethod: {
    type: String,
    enum: ['standard', 'express', 'overnight'],
    default: 'standard'
  },
  
  // Enhanced tracking and delivery
  trackingNumber: {
    type: String,
    default: null
  },
  carrier: {
    type: String,
    default: null
  },
  estimatedDelivery: {
    type: Date,
    default: null
  },
  actualDelivery: {
    type: Date,
    default: null
  },
  
  // Payment provider specific IDs
  stripePaymentIntentId: String,
  paypalOrderId: String,
  applePayTransactionId: String,
  transactionId: String,
  
  // Enhanced metadata
  metadata: mongoose.Schema.Types.Mixed,
  notes: String,
  promoCode: String,
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted order date
orderSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for order status badge color
orderSchema.virtual('statusColor').get(function() {
  const statusColors = {
    pending: 'warning',
    confirmed: 'info',
    processing: 'primary',
    shipped: 'success',
    delivered: 'success',
    cancelled: 'danger',
    refunded: 'secondary'
  };
  return statusColors[this.status] || 'secondary';
});

// Generate order number before saving
orderSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `OL-${10000 + count}`;
  }
  next();
});

// Update delivery estimate based on shipping method
orderSchema.pre('save', function (next) {
  if (this.isModified('shippingMethod') && this.shippingMethod) {
    const deliveryDays = {
      standard: 7,
      express: 3,
      overnight: 1
    };
    
    const days = deliveryDays[this.shippingMethod] || 7;
    this.estimatedDelivery = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  next();
});

// Static method to get order statistics
orderSchema.statics.getStats = async function(userId = null) {
  const matchStage = userId ? { user: mongoose.Types.ObjectId(userId) } : {};
  
  const stats = await this.aggregate([
    { $match: { ...matchStage, isDeleted: false } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totalAmount' },
        averageOrderValue: { $avg: '$totalAmount' },
        pendingOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        completedOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    pendingOrders: 0,
    completedOrders: 0
  };
};

// Instance method to calculate totals
orderSchema.methods.calculateTotals = function() {
  this.subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  this.taxAmount = this.subtotal * 0.08; // 8% tax
  this.totalAmount = this.subtotal + this.shippingCost + this.taxAmount - this.discountAmount;
};

// Instance method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  const cancellableStatuses = ['pending', 'confirmed'];
  return cancellableStatuses.includes(this.status);
};

// Instance method to get order summary
orderSchema.methods.getSummary = function() {
  return {
    orderNumber: this.orderNumber,
    totalAmount: this.totalAmount,
    status: this.status,
    itemCount: this.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: this.createdAt,
    estimatedDelivery: this.estimatedDelivery
  };
};

// Query helper for active orders
orderSchema.query.active = function() {
  return this.where({ isDeleted: false });
};

// Query helper for user orders
orderSchema.query.byUser = function(userId) {
  return this.where({ user: userId });
};

// Index for better performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'shippingAddress.email': 1 });

module.exports = mongoose.model('Order', orderSchema);