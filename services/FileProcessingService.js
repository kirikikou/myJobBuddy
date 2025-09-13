const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

class FileProcessingService {
  constructor(config) {
    this.config = config;
    this.storage = multer.memoryStorage();
    this.upload = multer({
      storage: this.storage,
      limits: {
        fileSize: this.config.upload?.maxFileSize || 5 * 1024 * 1024
      },
      fileFilter: this.fileFilter.bind(this)
    });
  }

  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }

  getUploadMiddleware() {
    return this.upload;
  }

  async processImage(fileBuffer, options = {}) {
    try {
      const {
        width = 800,
        height = 600,
        quality = 80,
        format = 'jpeg'
      } = options;

      let processor = sharp(fileBuffer);

      if (width || height) {
        processor = processor.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          processor = processor.jpeg({ quality });
          break;
        case 'png':
          processor = processor.png({ quality });
          break;
        case 'webp':
          processor = processor.webp({ quality });
          break;
        default:
          processor = processor.jpeg({ quality });
      }

      const processedBuffer = await processor.toBuffer();
      
      return {
        buffer: processedBuffer,
        size: processedBuffer.length,
        format: format.toLowerCase()
      };

    } catch (error) {
      this.config.smartLog('fail', `Image processing error: ${error.message}`);
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  async saveFile(fileData, directory, filename) {
    try {
      const uploadsDir = path.join(__dirname, '..', directory);
      
      await fs.promises.mkdir(uploadsDir, { recursive: true });

      const filepath = path.join(uploadsDir, filename);
      await fs.promises.writeFile(filepath, fileData.buffer);

      this.config.smartLog('win', `File saved: ${filepath}`);

      return {
        filepath,
        filename,
        size: fileData.size,
        directory
      };

    } catch (error) {
      this.config.smartLog('fail', `File save error: ${error.message}`);
      throw new Error(`Failed to save file: ${error.message}`);
    }
  }

  async deleteFile(filepath) {
    try {
      await fs.promises.unlink(filepath);
      this.config.smartLog('win', `File deleted: ${filepath}`);
      return true;
    } catch (error) {
      this.config.smartLog('fail', `File deletion error: ${error.message}`);
      return false;
    }
  }

  async readTextFile(filepath) {
    try {
      const content = await fs.promises.readFile(filepath, 'utf8');
      return content;
    } catch (error) {
      this.config.smartLog('fail', `File read error: ${error.message}`);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async writeTextFile(filepath, content) {
    try {
      const dir = path.dirname(filepath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      await fs.promises.writeFile(filepath, content, 'utf8');
      this.config.smartLog('win', `Text file written: ${filepath}`);
      
      return true;
    } catch (error) {
      this.config.smartLog('fail', `File write error: ${error.message}`);
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  async readJsonFile(filepath) {
    try {
      const content = await this.readTextFile(filepath);
      return JSON.parse(content);
    } catch (error) {
      if (error.message.includes('Failed to read file')) {
        throw error;
      }
      throw new Error(`Failed to parse JSON file: ${error.message}`);
    }
  }

  async writeJsonFile(filepath, data) {
    try {
      const content = JSON.stringify(data, null, 2);
      return await this.writeTextFile(filepath, content);
    } catch (error) {
      throw new Error(`Failed to write JSON file: ${error.message}`);
    }
  }

  async getFileStats(filepath) {
    try {
      const stats = await fs.promises.stat(filepath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      this.config.smartLog('fail', `File stats error: ${error.message}`);
      return null;
    }
  }

  async listFiles(directory, extension = null) {
    try {
      const files = await fs.promises.readdir(directory);
      
      let filteredFiles = files.filter(file => {
        const filepath = path.join(directory, file);
        try {
          const stats = fs.statSync(filepath);
          return stats.isFile();
        } catch {
          return false;
        }
      });

      if (extension) {
        const ext = extension.startsWith('.') ? extension : `.${extension}`;
        filteredFiles = filteredFiles.filter(file => 
          path.extname(file).toLowerCase() === ext.toLowerCase()
        );
      }

      return filteredFiles;
    } catch (error) {
      this.config.smartLog('fail', `Directory listing error: ${error.message}`);
      return [];
    }
  }

  async cleanupOldFiles(directory, maxAgeHours = 24) {
    try {
      const files = await fs.promises.readdir(directory);
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of files) {
        const filepath = path.join(directory, file);
        
        try {
          const stats = await fs.promises.stat(filepath);
          
          if (stats.isFile() && stats.mtime.getTime() < cutoffTime) {
            await fs.promises.unlink(filepath);
            deletedCount++;
          }
        } catch (error) {
          this.config.smartLog('fail', `Error processing file ${filepath}: ${error.message}`);
        }
      }

      this.config.smartLog('win', `Cleaned up ${deletedCount} old files from ${directory}`);
      return deletedCount;

    } catch (error) {
      this.config.smartLog('fail', `Cleanup error: ${error.message}`);
      return 0;
    }
  }

  generateUniqueFilename(originalName, userId = null) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    
    const sanitizedBaseName = baseName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);

    const userPrefix = userId ? `${userId}_` : '';
    
    return `${userPrefix}${sanitizedBaseName}_${timestamp}_${random}${extension}`;
  }

  validateFileType(mimetype, allowedTypes = []) {
    const defaultAllowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'application/json'
    ];

    const typesToCheck = allowedTypes.length > 0 ? allowedTypes : defaultAllowedTypes;
    
    return typesToCheck.includes(mimetype.toLowerCase());
  }

  getFileExtensionFromMimetype(mimetype) {
    const mimeMap = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'text/plain': '.txt',
      'application/json': '.json'
    };

    return mimeMap[mimetype.toLowerCase()] || '.bin';
  }

  async ensureDirectory(directory) {
    try {
      await fs.promises.mkdir(directory, { recursive: true });
      return true;
    } catch (error) {
      this.config.smartLog('fail', `Directory creation error: ${error.message}`);
      return false;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = FileProcessingService;