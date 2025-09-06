const express = require('express');
const router = express.Router();
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');
const userPreferencesManager = require('../userPreferencesManager');
const { normalizeStructure, deepMergeSafe, detectChanges } = require('../utils/normalizers/preferencesNormalizer');
const PlanService = require('../services/PlanService');

const FILE_LOCKS = new Map();

async function withFileLock(userId, operation) {
  const lockKey = `user_${userId}`;
  
  if (FILE_LOCKS.has(lockKey)) {
    const queue = FILE_LOCKS.get(lockKey);
    return new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  const queue = [];
  FILE_LOCKS.set(lockKey, queue);
  
  try {
    const result = await operation();
    
    while (queue.length > 0) {
      const nextOp = queue.shift();
      await nextOp();
    }
    
    FILE_LOCKS.delete(lockKey);
    return result;
    
  } catch (error) {
    FILE_LOCKS.delete(lockKey);
    throw error;
  }
}

async function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp';
  const jsonStr = JSON.stringify(data, null, 2);
  
  await fs.writeFile(tmpPath, jsonStr, 'utf8');
  await fs.rename(tmpPath, filePath);
  
  config.smartLog('win', `Atomic write completed for ${path.basename(filePath)}`);
}

router.post('/save-user-preferences', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  
  const userId = req.user._id.toString();
  
  try {
    const result = await withFileLock(userId, async () => {
      const planService = PlanService.getInstance();
      const clientData = planService.stripPlanFromClientData(req.body);
      
      if (clientData.jobSearchData) {
        delete clientData.jobSearchData.allHistoricalResults;
        delete clientData.jobSearchData.totalOffersScraped;
      }
      
      let existing = null;
      try {
        existing = await userPreferencesManager.getUserPreferences(userId);
      } catch (err) {
        config.smartLog('buffer', `No existing prefs for ${userId}: ${err.message}`);
      }
      
      const normalizedExisting = normalizeStructure(existing);
      const merged = deepMergeSafe(normalizedExisting, clientData);
      
      merged.userId = userId;
      merged.email = req.user.email;
      merged.lastUsed = new Date().toISOString();
      
      const hasChanges = detectChanges(normalizedExisting, merged);
      
      if (!hasChanges) {
        config.smartLog('cache', `No changes for ${userId}`);
        return { success: true, noChanges: true };
      }
      
      const enriched = await planService.enrichPreferencesWithPlan(merged, req.user);
      
      const prefsDir = path.join(__dirname, '../user_preferences');
      await fs.mkdir(prefsDir, { recursive: true });
      
      const filePath = path.join(prefsDir, `user_${userId}.json`);
      await atomicWrite(filePath, enriched);
      
      config.smartLog('win', `Preferences saved for ${userId}`);
      return { success: true, preferences: enriched };
    });
    
    if (result.noChanges) {
      return res.status(204).end();
    }
    
    return res.json(result);
    
  } catch (error) {
    config.smartLog('fail', `Save error for ${userId}: ${error.message}`);
    return res.status(500).json({ success: false, error: 'Save failed' });
  }
});

router.get('/api/get-user-preferences', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  
  const userId = req.user._id.toString();
  
  try {
    const planService = PlanService.getInstance();
    
    let raw = null;
    try {
      raw = await userPreferencesManager.getUserPreferences(userId);
    } catch (err) {
      config.smartLog('buffer', `Loading defaults for ${userId}`);
    }
    
    const normalized = normalizeStructure(raw);
    const enriched = await planService.enrichPreferencesWithPlan(normalized, req.user);
    
    config.smartLog('win', `Preferences loaded for ${userId}`);
    
    return res.json({
      success: true,
      preferences: enriched,
      fromDefaults: !raw
    });
    
  } catch (error) {
    config.smartLog('fail', `Load error for ${userId}: ${error.message}`);
    
    const planService = PlanService.getInstance();
    const defaults = normalizeStructure(null);
    const enriched = await planService.enrichPreferencesWithPlan(defaults, req.user || {});
    
    return res.json({
      success: true,
      preferences: enriched,
      fromDefaults: true
    });
  }
});

module.exports = router;