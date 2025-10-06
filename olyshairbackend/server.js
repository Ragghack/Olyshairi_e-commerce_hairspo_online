// Load environment variables first
require("dotenv").config({ path: "./olyshair.env" });

// Import dependencies
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Create express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.static(__dirname));

// Connect to MongoDB
const MONGODB_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/olyshair";
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected successfully"))
.catch(err => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

// Test route to verify server is working
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Server is running!', 
    timestamp: new Date(),
    database: 'MongoDB'
  });
});

// Health check with database connection test
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await mongoose.connection.db.admin().ping();
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'Error', 
      database: 'Disconnected',
      error: error.message 
    });
  }
});

// Routes
app.use("/api/config", require("./routes/config"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/customer", require("./routes/customer"));
app.use("/api/upload", require("./routes/uploads"));

// Admin Routes
app.use("/api/admin/auth", require("./routes/adminAuth"));
app.use("/api/admin/products", require("./routes/products"));
app.use("/api/admin/activities", require("./routes/activities"));
app.use("/api/admin/orders", require("./routes/orders")); // Add this line
app.use("/api/admin/users", require("./routes/users")); // Add this line



// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 MongoDB: ${MONGODB_URI}`);
  console.log(`📍 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📍 Admin Auth: http://localhost:${PORT}/api/admin/auth/register`);
  console.log(`📍 Admin Products: http://localhost:${PORT}/api/admin/products`);
  console.log(`📍 Admin Orders: http://localhost:${PORT}/api/admin/orders`);
  console.log(`📍 Admin Users: http://localhost:${PORT}/api/admin/users`);
});