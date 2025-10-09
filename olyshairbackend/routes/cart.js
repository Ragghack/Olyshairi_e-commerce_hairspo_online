const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

// ===== Debug Info on Load =====
console.log('🔍 [CartRoute] Route loaded successfully');

// ===============================
// 🛒 GET USER CART
// ===============================
router.get('/', auth, async (req, res) => {
    try {
        console.log('📋 Fetching cart for user:', req.user.id);
        
        let cart = await Cart.findOne({ userId: req.user.id })
            .populate('items.productId', 'name price images stock isActive');
        
        if (!cart) {
            // Create empty cart if doesn't exist
            cart = new Cart({
                userId: req.user.id,
                items: [],
                totalAmount: 0,
                itemCount: 0
            });
            await cart.save();
        }

        // Filter out inactive products and update quantities if stock is limited
        let updated = false;
        let totalAmount = 0;
        let itemCount = 0;

        cart.items = cart.items.filter(item => {
            if (!item.productId || !item.productId.isActive) {
                updated = true;
                return false;
            }
            
            if (item.quantity > item.productId.stock) {
                item.quantity = item.productId.stock;
                updated = true;
            }
            
            if (item.quantity > 0) {
                const itemTotal = item.productId.price * item.quantity;
                totalAmount += itemTotal;
                itemCount += item.quantity;
                return true;
            }
            
            updated = true;
            return false;
        });

        // Update cart totals
        cart.totalAmount = totalAmount;
        cart.itemCount = itemCount;
        cart.updatedAt = new Date();

        if (updated) {
            await cart.save();
        }

        console.log(`✅ Found ${cart.items.length} cart items, Total: $${totalAmount}`);
        
        return res.json({
            success: true,
            cart: {
                _id: cart._id,
                userId: cart.userId,
                items: cart.items,
                totalAmount: cart.totalAmount,
                itemCount: cart.itemCount,
                createdAt: cart.createdAt,
                updatedAt: cart.updatedAt
            }
        });
    } catch (error) {
        console.error('❌ Get cart error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to fetch cart',
            details: error.message 
        });
    }
});

// ===============================
// ➕ ADD TO CART
// ===============================
router.post('/add', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { productId, quantity = 1 } = req.body;
        
        console.log('➕ Adding to cart:', { productId, quantity, userId: req.user.id });

        // Validate input
        if (!productId) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: 'Product ID is required' 
            });
        }

        if (quantity < 1) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: 'Quantity must be at least 1' 
            });
        }

        // Validate product exists and is active
        const product = await Product.findById(productId).session(session);
        if (!product) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Product not found' 
            });
        }

        if (!product.isActive) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: 'Product is not available' 
            });
        }

        if (product.stock < quantity) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: `Insufficient stock. Only ${product.stock} available` 
            });
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId: req.user.id }).session(session);
        
        if (!cart) {
            cart = new Cart({
                userId: req.user.id,
                items: [],
                totalAmount: 0,
                itemCount: 0
            });
        }
        
        // Check if product already in cart
        const existingItemIndex = cart.items.findIndex(
            item => item.productId && item.productId.toString() === productId
        );
        
        let message = '';
        if (existingItemIndex !== -1) {
            // Update quantity
            const newQuantity = cart.items[existingItemIndex].quantity + quantity;
            if (newQuantity > product.stock) {
                await session.abortTransaction();
                return res.status(400).json({ 
                    success: false,
                    error: `Cannot add more than available stock (${product.stock})` 
                });
            }
            cart.items[existingItemIndex].quantity = newQuantity;
            cart.items[existingItemIndex].updatedAt = new Date();
            message = 'Cart item quantity updated';
        } else {
            // Add new item
            cart.items.push({
                productId,
                quantity,
                price: product.price,
                name: product.name,
                image: product.images?.[0]?.url || product.image,
                addedAt: new Date(),
                updatedAt: new Date()
            });
            message = 'Product added to cart successfully';
        }
        
        // Recalculate totals
        await recalculateCartTotals(cart);
        cart.updatedAt = new Date();
        
        await cart.save({ session });
        await session.commitTransaction();

        // Populate for response
        await cart.populate('items.productId', 'name price images category stock');
        
        console.log(`✅ ${message}`);
        return res.json({
            success: true,
            message,
            cart: {
                _id: cart._id,
                userId: cart.userId,
                items: cart.items,
                totalAmount: cart.totalAmount,
                itemCount: cart.itemCount,
                createdAt: cart.createdAt,
                updatedAt: cart.updatedAt
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Add to cart error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to add to cart',
            details: error.message 
        });
    } finally {
        session.endSession();
    }
});

// ===============================
// 📝 UPDATE CART ITEM QUANTITY
// ===============================
router.put('/update/:productId', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { productId } = req.params;
        const { quantity } = req.body;
        
        console.log('📝 Updating cart item:', { productId, quantity, userId: req.user.id });

        // Validate input
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: 'Invalid product ID' 
            });
        }

        if (quantity < 0) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: 'Quantity cannot be negative' 
            });
        }

        const cart = await Cart.findOne({ userId: req.user.id }).session(session);
        if (!cart) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Cart not found' 
            });
        }

        const itemIndex = cart.items.findIndex(
            item => item.productId && item.productId.toString() === productId
        );
        
        if (itemIndex === -1) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Product not found in cart' 
            });
        }

        if (quantity === 0) {
            // Remove item if quantity is 0
            cart.items.splice(itemIndex, 1);
        } else {
            // Check stock for quantity update
            const product = await Product.findById(productId).session(session);
            if (!product) {
                await session.abortTransaction();
                return res.status(404).json({ 
                    success: false,
                    error: 'Product not found' 
                });
            }

            if (quantity > product.stock) {
                await session.abortTransaction();
                return res.status(400).json({ 
                    success: false,
                    error: `Only ${product.stock} items available in stock` 
                });
            }

            cart.items[itemIndex].quantity = quantity;
            cart.items[itemIndex].updatedAt = new Date();
        }

        // Recalculate totals
        await recalculateCartTotals(cart);
        cart.updatedAt = new Date();

        await cart.save({ session });
        await session.commitTransaction();

        await cart.populate('items.productId', 'name price images stock');

        console.log('✅ Cart item updated successfully');
        return res.json({
            success: true,
            message: quantity === 0 ? 'Item removed from cart' : 'Cart updated successfully',
            cart: {
                _id: cart._id,
                userId: cart.userId,
                items: cart.items,
                totalAmount: cart.totalAmount,
                itemCount: cart.itemCount,
                createdAt: cart.createdAt,
                updatedAt: cart.updatedAt
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Update cart error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to update cart',
            details: error.message 
        });
    } finally {
        session.endSession();
    }
});

// ===============================
// 🗑️ REMOVE FROM CART
// ===============================
router.delete('/remove/:productId', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { productId } = req.params;
        
        console.log('🗑️ Removing from cart:', { productId, userId: req.user.id });

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false,
                error: 'Invalid product ID' 
            });
        }

        const cart = await Cart.findOne({ userId: req.user.id }).session(session);
        if (!cart) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Cart not found' 
            });
        }

        const initialLength = cart.items.length;
        cart.items = cart.items.filter(
            item => item.productId && item.productId.toString() !== productId
        );

        if (cart.items.length === initialLength) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Product not found in cart' 
            });
        }

        // Recalculate totals
        await recalculateCartTotals(cart);
        cart.updatedAt = new Date();

        await cart.save({ session });
        await session.commitTransaction();

        await cart.populate('items.productId', 'name price images');

        console.log('✅ Product removed from cart');
        return res.json({
            success: true,
            message: 'Product removed from cart',
            cart: {
                _id: cart._id,
                userId: cart.userId,
                items: cart.items,
                totalAmount: cart.totalAmount,
                itemCount: cart.itemCount,
                createdAt: cart.createdAt,
                updatedAt: cart.updatedAt
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Remove from cart error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to remove from cart',
            details: error.message 
        });
    } finally {
        session.endSession();
    }
});

// ===============================
// 🧹 CLEAR CART
// ===============================
router.delete('/clear', auth, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const cart = await Cart.findOne({ userId: req.user.id }).session(session);
        if (!cart) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false,
                error: 'Cart not found' 
            });
        }

        cart.items = [];
        cart.totalAmount = 0;
        cart.itemCount = 0;
        cart.updatedAt = new Date();

        await cart.save({ session });
        await session.commitTransaction();

        console.log('✅ Cart cleared successfully');
        return res.json({ 
            success: true,
            message: 'Cart cleared successfully' 
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('❌ Clear cart error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to clear cart',
            details: error.message 
        });
    } finally {
        session.endSession();
    }
});

// ===============================
// 📊 GET CART SUMMARY
// ===============================
router.get('/summary', auth, async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.user.id })
            .populate('items.productId', 'name price images stock isActive');

        if (!cart) {
            return res.json({
                success: true,
                summary: {
                    itemCount: 0,
                    totalAmount: 0,
                    totalItems: 0
                }
            });
        }

        // Calculate fresh totals
        let totalAmount = 0;
        let totalItems = 0;

        cart.items.forEach(item => {
            if (item.productId && item.productId.isActive) {
                const itemTotal = item.productId.price * item.quantity;
                totalAmount += itemTotal;
                totalItems += item.quantity;
            }
        });

        return res.json({
            success: true,
            summary: {
                itemCount: cart.items.length,
                totalAmount: parseFloat(totalAmount.toFixed(2)),
                totalItems: totalItems
            }
        });
    } catch (error) {
        console.error('❌ Get cart summary error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to get cart summary',
            details: error.message 
        });
    }
});

// ===============================
// 🧪 TEST CART ENDPOINT
// ===============================
router.get('/test/endpoint', auth, (req, res) => {
    return res.json({
        success: true,
        message: 'Cart endpoint is working!',
        userId: req.user.id,
        timestamp: new Date().toISOString()
    });
});

// ===============================
// 🔧 UTILITY FUNCTIONS
// ===============================

// Recalculate cart totals
async function recalculateCartTotals(cart) {
    let totalAmount = 0;
    let itemCount = 0;

    for (const item of cart.items) {
        const product = await Product.findById(item.productId);
        if (product && product.isActive) {
            const itemTotal = product.price * item.quantity;
            totalAmount += itemTotal;
            itemCount += item.quantity;
            
            // Update item price in case it changed
            item.price = product.price;
        }
    }

    cart.totalAmount = parseFloat(totalAmount.toFixed(2));
    cart.itemCount = itemCount;
}

module.exports = router;