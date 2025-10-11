const express = require('express');
const router = express.Router();
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

// ===== Debug Info on Load =====
console.log('🔍 [WishlistRoute] Route loaded successfully');

// ===============================
// ❤️ GET USER WISHLIST
// ===============================
router.get('/', auth, async (req, res) => {
    try {
        console.log('📋 Fetching wishlist for user:', req.user.id);
        
        const wishlist = await Wishlist.findOne({ userId: req.user.id })
            .populate('items.productId', 'name price images category stock isActive');
        
        if (!wishlist) {
            return res.json([]);
        }

        // Filter out inactive products
        const activeItems = wishlist.items.filter(item => 
            item.productId && item.productId.isActive !== false
        );

        console.log(`✅ Found ${activeItems.length} wishlist items`);
        res.json(activeItems);
    } catch (error) {
        console.error('❌ Get wishlist error:', error);
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});

// ===============================
// ➕ ADD TO WISHLIST
// ===============================
router.post('/', auth, async (req, res) => {
    try {
        const { productId, name, price, image } = req.body;
        
        console.log('➕ Adding to wishlist:', { productId, userId: req.user.id });

        // Validate product exists and is active
        const product = await Product.findById(productId);
        if (!product || !product.isActive) {
            return res.status(404).json({ error: 'Product not found or unavailable' });
        }

        let wishlist = await Wishlist.findOne({ userId: req.user.id });
        
        if (!wishlist) {
            wishlist = new Wishlist({
                userId: req.user.id,
                items: []
            });
        }
        
        // Check if product already in wishlist
        const existingItemIndex = wishlist.items.findIndex(
            item => item.productId && item.productId.toString() === productId
        );
        
        if (existingItemIndex !== -1) {
            return res.status(400).json({ error: 'Product already in wishlist' });
        }
        
        wishlist.items.push({
            productId,
            name: name || product.name,
            price: price || product.price,
            image: image || (product.images && product.images[0]?.url) || product.image,
            addedAt: new Date()
        });
        
        await wishlist.save();
        
        // Populate the response
        await wishlist.populate('items.productId', 'name price images category');
        
        console.log('✅ Product added to wishlist successfully');
        res.json({
            message: 'Product added to wishlist',
            wishlist: wishlist.items
        });
    } catch (error) {
        console.error('❌ Add to wishlist error:', error);
        res.status(500).json({ error: 'Failed to add to wishlist' });
    }
});

// ===============================
// 🗑️ REMOVE FROM WISHLIST
// ===============================
router.delete('/:productId', auth, async (req, res) => {
    try {
        const { productId } = req.params;
        
        console.log('🗑️ Removing from wishlist:', { productId, userId: req.user.id });

        const wishlist = await Wishlist.findOne({ userId: req.user.id });
        
        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found' });
        }

        const initialLength = wishlist.items.length;
        wishlist.items = wishlist.items.filter(
            item => item.productId && item.productId.toString() !== productId
        );

        if (wishlist.items.length === initialLength) {
            return res.status(404).json({ error: 'Product not found in wishlist' });
        }

        await wishlist.save();
        
        console.log('✅ Product removed from wishlist');
        res.json({
            message: 'Product removed from wishlist',
            wishlist: wishlist.items
        });
    } catch (error) {
        console.error('❌ Remove from wishlist error:', error);
        res.status(500).json({ error: 'Failed to remove from wishlist' });
    }
});

// ===============================
// 📊 GET WISHLIST COUNT
// ===============================
router.get('/count', auth, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ userId: req.user.id });
        const count = wishlist ? wishlist.items.length : 0;
        
        res.json({ count });
    } catch (error) {
        console.error('❌ Get wishlist count error:', error);
        res.status(500).json({ error: 'Failed to get wishlist count' });
    }
});

// ===============================
// 🛒 MOVE TO CART (From Wishlist)
// ===============================
router.post('/:productId/move-to-cart', auth, async (req, res) => {
    try {
        const { productId } = req.params;
        
        console.log('🛒 Moving wishlist item to cart:', { productId, userId: req.user.id });

        // First, remove from wishlist
        const wishlist = await Wishlist.findOne({ userId: req.user.id });
        if (!wishlist) {
            return res.status(404).json({ error: 'Wishlist not found' });
        }

        const itemIndex = wishlist.items.findIndex(
            item => item.productId && item.productId.toString() === productId
        );
        
        if (itemIndex === -1) {
            return res.status(404).json({ error: 'Product not found in wishlist' });
        }

        const [wishlistItem] = wishlist.items.splice(itemIndex, 1);
        await wishlist.save();

        // TODO: Add to cart - you'll need to implement this based on your cart structure
        console.log('📦 Would add to cart:', wishlistItem);
        
        res.json({
            message: 'Product moved to cart',
            product: wishlistItem,
            wishlist: wishlist.items
        });
    } catch (error) {
        console.error('❌ Move to cart error:', error);
        res.status(500).json({ error: 'Failed to move product to cart' });
    }
});
// ➕ ADD TO WISHLIST - UPDATED WITH BETTER ERROR HANDLING
router.post('/', auth, async (req, res) => {
    try {
        const { productId, name, price, image } = req.body;
        
        console.log('➕ Adding to wishlist:', { productId, userId: req.user.id });

        // Validate user authentication
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User authentication required' });
        }

        // Validate product exists and is active
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        if (!product.isActive) {
            return res.status(400).json({ error: 'Product is not available' });
        }

        // Find or create wishlist with proper error handling
        let wishlist = await Wishlist.findOne({ userId: req.user.id });
        
        if (!wishlist) {
            try {
                wishlist = new Wishlist({
                    userId: req.user.id,
                    items: []
                });
                await wishlist.save();
            } catch (createError) {
                // Handle case where wishlist might have been created by another request
                if (createError.code === 11000) {
                    wishlist = await Wishlist.findOne({ userId: req.user.id });
                    if (!wishlist) {
                        throw new Error('Failed to create wishlist');
                    }
                } else {
                    throw createError;
                }
            }
        }
        
        // Check if product already in wishlist
        const existingItem = wishlist.items.find(
            item => item.productId && item.productId.toString() === productId
        );
        
        if (existingItem) {
            return res.status(400).json({ error: 'Product already in wishlist' });
        }
        
        // Add new item
        wishlist.items.push({
            productId,
            name: name || product.name,
            price: price || product.price,
            image: image || (product.images && product.images[0]?.url) || product.image,
            addedAt: new Date()
        });
        
        await wishlist.save();
        
        // Populate the response
        await wishlist.populate('items.productId', 'name price images category');
        
        console.log('✅ Product added to wishlist successfully');
        res.json({
            message: 'Product added to wishlist',
            wishlist: wishlist.items
        });
        
    } catch (error) {
        console.error('❌ Add to wishlist error:', error);
        
        // Handle specific MongoDB errors
        if (error.code === 11000) {
            // Extract more details from the error
            if (error.keyPattern && error.keyPattern.userId) {
                return res.status(400).json({ 
                    error: 'Duplicate wishlist detected. Please try again.' 
                });
            }
        }
        
        res.status(500).json({ 
            error: 'Failed to add to wishlist',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});
// ===============================
// TEST WISHLIST ROUTE
// ===============================
router.get('/test/endpoint', auth, (req, res) => {
    res.json({
        message: 'Wishlist endpoint is working!',
        userId: req.user.id,
        timestamp: new Date().toISOString()
    });
});


module.exports = router;