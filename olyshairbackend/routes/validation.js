// routes/validation.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

console.log('🔍 Validation routes loaded');

// ===============================
// 📦 BATCH PRODUCT VALIDATION
// ===============================
router.post('/products/validate/batch', async (req, res) => {
    try {
        console.log('🔍 Batch product validation request received');
        
        const { items } = req.body;

        // Validate request structure
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request format',
                message: 'Request must contain { items: array }'
            });
        }

        // Limit batch size for performance
        if (items.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'Batch too large',
                message: 'Maximum 50 items per validation request'
            });
        }

        const validationResults = [];
        const invalidItems = [];

        for (const item of items) {
            try {
                if (!item.productId) {
                    invalidItems.push({
                        ...item,
                        valid: false,
                        error: 'MISSING_PRODUCT_ID'
                    });
                    continue;
                }

                const product = await Product.findById(item.productId);
                if (!product) {
                    invalidItems.push({
                        ...item,
                        valid: false,
                        error: 'PRODUCT_NOT_FOUND'
                    });
                    continue;
                }

                if (!product.isActive) {
                    invalidItems.push({
                        ...item,
                        valid: false,
                        error: 'PRODUCT_INACTIVE',
                        productName: product.name
                    });
                    continue;
                }

                const quantity = parseInt(item.quantity) || 1;
                if (product.stock < quantity) {
                    invalidItems.push({
                        ...item,
                        valid: false,
                        error: 'INSUFFICIENT_STOCK',
                        availableStock: product.stock,
                        productName: product.name
                    });
                    continue;
                }

                // Valid item
                validationResults.push({
                    productId: item.productId,
                    valid: true,
                    name: product.name,
                    price: product.price,
                    stock: product.stock,
                    images: product.images,
                    canProceed: true
                });

            } catch (error) {
                invalidItems.push({
                    ...item,
                    valid: false,
                    error: 'VALIDATION_ERROR'
                });
            }
        }

        res.json({
            success: true,
            isValid: invalidItems.length === 0,
            items: validationResults,
            invalidItems: invalidItems,
            validatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Validation failed',
            message: error.message
        });
    }
});

module.exports = router;