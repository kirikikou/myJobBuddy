class FileController {
    constructor(fileProcessingService, validationService, responseFormatterService, config) {
      this.fileProcessingService = fileProcessingService;
      this.validationService = validationService;
      this.responseFormatterService = responseFormatterService;
      this.config = config;
    }
  
    uploadFile(req, res) {
      const upload = this.fileProcessingService.getUploadMiddleware();
      
      upload.single('file')(req, res, async (uploadError) => {
        const requestId = this.validationService.generateRequestId();
        const { userId } = this.validationService.extractUserInfo(req);
        
        try {
          if (uploadError) {
            throw this.validationService.createValidationError(uploadError.message);
          }
  
          if (!req.file) {
            throw this.validationService.createValidationError('No file provided');
          }
  
          this.validationService.validateFileUpload(req.file);
  
          const processedFile = await this.fileProcessingService.processImage(req.file.buffer, {
            width: 800,
            height: 600,
            quality: 80,
            format: 'jpeg'
          });
  
          const filename = this.fileProcessingService.generateUniqueFilename(
            req.file.originalname, 
            userId
          );
  
          const savedFile = await this.fileProcessingService.saveFile(
            processedFile,
            'uploads',
            filename
          );
  
          const responseData = {
            message: 'File uploaded and processed successfully',
            file: {
              originalName: req.file.originalname,
              filename: savedFile.filename,
              size: this.fileProcessingService.formatFileSize(savedFile.size),
              path: `/uploads/${savedFile.filename}`,
              processedFormat: processedFile.format
            }
          };
  
          this.config.smartLog('win', `File uploaded: ${savedFile.filename} (${this.fileProcessingService.formatFileSize(savedFile.size)})`);
          
          res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
  
        } catch (error) {
          const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
          const statusCode = error.code === 'VALIDATION_ERROR' ? 400 : 500;
          res.status(statusCode).json(errorResponse);
        }
      });
    }
  
    async deleteFile(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const { filename } = req.params;
        
        if (!filename) {
          throw this.validationService.createValidationError('Filename is required');
        }
  
        const filepath = require('path').join(__dirname, '..', 'uploads', filename);
        const deleted = await this.fileProcessingService.deleteFile(filepath);
  
        if (!deleted) {
          throw this.validationService.createValidationError('File not found or could not be deleted', 'FILE_NOT_FOUND');
        }
  
        const responseData = {
          message: 'File deleted successfully',
          filename: filename
        };
  
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
  
      } catch (error) {
        const statusCode = error.code === 'FILE_NOT_FOUND' ? 404 : 500;
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(statusCode).json(errorResponse);
      }
    }
  
    async listFiles(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const { extension, limit = 50 } = req.query;
        const uploadsDir = require('path').join(__dirname, '..', 'uploads');
  
        const files = await this.fileProcessingService.listFiles(uploadsDir, extension);
        const limitedFiles = files.slice(0, parseInt(limit));
  
        const filesWithStats = [];
        for (const filename of limitedFiles) {
          const filepath = require('path').join(uploadsDir, filename);
          const stats = await this.fileProcessingService.getFileStats(filepath);
          
          if (stats) {
            filesWithStats.push({
              filename,
              size: this.fileProcessingService.formatFileSize(stats.size),
              created: stats.created,
              modified: stats.modified,
              url: `/uploads/${filename}`
            });
          }
        }
  
        const responseData = {
          files: filesWithStats,
          total: files.length,
          shown: filesWithStats.length,
          directory: 'uploads'
        };
  
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
  
      } catch (error) {
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(500).json(errorResponse);
      }
    }
  
    async cleanupFiles(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const { maxAgeHours = 24 } = req.body;
        const uploadsDir = require('path').join(__dirname, '..', 'uploads');
  
        const deletedCount = await this.fileProcessingService.cleanupOldFiles(
          uploadsDir, 
          parseInt(maxAgeHours)
        );
  
        const responseData = {
          message: `Cleanup completed: ${deletedCount} files deleted`,
          deletedCount,
          maxAgeHours: parseInt(maxAgeHours)
        };
  
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
  
      } catch (error) {
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(500).json(errorResponse);
      }
    }
  
    async processImageEndpoint(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const { width, height, quality, format } = req.body;
  
        if (!req.file) {
          throw this.validationService.createValidationError('No file provided for processing');
        }
  
        const processedFile = await this.fileProcessingService.processImage(req.file.buffer, {
          width: width ? parseInt(width) : undefined,
          height: height ? parseInt(height) : undefined,
          quality: quality ? parseInt(quality) : 80,
          format: format || 'jpeg'
        });
  
        res.set({
          'Content-Type': `image/${processedFile.format}`,
          'Content-Length': processedFile.buffer.length,
          'Content-Disposition': `attachment; filename="processed.${processedFile.format}"`
        });
  
        res.send(processedFile.buffer);
  
      } catch (error) {
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(500).json(errorResponse);
      }
    }
  
    async exportData(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        const { format = 'json', data } = req.body;
        
        if (!data) {
          throw this.validationService.createValidationError('Data is required for export');
        }
  
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `export_${timestamp}.${format}`;
  
        let contentType, processedData;
  
        switch (format.toLowerCase()) {
          case 'json':
            contentType = 'application/json';
            processedData = JSON.stringify(data, null, 2);
            break;
          case 'csv':
            contentType = 'text/csv';
            processedData = this.convertToCSV(data);
            break;
          case 'txt':
            contentType = 'text/plain';
            processedData = Array.isArray(data) ? data.join('\n') : JSON.stringify(data, null, 2);
            break;
          default:
            throw this.validationService.createValidationError('Unsupported export format. Use json, csv, or txt');
        }
  
        res.set({
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': Buffer.byteLength(processedData, 'utf8')
        });
  
        res.send(processedData);
  
      } catch (error) {
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(400).json(errorResponse);
      }
    }
  
    async importData(req, res) {
      const requestId = this.validationService.generateRequestId();
      
      try {
        if (!req.file) {
          throw this.validationService.createValidationError('No file provided for import');
        }
  
        const fileContent = req.file.buffer.toString('utf8');
        let importedData;
        const fileExtension = require('path').extname(req.file.originalname).toLowerCase();
  
        switch (fileExtension) {
          case '.json':
            importedData = JSON.parse(fileContent);
            break;
          case '.csv':
            importedData = this.parseCSV(fileContent);
            break;
          case '.txt':
            importedData = fileContent.split('\n').filter(line => line.trim());
            break;
          default:
            throw this.validationService.createValidationError('Unsupported file format. Use .json, .csv, or .txt');
        }
  
        const responseData = {
          message: 'Data imported successfully',
          originalFilename: req.file.originalname,
          recordsCount: Array.isArray(importedData) ? importedData.length : 1,
          dataType: Array.isArray(importedData) ? 'array' : typeof importedData,
          preview: Array.isArray(importedData) ? importedData.slice(0, 3) : importedData
        };
  
        res.json(this.responseFormatterService.formatSuccessResponse(responseData, requestId));
  
      } catch (error) {
        const errorResponse = this.responseFormatterService.formatErrorResponse(error, requestId);
        res.status(400).json(errorResponse);
      }
    }
  
    convertToCSV(data) {
      if (!Array.isArray(data) || data.length === 0) {
        return '';
      }
  
      const firstItem = data[0];
      if (typeof firstItem !== 'object') {
        return data.join('\n');
      }
  
      const headers = Object.keys(firstItem);
      const csvRows = [headers.join(',')];
  
      for (const item of data) {
        const row = headers.map(header => {
          const value = item[header] || '';
          return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        });
        csvRows.push(row.join(','));
      }
  
      return csvRows.join('\n');
    }
  
    parseCSV(content) {
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) return [];
  
      const headers = lines[0].split(',').map(h => h.trim());
      const data = [];
  
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        
        data.push(row);
      }
  
      return data;
    }
  }
  
  module.exports = FileController;