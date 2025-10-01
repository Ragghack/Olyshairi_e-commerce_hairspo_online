// routes/auth.js (Corrected for PostgreSQL Abstraction)

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Load the PostgreSQL User Abstraction

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// register
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber } = req.body;

    if (!email || !password || !firstName || !lastName || !phoneNumber)
      return res.status(400).send({ error: "Missing required fields" });

    // Find existing user by email
    if (await User.findOne(email))
      return res.status(409).send({ error: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);

    // Create user using the User abstraction layer
    const user = await User.create({ firstName, lastName, email, passwordHash, phoneNumber });

    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        firstName:user.firstName, 
        lastName:user.lastName,
        phoneNumber:user.phoneNumber,
      }, 
      JWT_SECRET, 
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        lastLogin: user.lastLogin,
      },
    });
  } catch (err) {
    // Log the error for debugging
    console.error("Registration Error:", err.message);
    res.status(500).send({ error: "Server error during registration." });
  }
});

// login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne(email);

    if (!user) return res.status(401).send({ error: "Invalid email" });

    // Compare password hash (using the passwordHash property mapped in the model)
    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) return res.status(401).send({ error: "Invalid password" });

    // ✅ Update lastLogin in DB
    await User.updateLastLogin(user._id);

    const token = jwt.sign(
      { 
        id: user._id,
        email:user.email, 
        firstName:user.firstName, 
        lastName:user.lastName, 
        phoneNumber:user.phoneNumber,
      }, 
      JWT_SECRET, 
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        lastLogin: new Date().toISOString(), // Return current time as lastLogin
      },
    });
  } catch (err) {
    console.error("Login Error:", err.message);
    res.status(500).send({ error: "Server error during login." });
  }
});

module.exports = router;
