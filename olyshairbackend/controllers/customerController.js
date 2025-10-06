const User = require('../models/User');

// Get customer profile
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                avatarUrl: user.avatarUrl,
                memberSince: user.memberSince,
                lastLogin: user.lastLogin
            }
        });
    } catch (error) {
        console.error('Profile Error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

// Update customer profile
exports.updateProfile = async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, address } = req.body;
        
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { 
                firstName, 
                lastName, 
                phoneNumber,
                // You might want to create a separate Address model
            },
            { new: true }
        ).select('-passwordHash');

        res.json({
            user: {
                id: updatedUser._id,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                email: updatedUser.email,
                phoneNumber: updatedUser.phoneNumber,
                memberSince: updatedUser.memberSince,
                lastLogin: updatedUser.lastLogin
            }
        });
    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};