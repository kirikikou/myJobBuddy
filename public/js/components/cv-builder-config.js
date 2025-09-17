const CV_CONFIG = {
    PHOTO: {
        MAX_SIZE_MB: 10,
        MAX_SIZE_BYTES: 10 * 1024 * 1024,
        CROP_CANVAS_SIZE: 400,
        PREVIEW_SIZE: 160,
        EXPORT_SIZE: 300,
        JPEG_QUALITY: 0.95,
        DEFAULT_RADIUS: 140,
        DEFAULT_POSITION: { x: 200, y: 200 },
        MIN_RADIUS: 30,
        MAX_SCALE: 5,
        MIN_SCALE: 0.1
    },
    VALIDATION: {
        MAX_TEXT_LENGTH: 1000,
        REPETITION_PATTERN: /(.{1,3})\1{10,}/,
        TRUNCATE_LENGTH: 500
    },
    TIMING: {
        SAVE_DEBOUNCE_MS: 1000,
        AUTO_PREVIEW_MS: 5000,
        MODAL_DELAY_MS: 100,
        CANVAS_UPDATE_DELAY_MS: 200
    },
    EXPORT: {
        PDF_PAGE: { width: 210, height: 297 },
        PDF_MARGIN: 5,
        CANVAS_SCALE: 2,
        CANVAS_WIDTH: 800,
        CANVAS_HEIGHT: 1100,
        JPG_CANVAS_SCALE: 3
    },
    LIBRARIES: {
        HTML2CANVAS: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        JSPDF: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    }
};

const CV_LOGGING = {
    log(category, message, data = null) {
        if (window.clientConfig && window.clientConfig.smartLog) {
            window.clientConfig.smartLog(category, message, data);
        }
    },
    
    service(action, details = {}) {
        this.log('service', `CVBuilder: ${action}`, details);
    },
    
    error(message, details = {}) {
        this.log('fail', `CVBuilder error: ${message}`, details);
    },
    
    timing(operation, duration, details = {}) {
        this.log('timing', `${operation}: ${duration}ms`, details);
    }
};

if (typeof window !== 'undefined') {
    window.CV_CONFIG = CV_CONFIG;
    window.CV_LOGGING = CV_LOGGING;
}