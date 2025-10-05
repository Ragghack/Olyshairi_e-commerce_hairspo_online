// routes/config.js
const express = require("express");
const router = express.Router();

router.get("/google-client-id", (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID });
});

module.exports = router;
