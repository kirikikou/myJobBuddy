const mongoose = require('mongoose');
const config = require('../config');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/myjobbuddy');
    config.smartLog('win', `MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    config.smartLog('fail', 'Database connection error', { error: error.message });
    process.exit(1);
  }
};

module.exports = connectDB;