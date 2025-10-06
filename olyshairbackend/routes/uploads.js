const express = require('express'); // FIXED: Changed from 'mongoose'
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const User = require('../models/User');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer();
const router = express.Router();

// TODO: You need to create auth middleware
// const auth = require('./auth'); // This should be a middleware file

router.post('/avatar', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send({ error: 'No file' });

    const stream = cloudinary.uploader.upload_stream({ folder:'olyshair/avatars' }, async (err, result) => {
      if (err) return res.status(500).send({ error: err.message });
      // TODO: Implement user update logic for PostgreSQL
      res.json({ avatarUrl: result.secure_url });
    });

    streamifier.createReadStream(req.file.buffer).pipe(stream);

  } catch(err) { 
    res.status(500).send({ error: err.message }); 
  }
});

module.exports = router;