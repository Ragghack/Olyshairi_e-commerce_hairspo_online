const mongoose = require('mongoose');

mongoose.connect(process.env.mongodb+srv:josymambo858_db_user:v3VSBGbeumlMZO9m@daviddbprogress.lgcze5s.mongodb.net/)
  .then(() => console.log('MongoDB Atlas connected'))
  .catch(err => console.error(err));
