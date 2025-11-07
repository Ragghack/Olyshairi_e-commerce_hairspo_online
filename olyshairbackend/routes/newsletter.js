// routes/newsletter.js
const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');
const nodemailer = require('nodemailer');

// Newsletter subscription endpoint
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    console.log('📧 Newsletter subscription attempt:', email);

    // Validate email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid email address is required' 
      });
    }

    // Check if email already exists
    const existingSubscriber = await Subscriber.findOne({ email });
    if (existingSubscriber) {
      return res.status(400).json({ 
        success: false,
        error: 'This email is already subscribed to our newsletter' 
      });
    }

    // Save to database
    const newSubscriber = new Subscriber({ 
      email: email.toLowerCase().trim(), 
      subscribedAt: new Date() 
    });
    await newSubscriber.save();

    console.log('✅ New subscriber saved:', email);

    // Send welcome email (optional - you can comment this out if email isn't set up)
    try {
      await sendWelcomeEmail(email);
      console.log('✅ Welcome email sent to:', email);
    } catch (emailError) {
      console.warn('⚠️ Welcome email failed, but subscription saved:', emailError.message);
    }

    res.status(200).json({ 
      success: true, 
      message: 'Successfully subscribed to newsletter!' 
    });

  } catch (error) {
    console.error('❌ Newsletter subscription error:', error);
    
    // More specific error messages
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        error: 'This email is already subscribed' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Subscription failed. Please try again.' 
    });
  }
});

// Get all subscribers (for admin use)
router.get('/subscribers', async (req, res) => {
  try {
    const subscribers = await Subscriber.find({ isActive: true })
      .sort({ subscribedAt: -1 });
    
    res.json({
      success: true,
      subscribers,
      total: subscribers.length
    });
  } catch (error) {
    console.error('❌ Get subscribers error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch subscribers' 
    });
  }
});

// Unsubscribe endpoint
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email is required' 
      });
    }

    const subscriber = await Subscriber.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { isActive: false },
      { new: true }
    );

    if (!subscriber) {
      return res.status(404).json({ 
        success: false,
        error: 'Email not found in our subscription list' 
      });
    }

    res.json({
      success: true,
      message: 'Successfully unsubscribed from newsletter'
    });

  } catch (error) {
    console.error('❌ Unsubscribe error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Unsubscribe failed. Please try again.' 
    });
  }
});

// Email sending function
async function sendWelcomeEmail(email) {
  // Only send emails if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('📧 Email credentials not configured, skipping welcome email');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to OLYS HAIR Newsletter!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #392625;">Welcome to OLYS HAIR!</h2>
          <p>Thank you for subscribing to our newsletter. You'll be the first to know about:</p>
          <ul>
            <li>New product launches</li>
            <li>Exclusive discounts and offers</li>
            <li>Hair care tips and tutorials</li>
            <li>Special promotions</li>
          </ul>
          <p>We're excited to have you in our community!</p>
          <p><strong>The OLYS HAIR Team</strong></p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw error;
  }
}

// Health check for newsletter routes
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Newsletter routes are working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;