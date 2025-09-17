const express = require('express');
const router = express.Router();
const MonitoringService = require('../monitoring/MonitoringService');
const IntelligentCoordinator = require('../utils/IntelligentCoordinator');
const ResourceMonitor = require('../utils/ResourceMonitor');
const IntelligentBatchManager = require('../utils/IntelligentBatchManager');
const QueueBuffer = require('../utils/QueueBuffer');
const queueConfig = require('../config/queue');
const loggingService = require('../services/LoggingService');

router.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../public/monitoring/dashboard.html'));
});

router.get('/health/queue', async (req, res) => {
  try {
    const healthMetrics = QueueBuffer.getHealthMetrics();
    const alerts = healthMetrics.alerts || [];
    
    const isHealthy = alerts.length === 0 && 
                     healthMetrics.breakerState === 'closed' &&
                     healthMetrics.queueDepth < queueConfig.HEALTH_QUEUE_DEPTH_ALERT;
    
    res.status(isHealthy ? 200 : 503).json({
      success: true,
      status: isHealthy ? 'healthy' : 'degraded',
      metrics: healthMetrics,
      config: {
        maxWaitTimeMinutes: queueConfig.getMaxWaitTimeMs() / 60000,
        maxParallel: queueConfig.getMaxParallel(),
        breakerEnabled: queueConfig.AWS_FALLBACK_ENABLED
      },
      timestamp: Date.now()
    });
    
    loggingService.service('QueueHealth', 'check-performed', { 
      status: isHealthy ? 'healthy' : 'degraded',
      alertCount: alerts.length 
    });
  } catch (error) {
    loggingService.error('Queue health check failed', { error: error.message });
    res.status(500).json({ 
      success: false, 
      status: 'error',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

router.get('/api/queue/stats', async (req, res) => {
  try {
    const queueStats = QueueBuffer.getQueueStats();
    const healthMetrics = QueueBuffer.getHealthMetrics();
    
    res.json({
      success: true,
      data: {
        queues: queueStats.queues,
        metrics: queueStats.metrics,
        circuitBreaker: queueStats.circuitBreaker,
        health: healthMetrics,
        resources: queueStats.resources,
        inFlight: queueStats.inFlight,
        subscribers: queueStats.subscribers,
        config: queueStats.config,
        performance: {
          avgLatencyMs: queueStats.metrics.avgLatencyMs,
          p95LatencyMs: queueStats.metrics.p95LatencyMs,
          errorRate1m: queueStats.metrics.errorRate1m,
          throughput: {
            serverProcessed: queueStats.metrics.serverProcessed,
            awsFallbacks: queueStats.metrics.awsFallbacks,
            duplicateRequests: queueStats.metrics.duplicateRequests
          }
        }
      },
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('Queue stats retrieval failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/queue/stream', (req, res) => {
  if (!queueConfig.SSE_AUTH_REQUIRED || req.user) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    res.write('data: {"type":"connected","timestamp":' + Date.now() + '}\n\n');
    
    const sendQueueMetrics = () => {
      try {
        const queueStats = QueueBuffer.getQueueStats();
        const healthMetrics = QueueBuffer.getHealthMetrics();
        
        const compactData = {
          type: 'metrics',
          queueDepth: healthMetrics.queueDepth,
          inFlight: healthMetrics.inFlight,
          avgLatencyMs: Math.round(healthMetrics.avgLatencyMs),
          p95LatencyMs: Math.round(healthMetrics.p95LatencyMs),
          errorRate1m: Math.round(healthMetrics.errorRate1m * 100) / 100,
          breakerState: healthMetrics.breakerState,
          serverProcessed: queueStats.metrics.serverProcessed,
          awsFallbacks: queueStats.metrics.awsFallbacks,
          duplicates: queueStats.metrics.duplicateRequests,
          dlqSize: healthMetrics.dlqSize,
          alertCount: healthMetrics.alerts.length,
          timestamp: Date.now()
        };
        
        res.write(`data: ${JSON.stringify(compactData)}\n\n`);
      } catch (error) {
        loggingService.error('SSE metrics generation failed', { error: error.message });
      }
    };
    
    const sendHeartbeat = () => {
      res.write(`data: {"type":"heartbeat","timestamp":${Date.now()}}\n\n`);
    };
    
    const metricsInterval = setInterval(sendQueueMetrics, queueConfig.SSE_THROTTLE_INTERVAL_MS);
    const heartbeatInterval = setInterval(sendHeartbeat, queueConfig.SSE_HEARTBEAT_INTERVAL_MS);
    
    req.on('close', () => {
      clearInterval(metricsInterval);
      clearInterval(heartbeatInterval);
      loggingService.service('QueueSSE', 'client-disconnected');
    });
    
    loggingService.service('QueueSSE', 'client-connected');
  } else {
    res.status(401).json({ success: false, error: 'Authentication required for SSE stream' });
  }
});

router.get('/api/queue/request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const status = await QueueBuffer.getRequestStatus(requestId);
    
    res.json({
      success: true,
      data: status,
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('Request status retrieval failed', { 
      error: error.message, 
      requestId: req.params.requestId 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/queue/clear', async (req, res) => {
  try {
    if (!req.user || !['admin', 'monitoring'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const cleared = await QueueBuffer.clearQueues();
    
    loggingService.service('QueueAdmin', 'queues-cleared', { 
      userId: req.user.id,
      cleared 
    });
    
    res.json({
      success: true,
      data: cleared,
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('Queue clear failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/overview', async (req, res) => {
  try {
    const overview = MonitoringService.getSystemOverview();
    const systemHealth = await IntelligentCoordinator.getSystemHealth();
    
    res.json({
      success: true,
      data: {
        ...overview,
        systemHealth: systemHealth.overall,
        resources: systemHealth.resources,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/realtime', async (req, res) => {
  try {
    const realtime = MonitoringService.metrics.realtime;
    const resourceStats = ResourceMonitor.getResourceStats();
    const queueStats = QueueBuffer.getQueueStats();
    
    res.json({
      success: true,
      data: {
        metrics: realtime,
        resources: resourceStats,
        queues: queueStats,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/timeline/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { days = 30, hours = 24 } = req.query;
    
    let timeline = [];
    
    switch (period) {
      case 'daily':
        timeline = MonitoringService.generateTimelineData(parseInt(days));
        break;
        
      case 'hourly':
        timeline = MonitoringService.getHistoricalData('hourly', parseInt(hours))
          .map(item => ({
            timestamp: new Date(item.key).toISOString(),
            date: new Date(item.key).toDateString(),
            weekday: new Date(item.key).toLocaleDateString('en-US', { weekday: 'long' }),
            requests: item.requests || 0,
            peakRequests: item.peakRequests || 0,
            avgMemory: item.avgMemory || 0,
            peakMemory: item.peakMemory || 0,
            avgCpu: item.avgCpu || 0,
            peakCpu: item.peakCpu || 0,
            avgUsers: item.avgUsers || 0,
            peakUsers: item.peakUsers || 0,
            samples: item.samples || 0
          }));
        break;
        
      case 'weekly':
        timeline = MonitoringService.getHistoricalData('weekly', 12)
          .map(item => ({
            timestamp: new Date().toISOString(),
            date: item.key,
            weekday: 'Week',
            requests: item.requests || 0,
            peakRequests: item.peakRequests || 0,
            avgMemory: item.avgMemory || 0,
            peakMemory: item.peakMemory || 0,
            avgCpu: item.avgCpu || 0,
            peakCpu: item.peakCpu || 0,
            avgUsers: item.avgUsers || 0,
            peakUsers: item.peakUsers || 0,
            samples: item.samples || 0
          }));
        break;
        
      case 'monthly':
        timeline = MonitoringService.getHistoricalData('monthly', 12)
          .map(item => ({
            timestamp: new Date().toISOString(),
            date: item.key,
            weekday: 'Month',
            requests: item.requests || 0,
            peakRequests: item.peakRequests || 0,
            avgMemory: item.avgMemory || 0,
            peakMemory: item.peakMemory || 0,
            avgCpu: item.avgCpu || 0,
            peakCpu: item.peakCpu || 0,
            avgUsers: item.avgUsers || 0,
            peakUsers: item.peakUsers || 0,
            samples: item.samples || 0
          }));
        break;
        
      default:
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }
    
    res.json({
      success: true,
      data: {
        timeline,
        exportDate: new Date().toISOString(),
        period: period
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/historical/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { hours = 24 } = req.query;
    
    let data = [];
    const now = new Date();
    
    switch (period) {
      case 'hourly':
        data = Array.from(MonitoringService.metrics.hourly.entries())
          .filter(([key, _]) => {
            const hourDate = new Date(key.split('-').slice(0, 3).join('-'));
            return (now - hourDate) <= (hours * 60 * 60 * 1000);
          })
          .sort((a, b) => a[0].localeCompare(b[0]));
        break;
        
      case 'daily':
        data = Array.from(MonitoringService.metrics.daily.entries())
          .filter(([key, _]) => {
            const dayDate = new Date(key.split('-').join('-'));
            return (now - dayDate) <= (30 * 24 * 60 * 60 * 1000);
          })
          .sort((a, b) => a[0].localeCompare(b[0]));
        break;
        
      case 'weekly':
        data = Array.from(MonitoringService.metrics.weekly.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-12);
        break;
        
      case 'monthly':
        data = Array.from(MonitoringService.metrics.monthly.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-12);
        break;
        
      default:
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }
    
    res.json({
      success: true,
      data: {
        period,
        metrics: data,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/domains', async (req, res) => {
  try {
    const { sort = 'requests', limit = 50, period = 'all', filter = '' } = req.query;
    
    let domains = Array.from(MonitoringService.domainStats.values());
    
    if (filter) {
      domains = domains.filter(domain => 
        domain.domain.toLowerCase().includes(filter.toLowerCase())
      );
    }
    
    if (period !== 'all') {
      const now = Date.now();
      const periodMs = {
        'today': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'month': 30 * 24 * 60 * 60 * 1000
      };
      
      if (periodMs[period]) {
        domains = domains.filter(domain => 
          domain.lastSeen && (now - domain.lastSeen) <= periodMs[period]
        );
      }
    }
    
    const sortFunctions = {
      'requests': (a, b) => b.totalRequests - a.totalRequests,
      'time': (a, b) => b.avgTime - a.avgTime,
      'success': (a, b) => b.successRate - a.successRate,
      'recent': (a, b) => b.lastSeen - a.lastSeen
    };
    
    if (sortFunctions[sort]) {
      domains.sort(sortFunctions[sort]);
    }
    
    const result = domains.slice(0, parseInt(limit)).map(domain => ({
      domain: domain.domain,
      totalRequests: domain.totalRequests,
      avgTime: domain.avgTime ? `${(domain.avgTime / 1000).toFixed(1)}s` : 'N/A',
      successRate: domain.successRate ? `${Math.round(domain.successRate)}%` : 'N/A',
      lastStep: domain.lastStep || 'N/A',
      uniqueUsers: Array.from(domain.uniqueUsers || []).length || 'N/A',
      lastSeen: domain.lastSeen,
      requestsToday: domain.requestsToday || 0,
      requestsThisWeek: domain.requestsThisWeek || 0,
      requestsThisMonth: domain.requestsThisMonth || 0
    }));
    
    res.json({
      success: true,
      data: {
        domains: result,
        total: MonitoringService.domainStats.size,
        filtered: domains.length,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/users', async (req, res) => {
  try {
    const { sort = 'requests', limit = 50, plan = 'all' } = req.query;
    
    let users = Array.from(MonitoringService.userStats.values());
    
    if (plan !== 'all') {
      users = users.filter(user => user.plan === plan);
    }
    
    const sortFunctions = {
      'requests': (a, b) => b.totalRequests - a.totalRequests,
      'domains': (a, b) => (b.totalDomains?.size || 0) - (a.totalDomains?.size || 0),
      'recent': (a, b) => b.lastActivity - a.lastActivity
    };
    
    if (sortFunctions[sort]) {
      users.sort(sortFunctions[sort]);
    }
    
    const result = users.slice(0, parseInt(limit)).map(user => ({
      userId: user.userId.substring(0, 24) + '...',
      plan: user.plan,
      totalRequests: user.totalRequests,
      totalDomains: Array.from(user.totalDomains || []).length,
      lastActivity: user.lastActivity,
      requestsToday: user.requestsToday || 0,
      requestsThisWeek: user.requestsThisWeek || 0,
      requestsThisMonth: user.requestsThisMonth || 0,
      firstSeen: user.firstSeen
    }));
    
    res.json({
      success: true,
      data: {
        users: result,
        total: MonitoringService.userStats.size,
        filtered: users.length,
        planDistribution: MonitoringService.userPlanStats,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/performance', async (req, res) => {
  try {
    const steps = MonitoringService.getTopSteps(20).map(step => ({
      step: step.step,
      calls: step.calls,
      avgTime: `${(step.avgTime / 1000).toFixed(1)}s`,
      successRate: `${step.successRate}%`
    }));
    
    const batches = Array.from(MonitoringService.batchMetrics.values())
      .slice(-50)
      .map(batch => ({
        batchId: batch.batchId.substring(0, 12) + '...',
        domains: batch.domains,
        duration: `${Math.round(batch.duration / 1000)}s`,
        avgTimePerDomain: `${Math.round(batch.avgTimePerDomain / 1000)}s`,
        strategy: batch.config?.strategy || 'unknown',
        timestamp: batch.timestamp
      }));
    
    const resourceHistory = await ResourceMonitor.getResourceStats();
    const batchingStats = IntelligentBatchManager.getBatchingStats();
    
    res.json({
      success: true,
      data: {
        steps,
        batches,
        resources: resourceHistory,
        batching: batchingStats,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/jobtitles', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const jobTitles = MonitoringService.getTopJobTitles(parseInt(limit))
      .map(job => ({
        title: job.title,
        count: job.count,
        variations: job.variations,
        percentage: ((job.count / Array.from(MonitoringService.jobTitleStats.values()).reduce((sum, j) => sum + j.count, 0)) * 100).toFixed(1)
      }));
    
    res.json({
      success: true,
      data: {
        jobTitles,
        total: MonitoringService.jobTitleStats.size,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/system-health', async (req, res) => {
  try {
    const systemHealth = await IntelligentCoordinator.getDetailedStats();
    const detailedMetrics = {
      memory: {
        current: process.memoryUsage(),
        gc: global.gc ? 'available' : 'not available'
      },
      uptime: {
        process: Math.round(process.uptime()),
        system: require('os').uptime()
      },
      load: require('os').loadavg(),
      platform: {
        arch: process.arch,
        platform: process.platform,
        version: process.version,
        nodeVersion: process.version
      }
    };
    
    res.json({
      success: true,
      data: {
        ...systemHealth,
        detailed: detailedMetrics,
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/optimize', async (req, res) => {
  try {
    const optimization = await IntelligentCoordinator.optimizeSystem();
    
    res.json({
      success: true,
      data: optimization
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/clear-history', async (req, res) => {
  try {
    const { type } = req.query;
    
    let cleared = 0;
    
    switch (type) {
      case 'batches':
        cleared = await IntelligentBatchManager.clearBatchHistory();
        break;
      case 'queues':
        const queueResult = await QueueBuffer.clearQueues();
        cleared = queueResult.serverCleared + queueResult.awsCleared;
        break;
      case 'all':
        await MonitoringService.persistMetrics();
        cleared = 'all';
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid type' });
    }
    
    res.json({
      success: true,
      data: { cleared, timestamp: Date.now() }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/export/:format', async (req, res) => {
  try {
    const { format } = req.params;
    const { type = 'overview' } = req.query;
    
    let data;
    
    switch (type) {
      case 'overview':
        data = MonitoringService.getSystemOverview();
        break;
      case 'domains':
        data = Array.from(MonitoringService.domainStats.values());
        break;
      case 'users':
        data = Array.from(MonitoringService.userStats.values());
        break;
      case 'performance':
        data = Array.from(MonitoringService.stepPerformance.values());
        break;
      case 'timeline':
        data = MonitoringService.generateTimelineData(30);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid export type' });
    }
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.json`);
      res.send(JSON.stringify(data, null, 2));
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.csv`);
      
      const csv = convertToCSV(data);
      res.send(csv);
    } else {
      res.status(400).json({ success: false, error: 'Invalid format' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function convertToCSV(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (typeof value === 'object') {
        return JSON.stringify(value).replace(/"/g, '""');
      }
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

module.exports = router;