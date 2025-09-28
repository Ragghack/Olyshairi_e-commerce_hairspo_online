const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type:String, required:true, unique:true },
  passwordHash: { type:String, required:true },
  avatarUrl: { type:String },
  role: { type: String, enum: ['customer','admin'], default:'customer' },
  createdAt: { type: Date, default: Date.now },
  // optional: address/payment methods etc.
});

module.exports = mongoose.model('User', userSchema);
