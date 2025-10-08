const express = require('express');
const router = express.Router();
const Wishlist = require('../models/Wishlist');
const auth = require('../middleware/auth');

// Add to wishlist
router.post('/', auth, async (req, res) => {
    try {
        const { productId, name, price, image } = req.body;
        
        let wishlist = await Wishlist.findOne({ userId: req.user.id });
        
        if (!wishlist) {
            wishlist = new Wishlist({
                userId: req.user.id,
                items: []
            });
        }
        
        // Check if product already in wishlist
        const existingItem = wishlist.items.find(item => item.productId === productId);
        if (existingItem) {
            return res.status(400).json({ error: 'Product already in wishlist' });
        }
        
        wishlist.items.push({
            productId,
            name,
            price,
            image
        });
        
        await wishlist.save();
        res.json(wishlist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user wishlist
router.get('/', auth, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ userId: req.user.id })
            .populate('items.productId');
        res.json(wishlist?.items || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;