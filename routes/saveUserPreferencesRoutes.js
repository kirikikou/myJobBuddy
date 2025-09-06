const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = express.Router();

const queueGate = (req, res, next) => {
    next();
};

router.post('/', async (req, res) => {
    try {
        const userData = req.body;
        const userId = req.user?._id?.toString() || 'default';
        const userPrefsDir = path.join(__dirname, '..', 'user_preferences');
        const userPrefsPath = path.join(userPrefsDir, `user_${userId}.json`);
        
        if (!fs.existsSync(userPrefsDir)) {
            fs.mkdirSync(userPrefsDir, { recursive: true });
        }
        
        fs.writeFileSync(userPrefsPath, JSON.stringify(userData, null, 2), 'utf8');
        
        config.smartLog('buffer', `save-preferences:success - user_${userId}`);
        res.json({ success: true, message: 'User preferences saved successfully' });
    } catch (error) {
        config.smartLog('fail', `save-preferences:error - ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;