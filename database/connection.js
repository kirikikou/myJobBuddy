const mongoose = require('mongoose');
const config = require('../config');

let isConnected = false;

const connectDB = async () => {
    if (isConnected) {
        config.smartLog('buffer', 'MongoDB already connected, skipping');
        return;
    }
    
    try {
        const mongoUri = config.db.mongodbUri || config.MONGODB_URI || 'mongodb://localhost:27017/myjobbuddy';
        
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        isConnected = true;
        const host = mongoose.connection.host || 'localhost';
        config.smartLog('buffer', `MongoDB connected: ${host}`);
    } catch (error) {
        config.smartLog('fail', `MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;