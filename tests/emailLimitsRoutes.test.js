const request = require('supertest');
const express = require('express');
const emailLimitsRoutes = require('../routes/emailLimitsRoutes');

jest.mock('../config', () => ({
  smartLog: jest.fn()
}));

jest.mock('../middleware/emailLimitsMiddleware', () => ({
  getEmailSearchStatusData: jest.fn()
}));

jest.mock('../middleware/queueGate', () => (req, res, next) => next());

describe('Email Limits Routes', () => {
  let app;
  let mockGetEmailSearchStatusData;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    app.use((req, res, next) => {
      req.isAuthenticated = () => true;
      req.user = { _id: '507f1f77bcf86cd799439011' };
      next();
    });
    
    app.use('/email-limits', emailLimitsRoutes);
    
    mockGetEmailSearchStatusData = require('../middleware/emailLimitsMiddleware').getEmailSearchStatusData;
    jest.clearAllMocks();
  });

  describe('GET /status', () => {
    test('should return success with valid user data', async () => {
      const mockStatusData = {
        plan: 'pro',
        limits: {
          liveSearches: 50,
          cacheSearches: 100,
          canUseLive: true
        },
        usage: {
          liveSearches: 10,
          cacheSearches: 25
        },
        remaining: {
          liveSearches: 40,
          cacheSearches: 75
        }
      };

      mockGetEmailSearchStatusData.mockResolvedValue(mockStatusData);

      const response = await request(app)
        .get('/email-limits/status')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        plan: 'pro',
        limits: {
          liveSearches: 50,
          cacheSearches: 100,
          canUseLive: true
        },
        usage: {
          liveSearches: 10,
          cacheSearches: 25
        },
        restrictions: {
          canSearchEmails: true,
          limitExceeded: false
        },
        timestamp: expect.any(Number)
      });
    });

    test('should return 401 when user not authenticated', async () => {
      app = express();
      app.use(express.json());
      
      app.use((req, res, next) => {
        req.isAuthenticated = () => false;
        req.user = null;
        next();
      });
      
      app.use('/email-limits', emailLimitsRoutes);

      const response = await request(app)
        .get('/email-limits/status')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Authentication required',
        reason: 'user_data_missing',
        timestamp: expect.any(Number)
      });
    });

    test('should return stable JSON on middleware error', async () => {
      mockGetEmailSearchStatusData.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/email-limits/status')
        .expect(200);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Unable to retrieve email status',
        plan: 'unknown',
        limits: {
          liveSearches: 0,
          cacheSearches: 0,
          canUseLive: false
        },
        usage: {
          liveSearches: 0,
          cacheSearches: 0
        },
        restrictions: {
          canSearchEmails: false,
          limitExceeded: true
        },
        timestamp: expect.any(Number)
      });
    });

    test('should return stable JSON when middleware returns null', async () => {
      mockGetEmailSearchStatusData.mockResolvedValue(null);

      const response = await request(app)
        .get('/email-limits/status')
        .expect(200);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Email status unavailable',
        plan: 'unknown',
        limits: {
          liveSearches: 0,
          cacheSearches: 0,
          canUseLive: false
        },
        restrictions: {
          canSearchEmails: false,
          limitExceeded: true
        },
        timestamp: expect.any(Number)
      });
    });

    test('should handle critical errors gracefully', async () => {
      app = express();
      app.use(express.json());
      
      app.use((req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: '507f1f77bcf86cd799439011' };
        next();
      });
      
      app.use('/email-limits', (req, res, next) => {
        throw new Error('Critical system error');
      });

      const response = await request(app)
        .get('/email-limits/status');

      expect(response.status).toBe(500);
    });

    test('should calculate restrictions correctly when limits reached', async () => {
      const mockStatusData = {
        plan: 'free',
        limits: {
          liveSearches: 0,
          cacheSearches: 10,
          canUseLive: false
        },
        usage: {
          liveSearches: 0,
          cacheSearches: 10
        },
        remaining: {
          liveSearches: 0,
          cacheSearches: 0
        }
      };

      mockGetEmailSearchStatusData.mockResolvedValue(mockStatusData);

      const response = await request(app)
        .get('/email-limits/status')
        .expect(200);

      expect(response.body.restrictions).toMatchObject({
        canSearchEmails: false,
        limitExceeded: true
      });
    });
  });
});