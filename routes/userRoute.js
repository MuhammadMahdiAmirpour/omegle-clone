const express = require('express');
const router = express.Router();
const { login, signup, searchByOmegleId } = require('../controllers/authController');
const auth = require('../middleware/auth');

// API Routes
router.post('/login', login);
router.post('/signup', signup);
router.get('/search/:omegleId', auth, searchByOmegleId);
router.get('/profile', auth, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

module.exports = router;
