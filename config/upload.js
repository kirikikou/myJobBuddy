module.exports = {
    LIMITS: {
      FILE_SIZE_BYTES: 5 * 1024 * 1024,
      FILE_SIZE_MB: 5,
      MAX_FILES: 10,
      MAX_FIELD_SIZE: 1024 * 1024,
      MAX_FIELDS: 50
    },
    
    ALLOWED_MIME_TYPES: {
      IMAGES: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml'
      ],
      DOCUMENTS: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv'
      ],
      SPREADSHEETS: [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
      ]
    },
    
    FILE_EXTENSIONS: {
      IMAGES: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
      DOCUMENTS: ['.pdf', '.doc', '.docx', '.txt', '.csv'],
      SPREADSHEETS: ['.xls', '.xlsx', '.csv']
    },
    
    STORAGE: {
      DESTINATION: 'uploads/',
      TEMP_DESTINATION: 'uploads/temp/',
      PRESERVE_PATH: false,
      UNIQUE_SUFFIX: true,
      DATE_PREFIX: true
    },
    
    VALIDATION: {
      CHECK_MIME_TYPE: true,
      CHECK_EXTENSION: true,
      VIRUS_SCAN_ENABLED: false,
      MAX_FILENAME_LENGTH: 255,
      SANITIZE_FILENAME: true
    },
    
    PROCESSING: {
      IMAGE_RESIZE_ENABLED: true,
      MAX_IMAGE_WIDTH: 2048,
      MAX_IMAGE_HEIGHT: 2048,
      JPEG_QUALITY: 85,
      PNG_COMPRESSION: 6
    },
    
    CLEANUP: {
      TEMP_FILE_TTL_HOURS: 24,
      CLEANUP_INTERVAL_HOURS: 6,
      ORPHANED_FILE_CLEANUP: true
    }
  };