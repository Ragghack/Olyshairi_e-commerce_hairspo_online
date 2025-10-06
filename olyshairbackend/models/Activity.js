const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Some activities might be from anonymous users
  },
  activityType: {
    type: String,
    required: true,
    enum: [
      'login', 'logout', 'view_product', 'add_to_cart', 'remove_from_cart',
      'purchase', 'search', 'page_view', 'account_creation', 'profile_update'
    ]
  },
  description: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for efficient querying
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ activityType: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);