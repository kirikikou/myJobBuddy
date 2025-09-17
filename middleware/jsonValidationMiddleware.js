const loggingService = require('../services/LoggingService');

function createStrictJSONValidator(options = {}) {
  const {
    maxSize = 1048576,
    allowedTypes = ['object'],
    requireFields = [],
    forbiddenFields = []
  } = options;

  return (req, res, next) => {
    if (req.method !== 'POST' && req.method !== 'PUT') {
      return next();
    }

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return next();
    }

    const originalBody = req.body;
    const requestId = req.headers['x-request-id'] || Date.now().toString();

    try {
      if (originalBody === null || originalBody === undefined) {
        loggingService.fail('JSON validation failed: null/undefined body', {
          requestId,
          path: req.path,
          method: req.method
        });
        
        return res.status(400).json({
          success: false,
          error: 'Request body cannot be null or undefined',
          code: 'INVALID_JSON_NULL'
        });
      }

      if (typeof originalBody === 'string') {
        try {
          req.body = JSON.parse(originalBody);
        } catch (parseError) {
          loggingService.fail('JSON validation failed: parse error', {
            requestId,
            error: parseError.message,
            bodyPreview: originalBody.substring(0, 100)
          });
          
          return res.status(400).json({
            success: false,
            error: 'Invalid JSON format',
            code: 'JSON_PARSE_ERROR',
            details: parseError.message
          });
        }
      }

      const bodyType = Array.isArray(req.body) ? 'array' : typeof req.body;
      
      if (!allowedTypes.includes(bodyType)) {
        loggingService.fail('JSON validation failed: invalid type', {
          requestId,
          expectedTypes: allowedTypes,
          actualType: bodyType
        });
        
        return res.status(400).json({
          success: false,
          error: `Invalid body type: ${bodyType}. Expected: ${allowedTypes.join(', ')}`,
          code: 'INVALID_BODY_TYPE'
        });
      }

      const bodyString = JSON.stringify(req.body);
      if (bodyString.length > maxSize) {
        loggingService.fail('JSON validation failed: size exceeded', {
          requestId,
          actualSize: bodyString.length,
          maxSize
        });
        
        return res.status(413).json({
          success: false,
          error: `Request body too large: ${bodyString.length} bytes (max: ${maxSize})`,
          code: 'PAYLOAD_TOO_LARGE'
        });
      }

      try {
        JSON.parse(bodyString);
      } catch (reserializeError) {
        loggingService.fail('JSON validation failed: re-serialization error', {
          requestId,
          error: reserializeError.message
        });
        
        return res.status(400).json({
          success: false,
          error: 'Body contains non-serializable data',
          code: 'NON_SERIALIZABLE_JSON'
        });
      }

      if (requireFields.length > 0) {
        const missingFields = requireFields.filter(field => !(field in req.body));
        if (missingFields.length > 0) {
          loggingService.fail('JSON validation failed: missing required fields', {
            requestId,
            missingFields
          });
          
          return res.status(400).json({
            success: false,
            error: `Missing required fields: ${missingFields.join(', ')}`,
            code: 'MISSING_REQUIRED_FIELDS'
          });
        }
      }

      if (forbiddenFields.length > 0) {
        const foundForbidden = forbiddenFields.filter(field => field in req.body);
        if (foundForbidden.length > 0) {
          loggingService.fail('JSON validation failed: forbidden fields present', {
            requestId,
            forbiddenFields: foundForbidden
          });
          
          return res.status(400).json({
            success: false,
            error: `Forbidden fields present: ${foundForbidden.join(', ')}`,
            code: 'FORBIDDEN_FIELDS_PRESENT'
          });
        }
      }

      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        const circularCheck = new Set();
        const hasCircularReference = (obj, visited = new Set()) => {
          if (visited.has(obj)) return true;
          if (obj && typeof obj === 'object') {
            visited.add(obj);
            for (const key in obj) {
              if (hasCircularReference(obj[key], visited)) return true;
            }
            visited.delete(obj);
          }
          return false;
        };

        if (hasCircularReference(req.body)) {
          loggingService.fail('JSON validation failed: circular references detected', {
            requestId
          });
          
          return res.status(400).json({
            success: false,
            error: 'Request body contains circular references',
            code: 'CIRCULAR_REFERENCES'
          });
        }
      }

      loggingService.buffer('JSON validation passed', {
        requestId,
        bodyType,
        size: bodyString.length
      });

      next();

    } catch (error) {
      loggingService.fail('JSON validation middleware error', {
        requestId,
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Internal validation error',
        code: 'VALIDATION_MIDDLEWARE_ERROR'
      });
    }
  };
}

function createPreferencesJSONValidator() {
  return createStrictJSONValidator({
    maxSize: 1048576,
    allowedTypes: ['object'],
    forbiddenFields: ['_id', '__v', 'createdAt', 'updatedAt']
  });
}

function createUploadJSONValidator() {
  return createStrictJSONValidator({
    maxSize: 2097152,
    allowedTypes: ['object'],
    requireFields: ['filename', 'size'],
    forbiddenFields: ['_id', '__v']
  });
}

module.exports = {
  createStrictJSONValidator,
  createPreferencesJSONValidator,
  createUploadJSONValidator
};