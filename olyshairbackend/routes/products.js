const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const cloudinary = require('cloudinary').v2;


// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get all products with filtering and pagination
router.get('/', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;

    const filter = { isActive: true };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product
router.get('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new product
router.post('/', adminAuth, upload.array('images', 5), async (req, res) => {
  try {
    const productData = req.body;
    
    // Handle image uploads to Cloudinary
    const images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'olyshair/products' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(file.buffer);
        });
        images.push({
          url: result.secure_url,
          altText: productData.name || 'Product image'
        });
      }
    }

    const product = new Product({
      ...productData,
      images,
      price: parseFloat(productData.price),
      oldPrice: productData.oldPrice ? parseFloat(productData.oldPrice) : null,
      stock: parseInt(productData.stock)
    });

    await product.save();

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product
router.put('/:id', auth, upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updateData = req.body;
    
    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const newImages = [];
      for (const file of req.files) {
        const result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'olyshair/products' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(file.buffer);
        });
        newImages.push({
          url: result.secure_url,
          altText: updateData.name || product.name
        });
      }
      updateData.images = [...product.images, ...newImages];
    }

    // Convert numeric fields
    if (updateData.price) updateData.price = parseFloat(updateData.price);
    if (updateData.oldPrice) updateData.oldPrice = parseFloat(updateData.oldPrice);
    if (updateData.stock) updateData.stock = parseInt(updateData.stock);

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// In routes/products.js
router.post('/validate/batch', async (req, res) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds)) {
      return res.status(400).json({
        success: false,
        error: 'Product IDs array required'
      });
    }

    const products = await Product.find({
      _id: { $in: productIds },
      isActive: true
    }).select('_id name price stock');

    const validProducts = products.map(product => ({
      id: product._id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      isValid: product.stock > 0
    }));

    res.json({
      success: true,
      products: validProducts,
      validCount: validProducts.filter(p => p.isValid).length
    });

  } catch (error) {
    console.error('Batch validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Validation failed'
    });
  }
});
// Get recent products
// Get recent products - Fix response format
// Get recent products - Make this publicly accessible
router.get('/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const products = await Product.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('name price oldPrice images stock category type length texture color quality description');

    res.json({
      success: true,
      products,
      count: products.length,
      message: 'Recent products fetched successfully'
    });
  } catch (error) {
    console.error('Get recent products error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch recent products',
      products: [] 
    });
  }
});
// In routes/products.js - Add this new route

// Get all active products for public display (for homepage carousel)
router.get('/public/all', async (req, res) => {
  try {
    const { category, limit = 50 } = req.query;
    
    const filter = { isActive: true };
    
    // Optional category filter
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    const products = await Product.find(filter)
      .select('name price oldPrice images stock category type length texture color quality description sku')
      .limit(parseInt(limit));

    res.json({
      success: true,
      products,
      count: products.length,
      message: 'All products fetched successfully'
    });
  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch products',
      products: [] 
    });
  }
});

// Get products by category for public display
router.get('/public/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20 } = req.query;
    
    const products = await Product.find({ 
      isActive: true,
      category: category 
    })
    .select('name price oldPrice images stock category type length texture color quality description')
    .limit(parseInt(limit));

    res.json({
      success: true,
      products,
      count: products.length,
      message: `Products in ${category} category fetched successfully`
    });
  } catch (error) {
    console.error('Get products by category error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch products',
      products: [] 
    });
  }
});

// Get popular products (based on stock or other criteria)
router.get('/public/popular', async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    
    // You can modify this query based on your popularity criteria
    // For example: products with most stock, best sellers, etc.
    const products = await Product.find({ 
      isActive: true,
      stock: { $gt: 0 } // Only products in stock
    })
    .sort({ stock: -1, createdAt: -1 }) // Sort by stock descending, then by recent
    .select('name price oldPrice images stock category type length texture color quality description')
    .limit(parseInt(limit));

    res.json({
      success: true,
      products,
      count: products.length,
      message: 'Popular products fetched successfully'
    });
  } catch (error) {
    console.error('Get popular products error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch popular products',
      products: [] 
    });
  }
});

// Keep your existing /recent endpoint but increase the default limit
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query; // Increased from 10 to 20
    
    const products = await Product.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('name price oldPrice images stock category type length texture color quality description');

    res.json({
      success: true,
      products,
      count: products.length,
      message: 'Recent products fetched successfully'
    });
  } catch (error) {
    console.error('Get recent products error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch recent products',
      products: [] 
    });
  }
});

module.exports = router;