const express = require("express");
const router = express.Router();

// Provide Google Client ID to frontend
router.get("/google-client-id", (req, res) => {
  res.json({ 
    clientId: process.env.GOOGLE_CLIENT_ID || null,
    hasGoogleAuth: !!process.env.GOOGLE_CLIENT_ID
  });
});

module.exports = router;