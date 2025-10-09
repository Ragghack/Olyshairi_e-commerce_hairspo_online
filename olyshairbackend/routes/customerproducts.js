const express = require('express');
const router = express.Router();

// Product validation endpoint
router.get('/validate', async (req, res) => {
  try {
    const { productId } = req.query;
    
    // Mock validation - in real app, check database
    if (productId) {
      res.json({ 
        valid: true, 
        product: { 
          id: productId, 
          name: 'Sample Product', 
          price: 99.99,
          inStock: true 
        } 
      });
    } else {
      res.json({ valid: false, error: 'Product ID required' });
    }
  } catch (error) {
    console.error('Product validation error:', error);
    res.status(500).json({ error: 'Product validation failed' });
  }
});

module.exports = router;