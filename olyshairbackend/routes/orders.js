const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const cloudinary = require('cloudinary').v2;

// ===== Debug Info on Load =====
console.log('🔍 [ProductsRoute] Route loaded successfully');

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed.'), false);
    }
  }
});

// ===============================
// 📦 GET ALL PRODUCTS (Public & Admin)
// ===============================
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      inStock,
      featured,
      isActive = true
    } = req.query;

    console.log('📦 Fetching products with filters:', {
      page, limit, category, search, sortBy, sortOrder, minPrice, maxPrice, inStock, featured
    });

    const filter = { isActive: isActive !== 'false' };
    
    // Category filter
    if (category && category !== 'all' && category !== 'undefined') {
      filter.category = category;
    }
    
    // Search filter
    if (search && search !== 'undefined') {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Stock filter
    if (inStock === 'true') {
      filter.stock = { $gt: 0 };
    } else if (inStock === 'false') {
      filter.stock = { $lte: 0 };
    }

    // Featured filter
    if (featured === 'true') {
      filter.isFeatured = true;
    }

    const sort = {};
    const validSortFields = ['name', 'price', 'createdAt', 'updatedAt', 'stock', 'salesCount'];
    if (validSortFields.includes(sortBy)) {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = -1; // Default sort
    }

    const options = {
      sort,
      limit: parseInt(limit) > 50 ? 50 : parseInt(limit), // Cap at 50 for performance
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip(options.skip)
        .select('-__v')
        .lean(),
      Product.countDocuments(filter)
    ]);

    console.log(`✅ Found ${products.length} products out of ${total} total`);

    return res.json({
      success: true,
      products,
      pagination: {
        totalPages: Math.ceil(total / options.limit),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / options.limit),
        hasPrev: parseInt(page) > 1
      },
      filters: {
        category,
        search,
        minPrice,
        maxPrice,
        inStock,
        featured
      }
    });
  } catch (error) {
    console.error('❌ Get products error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch products',
      details: error.message 
    });
  }
});

// ===============================
// 🔍 GET SINGLE PRODUCT
// ===============================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 Fetching product:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid product ID format' 
      });
    }

    const product = await Product.findById(id)
      .select('-__v')
      .lean();

    if (!product) {
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    if (!product.isActive && req.user?.role !== 'admin') {
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    console.log('✅ Product found:', product.name);
    return res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error('❌ Get product error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch product',
      details: error.message 
    });
  }
});

// ===============================
// ➕ CREATE NEW PRODUCT (Admin Only)
// ===============================
router.post('/', adminAuth, upload.array('images', 8), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const productData = req.body;
    
    console.log('➕ Creating new product:', productData.name);

    // Validate required fields
    const requiredFields = ['name', 'price', 'category', 'stock'];
    const missingFields = requiredFields.filter(field => !productData[field]);
    
    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    // Handle image uploads to Cloudinary
    const images = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Uploading ${req.files.length} images to Cloudinary...`);
      
      for (const [index, file] of req.files.entries()) {
        try {
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'olyshair/products',
                transformation: [
                  { width: 1200, height: 1200, crop: 'limit', quality: 'auto' },
                  { format: 'webp' }
                ]
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            stream.end(file.buffer);
          });
          
          images.push({
            url: result.secure_url,
            publicId: result.public_id,
            altText: productData.altText || `${productData.name} - Image ${index + 1}`,
            width: result.width,
            height: result.height,
            format: result.format
          });
          
          console.log(`✅ Image ${index + 1} uploaded: ${result.secure_url}`);
        } catch (uploadError) {
          console.error(`❌ Failed to upload image ${index + 1}:`, uploadError);
          // Continue with other images if one fails
        }
      }
    }

    // Generate SKU if not provided
    if (!productData.sku) {
      const categoryPrefix = productData.category.substring(0, 3).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      productData.sku = `${categoryPrefix}-${timestamp}`;
    }

    // Parse numeric fields
    const parsedData = {
      ...productData,
      price: parseFloat(productData.price),
      oldPrice: productData.oldPrice ? parseFloat(productData.oldPrice) : null,
      stock: parseInt(productData.stock),
      weight: productData.weight ? parseFloat(productData.weight) : null,
      salesCount: parseInt(productData.salesCount) || 0,
      rating: productData.rating ? parseFloat(productData.rating) : 0,
      reviewCount: parseInt(productData.reviewCount) || 0,
      isActive: productData.isActive !== 'false',
      isFeatured: productData.isFeatured === 'true',
      isNew: productData.isNew === 'true',
      images
    };

    // Create product
    const product = new Product(parsedData);
    await product.save({ session });
    await session.commitTransaction();

    console.log(`✅ Product created successfully: ${product.name} (${product._id})`);
    
    return res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: await Product.findById(product._id).select('-__v').lean()
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Create product error:', error);
    
    // Handle duplicate SKU
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        error: 'SKU already exists. Please use a unique SKU.' 
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: errors 
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: 'Failed to create product',
      details: error.message 
    });
  } finally {
    session.endSession();
  }
});

// ===============================
// ✏️ UPDATE PRODUCT (Admin Only)
// ===============================
router.put('/:id', adminAuth, upload.array('images', 8), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('✏️ Updating product:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false,
        error: 'Invalid product ID format' 
      });
    }

    const existingProduct = await Product.findById(id).session(session);
    if (!existingProduct) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    // Handle new image uploads
    let newImages = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Uploading ${req.files.length} new images...`);
      
      for (const [index, file] of req.files.entries()) {
        try {
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { 
                folder: 'olyshair/products',
                transformation: [
                  { width: 1200, height: 1200, crop: 'limit', quality: 'auto' },
                  { format: 'webp' }
                ]
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            stream.end(file.buffer);
          });
          
          newImages.push({
            url: result.secure_url,
            publicId: result.public_id,
            altText: updateData.altText || `${existingProduct.name} - Image ${index + 1}`,
            width: result.width,
            height: result.height,
            format: result.format
          });
        } catch (uploadError) {
          console.error(`❌ Failed to upload new image ${index + 1}:`, uploadError);
        }
      }
    }

    // Parse numeric fields
    const parsedData = { ...updateData };
    if (parsedData.price) parsedData.price = parseFloat(parsedData.price);
    if (parsedData.oldPrice) parsedData.oldPrice = parseFloat(parsedData.oldPrice);
    if (parsedData.stock) parsedData.stock = parseInt(parsedData.stock);
    if (parsedData.weight) parsedData.weight = parseFloat(parsedData.weight);
    if (parsedData.salesCount) parsedData.salesCount = parseInt(parsedData.salesCount);
    if (parsedData.rating) parsedData.rating = parseFloat(parsedData.rating);
    if (parsedData.reviewCount) parsedData.reviewCount = parseInt(parsedData.reviewCount);

    // Handle boolean fields
    if (parsedData.isActive !== undefined) parsedData.isActive = parsedData.isActive === 'true';
    if (parsedData.isFeatured !== undefined) parsedData.isFeatured = parsedData.isFeatured === 'true';
    if (parsedData.isNew !== undefined) parsedData.isNew = parsedData.isNew === 'true';

    // Combine existing images with new ones if not replacing all
    if (newImages.length > 0) {
      if (updateData.replaceImages === 'true') {
        // Delete old images from Cloudinary
        for (const image of existingProduct.images) {
          try {
            await cloudinary.uploader.destroy(image.publicId);
          } catch (deleteError) {
            console.error('❌ Failed to delete old image:', deleteError);
          }
        }
        parsedData.images = newImages;
      } else {
        parsedData.images = [...existingProduct.images, ...newImages];
      }
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { ...parsedData, updatedAt: new Date() },
      { 
        new: true, 
        runValidators: true,
        session 
      }
    ).select('-__v');

    await session.commitTransaction();

    console.log(`✅ Product updated successfully: ${updatedProduct.name}`);
    
    return res.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Update product error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: errors 
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: 'Failed to update product',
      details: error.message 
    });
  } finally {
    session.endSession();
  }
});

// ===============================
// 🗑️ DELETE PRODUCT (Soft Delete - Admin Only)
// ===============================
router.delete('/:id', adminAuth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    
    console.log('🗑️ Soft deleting product:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        success: false,
        error: 'Invalid product ID format' 
      });
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { 
        isActive: false,
        deletedAt: new Date(),
        deletedBy: req.user.id
      },
      { 
        new: true,
        session 
      }
    ).select('-__v');

    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    await session.commitTransaction();

    console.log(`✅ Product soft deleted: ${product.name}`);
    
    return res.json({
      success: true,
      message: 'Product deleted successfully',
      product
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Delete product error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to delete product',
      details: error.message 
    });
  } finally {
    session.endSession();
  }
});

// ===============================
// 🗑️ PERMANENT DELETE PRODUCT (Admin Only)
// ===============================
router.delete('/:id/permanent', adminAuth, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    
    console.log('💀 Permanent deleting product:', id);

    const product = await Product.findById(id).session(session);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    // Delete images from Cloudinary
    for (const image of product.images) {
      try {
        await cloudinary.uploader.destroy(image.publicId);
        console.log(`✅ Deleted image from Cloudinary: ${image.publicId}`);
      } catch (deleteError) {
        console.error('❌ Failed to delete image from Cloudinary:', deleteError);
      }
    }

    // Delete product from database
    await Product.findByIdAndDelete(id).session(session);
    await session.commitTransaction();

    console.log(`✅ Product permanently deleted: ${product.name}`);
    
    return res.json({
      success: true,
      message: 'Product permanently deleted'
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Permanent delete product error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to permanently delete product',
      details: error.message 
    });
  } finally {
    session.endSession();
  }
});

// ===============================
// 📊 GET PRODUCT STATISTICS (Admin Only)
// ===============================
router.get('/admin/statistics', adminAuth, async (req, res) => {
  try {
    console.log('📊 Fetching product statistics...');

    const [
      totalProducts,
      activeProducts,
      outOfStockProducts,
      lowStockProducts,
      totalCategories
    ] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ stock: 0, isActive: true }),
      Product.countDocuments({ stock: { $lte: 10, $gt: 0 }, isActive: true }),
      Product.distinct('category', { isActive: true })
    ]);

    const categoryStats = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalStock: { $sum: '$stock' },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const statistics = {
      totalProducts,
      activeProducts,
      outOfStockProducts,
      lowStockProducts,
      totalCategories: totalCategories.length,
      categoryStats,
      inventoryValue: await Product.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            totalValue: { $sum: { $multiply: ['$price', '$stock'] } }
          }
        }
      ]).then(result => result[0]?.totalValue || 0)
    };

    return res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('❌ Get product statistics error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch product statistics',
      details: error.message 
    });
  }
});

// ===============================
// 🧪 PRODUCT VALIDATION ENDPOINT
// ===============================
router.get('/validate/stock', async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.query;
    
    if (!productId) {
      return res.status(400).json({ 
        success: false,
        error: 'Product ID is required' 
      });
    }

    const product = await Product.findById(productId)
      .select('name price stock isActive images');
    
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

    if (product.stock < quantity) {
      return res.json({
        success: true,
        valid: false,
        error: `Insufficient stock. Only ${product.stock} available`,
        availableStock: product.stock
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
        image: product.images[0]?.url
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
// 🧪 TEST PRODUCTS ENDPOINT
// ===============================
router.get('/test/endpoint', (req, res) => {
  return res.json({
    success: true,
    message: 'Products endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;