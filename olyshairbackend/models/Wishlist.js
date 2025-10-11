const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required'],
        index: true
    },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        image: String,
        addedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});
// Compound unique index - one wishlist per user
wishlistSchema.index({ userId: 1 }, { unique: true });

// Prevent duplicate products in the same wishlist
wishlistSchema.index({ userId: 1, 'items.productId': 1 }, { 
    unique: true,
    partialFilterExpression: { 'items.productId': { $exists: true } }
});

module.exports = mongoose.model('Wishlist', wishlistSchema);