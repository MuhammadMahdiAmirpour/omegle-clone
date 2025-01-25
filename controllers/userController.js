const User = require('../models/User');

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({
            success: true,
            user
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
};
