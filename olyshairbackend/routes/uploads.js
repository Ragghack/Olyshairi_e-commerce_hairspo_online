const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const path = require('path');
const fs = require('fs');

// Initialize router
const router = express.Router();

// Cloudinary configuration with error handling
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
} else {
  console.warn('⚠️ Cloudinary configuration missing - using local storage only');
}

// Multer configuration - memory storage for Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Validate file types
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
    }
  }
});

// Ensure local uploads directory exists
const ensureUploadsDir = () => {
  const uploadsDir = path.join(__dirname, '../uploads');
  const avatarsDir = path.join(uploadsDir, 'avatars');
  
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }
  
  return avatarsDir;
};

// Upload avatar to Cloudinary
router.post('/avatar', upload.single('file'), async (req, res) => {
  try {
    // Validate file exists
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({
        success: false,
        error: 'Cloudinary not configured - please set up Cloudinary environment variables'
      });
    }

    // Upload to Cloudinary using promise-based approach
    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { 
            folder: 'uploads/avatars',
            transformation: [
              { width: 200, height: 200, crop: 'fill', gravity: 'face' },
              { quality: 'auto' },
              { format: 'webp' } // Convert to WebP for better performance
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
    };

    const result = await uploadToCloudinary();

    // TODO: Save avatar URL to your PostgreSQL database
    // Example: await updateUserAvatar(req.user.id, result.secure_url);

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatarUrl: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      size: result.bytes
    });

  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to upload avatar' 
    });
  }
});

// Fallback: Upload avatar to local storage if Cloudinary fails
router.post('/avatar/local', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    const avatarsDir = ensureUploadsDir();
    const filename = `avatar-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
    const filepath = path.join(avatarsDir, filename);

    // Save file locally
    fs.writeFileSync(filepath, req.file.buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    // TODO: Save avatar URL to your PostgreSQL database
    // Example: await updateUserAvatar(req.user.id, avatarUrl);

    res.json({
      success: true,
      message: 'Avatar uploaded to local storage',
      avatarUrl: avatarUrl,
      filename: filename,
      local: true
    });

  } catch (error) {
    console.error('Local avatar upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload avatar to local storage' 
    });
  }
});

// Upload product images
router.post('/product', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No image file uploaded' 
      });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({
        success: false,
        error: 'Cloudinary not configured'
      });
    }

    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { 
            folder: 'uploads/products',
            transformation: [
              { width: 800, height: 800, crop: 'limit' },
              { quality: 'auto' },
              { format: 'webp' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
    };

    const result = await uploadToCloudinary();

    res.json({
      success: true,
      message: 'Product image uploaded successfully',
      image: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        size: result.bytes,
        width: result.width,
        height: result.height
      }
    });

  } catch (error) {
    console.error('Product image upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to upload product image' 
    });
  }
});

// Upload multiple files
router.post('/multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No files uploaded' 
      });
    }

    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { 
            folder: 'uploads/general',
            transformation: [
              { quality: 'auto' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        streamifier.createReadStream(file.buffer).pipe(stream);
      });
    });

    const results = await Promise.all(uploadPromises);

    const uploadedFiles = results.map(result => ({
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      size: result.bytes
    }));

    res.json({
      success: true,
      message: `${req.files.length} files uploaded successfully`,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('Multiple files upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload files' 
    });
  }
});

// Delete image from Cloudinary
router.delete('/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({
        success: false,
        error: 'Cloudinary not configured'
      });
    }

    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result === 'ok') {
      res.json({
        success: true,
        message: 'Image deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Image not found or already deleted'
      });
    }

  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete image' 
    });
  }
});

// Health check for upload service
router.get('/health', (req, res) => {
  const cloudinaryStatus = process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured';
  
  res.json({
    service: 'Upload Service',
    status: 'operational',
    cloudinary: cloudinaryStatus,
    maxFileSize: '5MB',
    allowedFormats: ['JPEG', 'PNG', 'GIF', 'WebP']
  });
});

module.exports = router;