// models/User.js
const db = require("../db"); // Import your PostgreSQL connection pool
const bcrypt = require("bcryptjs");

class User {
  // --- Static method to find a user by email ---
  static async findOne(email) {
    const queryText = `
            SELECT user_id, email, password_hash, first_name, last_name, phone_number, last_login, google_id
            FROM users 
            WHERE email = $1
        `;
    const result = await db.query(queryText, [email]);

    // PostgreSQL primary keys are named 'user_id', but the auth logic expects '_id'
    // We'll map the name and other properties to match the Mongoose structure expected by auth.js
    const user = result.rows[0];
    if (user) {
      return {
        _id: user.user_id, // Map PK to expected property
        firstName: user.first_name, // Map first_name to 'firstName'
        lastName: user.last_name, // Map last_name to 'lastName'
        email: user.email,
        passwordHash: user.password_hash,
        phoneNumber: user.phone_number,
        lastLogin: user.last_login, // Example of additional fields
        googleId: user.google_id, //New: Map google ID
        // ... other fields as needed
      };
    }
    return null;
  }

  // --- Static method to create a new user ---
  static async create({
    firstName,
    lastName,
    email,
    passwordHash,
    phoneNumber = null,
    googleId = null,
  }) {
    let finalPasswordHash = passwordHash;
    if (googleId && !passwordHash) {
      // This is an OAuth registration. Generate a non-null, unique placeholder hash
      const placeholderSource =
        googleId + Math.random().toString(36).substring(2);
      finalPasswordHash = await bcrypt.hash(placeholderSource, 12);
    } else if (!passwordHash) {
      // If it's a standard registration, passwordHash must be provided by the router.
      // Throw an error if it's still missing and not an OAuth flow
      throw new Error("Password hash is required for non-OAuth registrations");
    }

    // NOTE: Your SQL script uses 'first_name' and 'last_name', but the auth.js sends 'name'.
    // For simplicity, we'll store the entire 'name' in 'first_name' and leave 'last_name' blank.
    const queryText = `
            INSERT INTO users (first_name, last_name, email, password_hash, phone_number, google_id, last_login)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING user_id, first_name, last_name, email, phone_number, last_login, google_id;
        `;
    const result = await db.query(queryText, [
      firstName,
      lastName,
      email,
      finalPasswordHash,
      phoneNumber,
      googleId

    ]);
    const newUser = result.rows[0];

    return {
      _id: newUser.user_id,
      firstName: newUser.first_name,
      lastName: newUser.last_name,
      email: newUser.email,
      phoneNumber: newUser.phone_number,
      lastLogin: newUser.last_login,
      googleId: newUser.google_id,
      passwordHash: finalPasswordHash, // return the hash for subsequent use if needed
      // ... other fields as needed
    };
  }

  // ✅ Update lastLogin timestamp
  static async updateLastLogin(userId) {
    const queryText = `
      UPDATE users 
      SET last_login = NOW()
      WHERE user_id = $1
    `;
    await db.query(queryText, [userId]);
  }

  // Update Google ID (for linking existing accounts)
  static async updateGoogleId(userId, googleId) {
    const queryText = `
      UPDATE users
      SET google_id = $1
      WHERE user_id = $2
    `;
    await db.query(queryText, [googleId, userId]);
  }
}

module.exports = User;
