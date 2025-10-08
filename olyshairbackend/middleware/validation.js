const { body, validationResult } = require('express-validator');

const validatePaymentRequest = [
  body('amount')
    .isFloat({ min: 0.5 })
    .withMessage('Amount must be at least $0.50'),
  body('currency')
    .isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD']) // Add supported currencies
    .withMessage('Invalid currency'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.name')
    .notEmpty()
    .withMessage('Item name is required'),
  body('items.*.price')
    .isFloat({ min: 0 })
    .withMessage('Item price must be a positive number'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Item quantity must be at least 1'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validatePaymentRequest
};