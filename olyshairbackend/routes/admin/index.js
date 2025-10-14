// routes/admin/index.js
const express = require('express');
const router = express.Router();

// Import admin routes
const adminOrdersRoutes = require('./orders');
const adminProductsRoutes = require('./products');
const adminUsersRoutes = require('./users');
const adminAuthRoutes = require('./auth');

// Use admin routes
router.use('/orders', adminOrdersRoutes);
router.use('/products', adminProductsRoutes);
router.use('/users', adminUsersRoutes);
router.use('/auth', adminAuthRoutes);

console.log('✅ Admin routes mounted successfully');

module.exports = router;