const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { GOOGLE_CLIENT_ID, googleClient } = require("../config/google");
const User = require("../models/User"); // PostgreSQL User Abstraction

const JWT_SECRET = process.env.JWT_SECRET;

//Google Signin Route
exports.google = async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !googleClient) {
    return res
      .status(500)
      .json({ error: "Google OAuth is not configured on this server" });
  }

  try {
    const { token } = req.body; // Google ID Token from frontend
    if (!token) {
      return res.status(400).json({ error: "Missing Google ID token" });
    }

    // Verify token with Gogle
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    // Extract Google's unique ID (sub), email and names
    const {
      email,
      given_name: firstName,
      family_name: lastName,
      sub: googleId,
    } = payload;

    // Check if user exists
    let user = await User.findOne(email);
    if (!user) {
      // Create new user without password (OAuth uses an external auth)
      user = await User.create({
        firstName,
        lastName,
        email,
        googleId, // Pass the unique Google ID
        // passwordHash: null is removed and handled by the model now
      });
    }
    // 3. Update the existing user;s google_id if it's missing (e.g., they registered via passowrd first)
    // It's good practice for linking accounts.

    if (!user && !user.google_id) {
      // Assume there is an update method in the User Model
      await User.updateGoogleId(user._id, googleId);
    }

    // Generate app's own JWT
    const appToken = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token: appToken, user });
  } catch (err) {
    console.error("Google OAuth Error:", err.message);
    res.status(401).json({ error: "Invalid Google login or token expired" });
  }
};

// --- Register ---
exports.register = async (req, res) => {
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
};

// --- Login ---
exports.login = async (req, res) => {
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
};

module.exports = {
  register: exports.register,
  login: exports.login,
  google: exports.google,
};
