// googleConfig.js - Centralized Google OAuth Configuration
const { OAuth2Client } = require("google-auth-library");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Prevent startup if GOOGLE_CLIENT_ID is missing
if (!GOOGLE_CLIENT_ID) {
  console.error(
    "FATAL ERROR: Missing GOOGLE_CLIENT_ID in environment file. Google OAuth will not work"
  );
}

const googleClient = GOOGLE_CLIENT_ID
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

module.exports = {
  GOOGLE_CLIENT_ID,
  googleClient,
};