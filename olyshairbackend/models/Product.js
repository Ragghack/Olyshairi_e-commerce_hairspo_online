const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  oldPrice: {
    type: Number,
    min: 0,
    default: null
  },
  category: {
    type: String,
    required: true,
    enum: ['brazilian', 'peruvian', 'malaysian', 'accessories', 'extensions', 'wigs', 'closures']
  },
  type: {
    type: String,
    required: true
  },
  length: {
    type: String,
    default: null
  },
  texture: {
    type: String,
    default: null
  },
  color: {
    type: String,
    default: null
  },
  quality: {
    type: String,
    default: 'Premium'
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  images: [{
   url: String,
    altText: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  tags: [String],
  sku: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: true
});

// Generate SKU before saving
productSchema.pre('save', function(next) {
  if (!this.sku) {
    const prefix = this.category.substring(0, 3).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.sku = `${prefix}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);