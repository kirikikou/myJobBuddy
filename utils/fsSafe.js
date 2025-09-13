const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

class FsSafe {
  constructor() {
    this.writeMutexes = new Map();
  }

  async writeJsonAtomic(filePath, data, options = {}) {
    const {
      retries = 5,
      minDelay = 20,
      maxDelay = 200,
      encoding = 'utf8'
    } = options;

    if (this.writeMutexes.has(filePath)) {
      return await this.writeMutexes.get(filePath);
    }

    const writePromise = this._performAtomicWrite(filePath, data, {
      retries,
      minDelay,
      maxDelay,
      encoding
    });

    this.writeMutexes.set(filePath, writePromise);

    try {
      const result = await writePromise;
      return result;
    } finally {
      this.writeMutexes.delete(filePath);
    }
  }

  async _performAtomicWrite(filePath, data, options) {
    const { retries, minDelay, maxDelay, encoding } = options;
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);

    await fs.mkdir(dir, { recursive: true });

    const jsonData = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const pid = process.pid;
    
    let attempt = 0;
    let lastError = null;
    let tempPath = null;
    let usedFallback = false;

    while (attempt <= retries) {
      try {
        tempPath = path.join(dir, `${basename}.tmp.${pid}.${Date.now()}.${Math.random().toString(36).substr(2, 9)}${ext}`);
        
        await fs.writeFile(tempPath, jsonData, { encoding });

        if (fs.fsync && typeof fs.fsync === 'function') {
          try {
            const fd = await fs.open(tempPath, 'r+');
            await fs.fsync(fd.fd);
            await fd.close();
          } catch (fsyncError) {
          }
        }

        const tempStats = await fs.stat(tempPath);
        if (tempStats.size < 10) {
          await fs.unlink(tempPath).catch(() => {});
          throw new Error('Temporary file too small');
        }

        try {
          await fs.rename(tempPath, filePath);
          
          config.smartLog('buffer', `Saved JSON atomically → ${filePath} (bytes=${tempStats.size}, retries=${attempt}, fallback=false)`);
          
          return {
            success: true,
            path: filePath,
            size: tempStats.size,
            retries: attempt,
            fallback: false
          };

        } catch (renameError) {
          if (this._isRetryableError(renameError) && attempt < retries) {
            lastError = renameError;
            await this._delay(this._calculateDelay(attempt, minDelay, maxDelay));
            attempt++;
            continue;
          }

          try {
            await fs.access(filePath);
            await fs.unlink(filePath);
          } catch (unlinkError) {
          }

          await fs.copyFile(tempPath, filePath);
          await fs.unlink(tempPath);
          
          usedFallback = true;
          
          const finalStats = await fs.stat(filePath);
          config.smartLog('buffer', `Saved JSON with fallback → ${filePath} (bytes=${finalStats.size}, retries=${attempt}, fallback=true)`);
          
          return {
            success: true,
            path: filePath,
            size: finalStats.size,
            retries: attempt,
            fallback: true
          };
        }

      } catch (error) {
        lastError = error;
        
        if (tempPath) {
          try {
            await fs.unlink(tempPath);
          } catch (cleanupError) {
          }
        }

        if (!this._isRetryableError(error) || attempt >= retries) {
          break;
        }

        await this._delay(this._calculateDelay(attempt, minDelay, maxDelay));
        attempt++;
      }
    }

    config.smartLog('fail', `Failed to write JSON atomically after ${retries + 1} attempts → ${filePath} (tempPath=${tempPath}, error=${lastError?.message})`);
    
    throw new Error(`Atomic write failed after ${retries + 1} attempts: ${lastError?.message}`);
  }

  _isRetryableError(error) {
    const retryableCodes = [
      'EPERM',
      'EBUSY', 
      'ENOENT',
      'EACCES',
      'EMFILE',
      'ENFILE',
      'EXDEV'
    ];
    
    return retryableCodes.includes(error.code) || 
           error.message.includes('operation not permitted') ||
           error.message.includes('resource busy') ||
           error.message.includes('too many open files');
  }

  _calculateDelay(attempt, minDelay, maxDelay) {
    const exponentialDelay = Math.min(minDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return Math.floor(exponentialDelay + jitter);
  }

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async readJsonSafe(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      if (error.name === 'SyntaxError') {
        const backupPath = `${filePath}.corrupted.${Date.now()}`;
        try {
          await fs.copyFile(filePath, backupPath);
          config.smartLog('buffer', `Corrupted JSON backed up → ${backupPath}`);
        } catch (backupError) {
          config.smartLog('fail', `Failed to backup corrupted JSON: ${backupError.message}`);
        }
        return null;
      }
      throw error;
    }
  }

  async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      config.smartLog('fail', `Failed to ensure directory ${dirPath}: ${error.message}`);
      return false;
    }
  }

  async removeFile(filePath) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        config.smartLog('fail', `Failed to remove file ${filePath}: ${error.message}`);
      }
      return false;
    }
  }

  async cleanupTempFiles(dirPath, pattern = /\.tmp\./i) {
    try {
      const files = await fs.readdir(dirPath);
      const tempFiles = files.filter(file => pattern.test(file));
      
      let cleanedCount = 0;
      for (const file of tempFiles) {
        const filePath = path.join(dirPath, file);
        try {
          const stats = await fs.stat(filePath);
          const ageMs = Date.now() - stats.mtime.getTime();
          
          if (ageMs > 300000) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch (error) {
        }
      }
      
      if (cleanedCount > 0) {
        config.smartLog('buffer', `Cleaned ${cleanedCount} temp files from ${dirPath}`);
      }
      
      return cleanedCount;
    } catch (error) {
      config.smartLog('fail', `Failed to cleanup temp files in ${dirPath}: ${error.message}`);
      return 0;
    }
  }
}

module.exports = new FsSafe();