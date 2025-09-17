const fs = require('fs').promises;
const path = require('path');

const loggingService = require('../services/LoggingService');
async function getAllEmailsForDomain(domain) {
  const cacheDir = path.join(__dirname, '../cache');
  const allEmails = new Set();
  
  try {
    const files = await fs.readdir(cacheDir);
    
    for (const file of files) {
      if (file.startsWith('emails_')) {
        const filePath = path.join(cacheDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        if (data.domain === domain || data.url.includes(domain)) {
          data.emails.forEach(email => allEmails.add(email));
        }
      }
    }
  } catch (error) {
    loggingService.error('Error reading email cache:',{ error: error });
  }
  
  return Array.from(allEmails);
}

async function cleanupOldEmailCache(daysOld = 30) {
  const cacheDir = path.join(__dirname, '../cache');
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  let cleanedCount = 0;
  
  try {
    const files = await fs.readdir(cacheDir);
    
    for (const file of files) {
      if (file.startsWith('emails_')) {
        const filePath = path.join(cacheDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }
    }
  } catch (error) {
    loggingService.error('Error cleaning email cache:',{ error: error });
  }
  
  return cleanedCount;
}

module.exports = {
  getAllEmailsForDomain,
  cleanupOldEmailCache
};