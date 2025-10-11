const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
require('dotenv').config();

async function cleanWishlists() {
    try {
        console.log('🔧 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://josymambo858_db_user:v3VSBGbeumlMZO9m@daviddbprogress.lgcze5s.mongodb.net/olyshair');
        
        console.log('🗑️ Cleaning up ALL problematic wishlists...');
        
        // Delete all wishlists with null userId
        const nullResult = await Wishlist.deleteMany({ userId: null });
        console.log(`✅ Deleted ${nullResult.deletedCount} wishlists with null userId`);
        
        // Also delete wishlists with missing userId field
        const missingResult = await Wishlist.deleteMany({ userId: { $exists: false } });
        console.log(`✅ Deleted ${missingResult.deletedCount} wishlists with missing userId field`);
        
        // Find and delete any other problematic wishlists
        const allWishlists = await Wishlist.find({});
        console.log(`📊 Total wishlists in database: ${allWishlists.length}`);
        
        // Log all wishlists for debugging
        allWishlists.forEach(wishlist => {
            console.log(`📝 Wishlist: ${wishlist._id}, UserId: ${wishlist.userId}`);
        });
        
        // Drop and recreate the index to ensure it's clean
        try {
            console.log('🔄 Rebuilding wishlist indexes...');
            await Wishlist.collection.dropIndex('userId_1');
        } catch (e) {
            console.log('ℹ️ Index might not exist or already dropped');
        }
        
        // Create a fresh unique index
        await Wishlist.collection.createIndex({ userId: 1 }, { unique: true });
        console.log('✅ Recreated unique index on userId');
        
        // Verify the cleanup
        const remainingWishlists = await Wishlist.find({});
        console.log(`📊 Total wishlists remaining after cleanup: ${remainingWishlists.length}`);
        
        if (remainingWishlists.length > 0) {
            console.log('🔍 Remaining wishlists:');
            remainingWishlists.forEach(wishlist => {
                console.log(`   - ${wishlist._id}: UserId=${wishlist.userId}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Cleanup error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}

cleanWishlists();