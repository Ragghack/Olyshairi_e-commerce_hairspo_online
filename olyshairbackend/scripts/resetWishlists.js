const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
require('dotenv').config();

async function resetWishlists() {
    try {
        console.log('🔧 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://josymambo858_db_user:v3VSBGbeumlMZO9m@daviddbprogress.lgcze5s.mongodb.net/olyshair');
        
        console.log('💥 RESETTING ENTIRE WISHLIST COLLECTION...');
        
        // Delete all wishlists
        const result = await Wishlist.deleteMany({});
        console.log(`🗑️ Deleted ${result.deletedCount} wishlists`);
        
        // Drop all indexes
        await Wishlist.collection.dropIndexes();
        console.log('✅ Dropped all indexes');
        
        // Recreate the proper index
        await Wishlist.collection.createIndex({ userId: 1 }, { unique: true });
        console.log('✅ Recreated unique index on userId');
        
        console.log('🎉 Wishlist collection has been completely reset!');
        
    } catch (error) {
        console.error('❌ Reset error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

resetWishlists();