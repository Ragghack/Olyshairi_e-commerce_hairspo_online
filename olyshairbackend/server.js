require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({limit:'8mb'})); // for multipart, multer used on route

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser:true, useUnifiedTopology:true })
  .then(()=>console.log('MongoDB connected'))
  .catch(e=>console.error(e));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', require('./routes/uploads'));
app.use('/api/payments/stripe', require('./routes/payments/stripe'));
app.use('/api/payments/paypal', require('./routes/payments/paypal'));
// add klarna route

app.listen(process.env.PORT||4000, ()=>console.log('Server running', process.env.PORT||4000));
