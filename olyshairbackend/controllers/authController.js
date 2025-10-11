const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { secret, expiresIn } = require("../config/jwt");
const {googleClient} = require("../config/google");

// Google Signin Route (Placeholder for future implementation)
const client = googleClient;

exports.google = async (req, res) => {
  try {
    const { token } = req.body; // received from frontend

    // 1️⃣ Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub, email, name, picture } = payload;

    // 2️⃣ Find or create user in your DB
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        googleId: sub,
        email,
        firstName: name.split(" ")[0],
        lastName: name.split(" ")[1] || "",
        profilePic: picture,
      });
    }

    // 3️⃣ Create JWT for your app
    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // 4️⃣ Send token and user info to frontend
    res.json({
      token: jwtToken,
      user,
    });
  } catch (err) {
    console.error("Google OAuth Error:", err);
    res.status(500).json({ error: "Google authentication failed" });
  }
};

// --- Register ---
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword } = req.body;

    console.log("📝 Registration attempt:", { firstName, lastName, email });

    // Basic validation
    if (!email || !password || !confirmPassword || !firstName || !lastName) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Ensure password and confirmPassword match
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user in DB
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
      secret, // Use centralized secret
      { expiresIn } // Use centralized expiresIn
    );

    console.log("✅ User registered successfully:", user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        memberSince: user.memberSince,
      },
    });
  } catch (err) {
    console.error("❌ Registration Error:", err);
    res
      .status(500)
      .json({ error: "Server error during registration: " + err.message });
  }
};

// --- Login ---
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔐 Login attempt for:", email);

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if user has password (OAuth users might not have passwords)
    if (!user.passwordHash) {
      return res
        .status(401)
        .json({ error: "Please use Google login for this account" });
    }

    // Compare password
    const isPasswordValid = await user.checkPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update lastLogin in DB
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT with centralized config
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      secret, // Use centralized secret
      { expiresIn } // Use centralized expiresIn
    );

    console.log("✅ User logged in successfully:", user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        lastLogin: user.lastLogin,
        memberSince: user.memberSince,
      },
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res
      .status(500)
      .json({ error: "Server error during login: " + err.message });
  }
};

// --- Get User Profile ---
exports.getProfile = async (req, res) => {
  try {
    // The auth middleware already attached the user
    const user = req.user;
    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        memberSince: user.memberSince,
        lastLogin: user.lastLogin,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("❌ Profile Error:", err);
    res.status(500).json({ error: "Server error fetching profile" });
  }
};

// Add this to your existing authController.js
exports.getProfile = async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Verify token with centralized secret
    const decoded = jwt.verify(token, secret);

    // Find user
    const user = await User.findById(decoded.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        memberSince: user.memberSince,
        lastLogin: user.lastLogin,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Profile Error:", err);
    res.status(401).json({ error: "Invalid token" });
  }
};
