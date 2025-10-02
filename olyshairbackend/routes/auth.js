// routes/auth.js (Corrected for PostgreSQL Abstraction)

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User"); // PostgreSQL User Abstraction

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// --- Register ---
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword } = req.body;

    // Basic validation
    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      return res.status(400).send({ error: "Missing required fields" });
    }

    // ✅ Ensure password and confirmPassword match
    if (password !== confirmPassword) {
      return res.status(400).send({ error: "Passwords do not match" });
    }

    // Check if user already exists
    if (await User.findOne(email)) {
      return res.status(409).send({ error: "Email already exists" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user in DB (no phoneNumber for now)
    const user = await User.create({
      firstName,
      lastName,
      email,
      passwordHash,
    });

    // Generate JWT
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        lastLogin: user.lastLogin || null,
      },
    });
  } catch (err) {
    console.error("Registration Error:", err.message);
    res.status(500).send({ error: "Server error during registration." });
  }
});

// --- Login ---
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne(email);
    if (!user) return res.status(401).send({ error: "Invalid email " });

    // Compare password
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).send({ error: "Invalid password" });

    // ✅ Update lastLogin in DB
    await User.updateLastLogin(user._id);

    // Generate JWT
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        lastLogin: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Login Error:", err.message);
    res.status(500).send({ error: "Server error during login." });
  }
});

module.exports = router;
