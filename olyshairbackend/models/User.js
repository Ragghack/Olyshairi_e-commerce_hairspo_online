const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  passwordHash: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required for OAuth users
    }
  },
  phoneNumber: {
    type: String,
    default: null
  },
  googleId: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['customer', 'admin', 'super_admin'],
    default: 'customer'
  },
  lastLogin: {
    type: Date,
    default: null
  },
  avatarUrl: {
    type: String,
    default: null
  },
  memberSince: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Static method to find user by email
userSchema.statics.findByEmail = async function(email) {
  return this.findOne({ email });
};

// Static method to find user by Google ID
userSchema.statics.findByGoogleId = async function(googleId) {
  return this.findOne({ googleId });
};

// Instance method to check password
userSchema.methods.checkPassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('User', userSchema);