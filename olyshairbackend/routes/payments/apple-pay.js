// routes/payments/apple-pay.js
const express = require('express');
const router = express.Router();

// Validate merchant domain for Apple Pay
router.post('/validate-merchant', async (req, res) => {
    try {
        const { validationURL, domain } = req.body;

        // Validate that the domain matches your registered domain
        const allowedDomains = ['yourdomain.com', 'www.yourdomain.com']; // Add your domains
        if (!allowedDomains.includes(domain)) {
            return res.status(400).json({
                success: false,
                error: 'Domain not authorized for Apple Pay'
            });
        }

        // In production, you would use the Apple Pay Node.js SDK
        // For now, this is a simplified version
        const response = await fetch(validationURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                merchantIdentifier: process.env.APPLE_MERCHANT_ID,
                domainName: domain,
                displayName: 'OLYS HAIR'
            })
        });

        const merchantSession = await response.json();

        res.json({
            success: true,
            merchantSession: merchantSession
        });

    } catch (error) {
        console.error('Apple Pay merchant validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Merchant validation failed'
        });
    }
});

// Process Apple Pay payment
router.post('/process-payment', async (req, res) => {
    try {
        const { payment, amount, currency, items, shipping, orderId } = req.body;

        // Validate payment token
        const paymentToken = payment.token;
        
        // Process payment through your payment processor (Stripe, etc.)
        // This example uses Stripe
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            payment_method_data: {
                type: 'card',
                card: {
                    token: paymentToken.paymentData // Apple Pay payment data
                }
            },
            confirmation_method: 'automatic',
            confirm: true,
            return_url: `${process.env.FRONTEND_URL}/order-confirmation`,
            metadata: {
                order_id: orderId,
                payment_method: 'apple_pay',
                customer_email: shipping.email
            }
        });

        if (paymentIntent.status === 'succeeded') {
            // Create order record
            const order = await Order.create({
                user: req.user?.id,
                items: items,
                total: amount / 100,
                currency: currency,
                paymentProvider: 'apple-pay',
                paymentStatus: 'completed',
                transactionId: paymentIntent.id,
                shipping: shipping,
                metadata: {
                    apple_pay_payment: payment,
                    stripe_payment_intent: paymentIntent
                }
            });

            res.json({
                success: true,
                transactionId: paymentIntent.id,
                orderId: order._id
            });
        } else {
            throw new Error(`Payment status: ${paymentIntent.status}`);
        }

    } catch (error) {
        console.error('Apple Pay payment processing error:', error);
        res.status(500).json({
            success: false,
            error: 'Payment processing failed'
        });
    }
});

module.exports = router;