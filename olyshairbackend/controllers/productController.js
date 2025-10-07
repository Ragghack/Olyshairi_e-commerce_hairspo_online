const Product = require("../models/Product");
const cloudinary = require("cloudinary").v2;

// Configure with validation
const configureCloudinary = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  console.log('🔧 Cloudinary Config Check:');
  console.log('Cloud Name:', cloudName);
  console.log('API Key:', apiKey ? '***' + apiKey.slice(-4) : 'Missing');
  console.log('API Secret:', apiSecret ? '***' + apiSecret.slice(-4) : 'Missing');

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('❌ Cloudinary configuration incomplete!');
    return false;
  }

  try {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    console.log('✅ Cloudinary configured successfully');
    return true;
  } catch (error) {
    console.error('❌ Cloudinary configuration failed:', error);
    return false;
  }
};

// Call this when your server starts
configureCloudinary();

// =========================
// CREATE PRODUCT
// =========================
exports.createProduct = async (req, res) => {
  try {
    const { name, category, price, stock, color, texture, length, quality } = req.body;

    if (!name || !category || !price) {
      return res.status(400).json({ error: "Name, category, and price are required" });
    }

    let imageUrl = null;

    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      console.warn('⚠️ Cloudinary not configured - skipping image upload');
    }
    // Handle image upload if file exists AND Cloudinary is configured
    else if (req.file) {
      try {
        console.log("📤 Uploading image to Cloudinary...");
        
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "olyshair/products",
          resource_type: "image"
        });
        
        imageUrl = result.secure_url;
        console.log("✅ Image uploaded successfully:", imageUrl);
      } catch (uploadError) {
        console.error("❌ Cloudinary upload failed:", uploadError);
        // Continue without image rather than failing the entire product creation
        console.log("🔄 Continuing product creation without image");
      }
    }

    const newProduct = new Product({
      name,
      category,
      price,
      stock: stock || 0,
      color,
      texture,
      length,
      quality,
      image: imageUrl,
    });

    await newProduct.save();
    
    res.status(201).json({ 
      message: "Product created successfully", 
      product: newProduct 
    });
  } catch (error) {
    console.error("❌ Create product error:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
};

// =========================
// GET ALL PRODUCTS
// =========================
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error("Fetch products error:", error.message);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// =========================
// GET ONE PRODUCT BY ID
// =========================
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch product" });
  }
};

// =========================
// UPDATE PRODUCT
// =========================
exports.updateProduct = async (req, res) => {
  try {
    const { name, category, price, stock, color, texture, length, quality } = req.body;

    const updatedData = { name, category, price, stock, color, texture, length, quality };

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: "products" });
      updatedData.image = result.secure_url;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updatedData, { new: true });

    if (!product) return res.status(404).json({ error: "Product not found" });

    res.status(200).json({ message: "Product updated successfully", product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================
// DELETE PRODUCT
// =========================
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
};
