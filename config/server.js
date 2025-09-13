module.exports = {
    SESSIONS: {
      TOUCH_AFTER_SECONDS: 24 * 3600,
      SAME_SITE: 'lax',
      COOKIE_NAME: 'connect.sid',
      TRUST_PROXY: false
    },
  
    SECURITY: {
      HSTS_MAX_AGE: 31536000,
      FRAME_OPTIONS: 'deny',
      REFERRER_POLICY: 'same-origin',
      CSP_ENABLED: true,
      XSS_FILTER_ENABLED: false
    },
  
    COMPRESSION: {
      LEVEL: 6,
      THRESHOLD: 1024,
      BROTLI_ENABLED: true,
      BROTLI_QUALITY: 4
    },
  
    CORS: {
      ALLOWED_ORIGINS: [
        'http://localhost:3000',
        'http://localhost:3001', 
        'http://127.0.0.1:3000'
      ],
      ALLOW_NO_ORIGIN: true,
      ALLOW_ALL: false,
      CREDENTIALS: true,
      METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      ALLOWED_HEADERS: [
        'Content-Type',
        'Authorization', 
        'X-Requested-With',
        'Accept',
        'Origin'
      ],
      EXPOSED_HEADERS: [],
      MAX_AGE: 86400,
      OPTIONS_SUCCESS_STATUS: 204
    },
  
    STATIC_FILES: {
      MAX_AGE: '1d',
      ETAG_ENABLED: true,
      LAST_MODIFIED_ENABLED: true,
      DICTIONARIES_CACHE_MAX_AGE: 86400
    },
  
    RATE_LIMITING: {
      DEFAULT_MAX_REQUESTS: 1000,
      DEFAULT_WINDOW_MS: 15 * 60 * 1000
    },
  
    LINKTREE: {
      LINK_SIZE: '120px',
      GAP: '30px',
      MAX_LINKS_PER_ROW: 4,
      MAX_ROWS: 3,
      MAX_TOTAL_LINKS: 10,
      FONT_SIZES: {
        MAIN_TITLE: '2.5rem',
        HEADER: '1.2rem', 
        JOB_TITLES: '1rem',
        EMAIL: '1rem',
        LINK_ICON: '2rem',
        LINK_TITLE: '0.75rem'
      },
      COLORS: {
        GRADIENT_START: '#667eea',
        GRADIENT_END: '#764ba2',
        TEXT_PRIMARY: 'white',
        TEXT_SECONDARY: 'rgba(255,255,255,0.9)',
        TEXT_TERTIARY: 'rgba(255,255,255,0.8)',
        SPHERE_GRADIENT_1: 'rgba(255,255,255,0.2)',
        SPHERE_GRADIENT_2: 'rgba(255,255,255,0.1)',
        BORDER_COLOR: 'rgba(255,255,255,0.3)'
      },
      ANIMATIONS: {
        FLOAT_DURATION: '6s',
        HOVER_SCALE: 1.5,
        HOVER_TRANSLATE_Y: '-15px',
        PULSE_DURATION: '0.6s'
      },
      SPHERES: {
        COUNT: 9,
        SIZES: [600, 450, 300, 400, 350, 250, 500, 200, 380],
        POSITIONS: [
          { top: '5%', left: '5%' },
          { top: '60%', right: '10%' },
          { bottom: '15%', left: '15%' },
          { top: '20%', right: '25%' },
          { bottom: '40%', right: '5%' },
          { top: '40%', left: '5%' },
          { bottom: '5%', right: '30%' },
          { top: '70%', left: '40%' },
          { top: '10%', left: '60%' }
        ],
        ANIMATION_DURATIONS: ['6s', '8s', '4s', '7s', '5s', '6.5s', '9s', '4.5s', '7.5s']
      }
    },
  
    PATHS: {
      PUBLIC_DIR: 'public',
      DICTIONARIES_UI_PATH: 'dictionaries/ui',
      USER_PREFERENCES_DIR: 'user_preferences'
    },
  
    MIDDLEWARE: {
      SETUP_ORDER: [
        'security',
        'compression', 
        'cors',
        'sessions',
        'passport',
        'middlewares',
        'static',
        'auth',
        'rateLimit'
      ]
    }
  };