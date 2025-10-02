// models/User.js
const db = require('../db'); // Import your PostgreSQL connection pool

class User {
    // --- Static method to find a user by email ---
    static async findOne(email) {
        const queryText = `
            SELECT user_id, email, password_hash, first_name, last_name, phone_number, last_login
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
                // ... other fields as needed
            };
        }
        return null;
    }

    // --- Static method to create a new user ---
    static async create({ firstName, lastName, email, passwordHash, phoneNumber = null }) {
        // NOTE: Your SQL script uses 'first_name' and 'last_name', but the auth.js sends 'name'.
        // For simplicity, we'll store the entire 'name' in 'first_name' and leave 'last_name' blank.
        const queryText = `
            INSERT INTO users (first_name, last_name, email, password_hash, phone_number, last_login)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING user_id, first_name, last_name, email, phone_number, last_login;
        `;
        const result = await db.query(queryText, [firstName, lastName, email, passwordHash, phoneNumber]);
        const newUser = result.rows[0];

        return {
            _id: newUser.user_id,
            firstName: newUser.first_name,
            lastName: newUser.last_name,
            email: newUser.email,
            phoneNumber: newUser.phone_number,
            lastLogin: newUser.last_login,
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
}

module.exports = User;