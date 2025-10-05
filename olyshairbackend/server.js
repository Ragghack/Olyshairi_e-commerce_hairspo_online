const express = require("express");
const cors = require("cors");

//Import the postgreSQL connection module (this will log connection status)
const db = require("./db");

// creating express app.
const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" })); // for multipart, multer used on route

// ADD THIS LINE - Serve static files from current directory
app.use(express.static(__dirname));

app.use('/api/config', require('./routes/config'));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/upload", require("./routes/uploads"));
app.use("/api/payments/stripe", require("./routes/payments/stripe"));
app.use("/api/payments/paypal", require("./routes/payments/paypal"));
// add klarna route

app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port", process.env.PORT || 5000);
});
