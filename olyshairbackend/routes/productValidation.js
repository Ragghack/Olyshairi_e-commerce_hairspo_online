// routes/productValidation.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// ===== Debug Info =====
console.log('🔍 [ProductValidationRoute] Route loaded successfully');

// ===============================
// ✅ PRODUCT VALIDATION ENDPOINT
// ===============================
router.get('/validate', async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.query;
    
    console.log('🔍 Validating product stock:', { productId, quantity });

    if (!productId) {
      return res.status(400).json({ 
        success: false,
        error: 'Product ID is required' 
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid product ID format' 
      });
    }

    const product = await Product.findById(productId)
      .select('name price stock isActive images sku');
    
    if (!product) {
      return res.json({
        success: true,
        valid: false,
        error: 'Product not found'
      });
    }

    if (!product.isActive) {
      return res.json({
        success: true,
        valid: false,
        error: 'Product is not available'
      });
    }

    const requestedQuantity = parseInt(quantity);
    if (product.stock < requestedQuantity) {
      return res.json({
        success: true,
        valid: false,
        error: `Insufficient stock. Only ${product.stock} available`,
        availableStock: product.stock,
        product: {
          id: product._id,
          name: product.name,
          price: product.price,
          stock: product.stock,
          image: product.images[0]?.url,
          sku: product.sku
        }
      });
    }

    return res.json({
      success: true,
      valid: true,
      product: {
        id: product._id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        image: product.images[0]?.url,
        sku: product.sku,
        isActive: product.isActive
      }
    });

  } catch (error) {
    console.error('❌ Product validation error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Product validation failed',
      details: error.message 
    });
  }
});

// ===============================
// 📦 BATCH PRODUCT VALIDATION
// ===============================
router.post('/validate/batch', async (req, res) => {
  try {
    const { items } = req.body; // Array of { productId, quantity }
    
    console.log('🔍 Validating batch products:', items);

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Items array is required' 
      });
    }

    const validationResults = [];
    let allValid = true;
    const errors = [];

    for (const item of items) {
      const { productId, quantity = 1 } = item;
      
      if (!productId) {
        errors.push('Product ID is required for all items');
        allValid = false;
        continue;
      }

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        errors.push(`Invalid product ID format: ${productId}`);
        allValid = false;
        continue;
      }

      const product = await Product.findById(productId)
        .select('name price stock isActive images sku');

      if (!product) {
        validationResults.push({
          productId,
          valid: false,
          error: 'Product not found'
        });
        allValid = false;
        continue;
      }

      if (!product.isActive) {
        validationResults.push({
          productId,
          valid: false,
          error: 'Product is not available',
          product: {
            id: product._id,
            name: product.name
          }
        });
        allValid = false;
        continue;
      }

      const requestedQuantity = parseInt(quantity);
      if (product.stock < requestedQuantity) {
        validationResults.push({
          productId,
          valid: false,
          error: `Insufficient stock. Only ${product.stock} available`,
          availableStock: product.stock,
          product: {
            id: product._id,
            name: product.name,
            price: product.price,
            stock: product.stock,
            image: product.images[0]?.url,
            sku: product.sku
          }
        });
        allValid = false;
        continue;
      }

      validationResults.push({
        productId,
        valid: true,
        product: {
          id: product._id,
          name: product.name,
          price: product.price,
          stock: product.stock,
          image: product.images[0]?.url,
          sku: product.sku,
          isActive: product.isActive
        }
      });
    }

    return res.json({
      success: true,
      allValid,
      results: validationResults,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Batch product validation error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Batch product validation failed',
      details: error.message 
    });
  }
});

// ===============================
// 🔍 PRODUCT AVAILABILITY CHECK
// ===============================
router.get('/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 Checking product availability:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid product ID format' 
      });
    }

    const product = await Product.findById(id)
      .select('name price stock isActive images sku category');

    if (!product) {
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    const availability = {
      id: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      isActive: product.isActive,
      inStock: product.stock > 0,
      stock: product.stock,
      price: product.price,
      image: product.images[0]?.url,
      status: product.isActive ? (product.stock > 0 ? 'available' : 'out_of_stock') : 'inactive'
    };

    return res.json({
      success: true,
      product: availability
    });

  } catch (error) {
    console.error('❌ Product availability check error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Product availability check failed',
      details: error.message 
    });
  }
});

// ===============================
// 🧪 TEST ENDPOINT
// ===============================
router.get('/test/endpoint', (req, res) => {
  return res.json({
    success: true,
    message: 'Product Validation endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;