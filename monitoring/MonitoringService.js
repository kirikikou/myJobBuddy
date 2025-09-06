const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

class MonitoringService {
  constructor() {
    this.metrics = {
      realtime: {
        requests: { current: 0, lastMinute: 0, lastHour: 0 },
        memory: { used: 0, available: 0, percentage: 0 },
        cpu: { percentage: 0, load: 0 },
        activeUsers: 0,
        activeDomains: 0,
        queueLength: 0,
        lastUpdate: Date.now()
      },
      hourly: new Map(),
      daily: new Map(), 
      weekly: new Map(),
      monthly: new Map()
    };
    
    this.domainStats = new Map();
    this.userStats = new Map();
    this.stepPerformance = new Map();
    this.batchMetrics = new Map();
    this.jobTitleStats = new Map();
    this.userPlanStats = { free: 0, pro: 0, premium: 0 };
    
    this.monitoringDir = path.join(__dirname, '../monitoring_data');
    this.saveInterval = null;
    this.metricsInterval = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.ensureDirectories();
    await this.loadHistoricalData();
    await this.loadAggregatedMetrics();
    this.startMetricsCollection();
    this.startDataPersistence();
    
    this.initialized = true;
    config.smartLog('buffer','📊 MonitoringService initialized');
  }

  async ensureDirectories() {
    const dirs = [
      this.monitoringDir,
      path.join(this.monitoringDir, 'hourly'),
      path.join(this.monitoringDir, 'daily'), 
      path.join(this.monitoringDir, 'weekly'),
      path.join(this.monitoringDir, 'monthly')
    ];
    
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        config.smartLog('buffer',`Failed to create directory ${dir}: ${error.message}`);
      }
    }
  }

  async loadHistoricalData() {
    try {
      const files = [
        'domain_stats.json',
        'user_stats.json', 
        'step_performance.json',
        'batch_metrics.json',
        'jobtitle_stats.json',
        'user_plan_stats.json'
      ];
      
      for (const file of files) {
        try {
          const filePath = path.join(this.monitoringDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const parsed = JSON.parse(data);
          
          switch (file) {
            case 'domain_stats.json':
              this.domainStats = new Map(Object.entries(parsed));
              this.deserializeDomainStats();
              break;
            case 'user_stats.json':
              this.userStats = new Map(Object.entries(parsed));
              this.deserializeUserStats();
              break;
            case 'step_performance.json':
              this.stepPerformance = new Map(Object.entries(parsed));
              break;
            case 'batch_metrics.json':
              this.batchMetrics = new Map(Object.entries(parsed));
              break;
            case 'jobtitle_stats.json':
              this.jobTitleStats = new Map(Object.entries(parsed));
              this.deserializeJobTitleStats();
              break;
            case 'user_plan_stats.json':
              this.userPlanStats = parsed;
              break;
          }
        } catch (fileError) {
          config.smartLog('buffer',`No existing ${file}, starting fresh`);
        }
      }
      
      config.smartLog('buffer',`📈 Loaded monitoring data: ${this.domainStats.size} domains, ${this.userStats.size} users`);
    } catch (error) {
      config.smartLog('buffer',`Failed to load historical data: ${error.message}`);
    }
  }

  deserializeDomainStats() {
    for (const [domain, stats] of this.domainStats.entries()) {
      if (stats.uniqueUsers && Array.isArray(stats.uniqueUsers)) {
        stats.uniqueUsers = new Set(stats.uniqueUsers);
      } else {
        stats.uniqueUsers = new Set();
      }
    }
  }

  deserializeUserStats() {
    for (const [userId, stats] of this.userStats.entries()) {
      if (stats.totalDomains && Array.isArray(stats.totalDomains)) {
        stats.totalDomains = new Set(stats.totalDomains);
      } else {
        stats.totalDomains = new Set();
      }
    }
  }

  deserializeJobTitleStats() {
    for (const [title, stats] of this.jobTitleStats.entries()) {
      if (stats.variations && Array.isArray(stats.variations)) {
        stats.variations = new Set(stats.variations);
      } else {
        stats.variations = new Set();
      }
    }
  }

  async loadAggregatedMetrics() {
    try {
      const periods = ['hourly', 'daily', 'weekly', 'monthly'];
      
      for (const period of periods) {
        try {
          const filePath = path.join(this.monitoringDir, `${period}_metrics.json`);
          const data = await fs.readFile(filePath, 'utf8');
          const parsed = JSON.parse(data);
          
          this.metrics[period] = new Map(Object.entries(parsed));
          config.smartLog('buffer',`📊 Loaded ${period} metrics: ${this.metrics[period].size} entries`);
        } catch (fileError) {
          config.smartLog('buffer',`No existing ${period}_metrics.json, starting fresh`);
        }
      }
    } catch (error) {
      config.smartLog('buffer',`Failed to load aggregated metrics: ${error.message}`);
    }
  }

  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this.collectRealtimeMetrics();
    }, 10000);
    
    config.smartLog('buffer','🔄 Started realtime metrics collection (10s interval)');
  }

  startDataPersistence() {
    this.saveInterval = setInterval(() => {
      this.persistMetrics();
    }, 60000);
    
    config.smartLog('buffer','💾 Started data persistence (60s interval)');
  }

  collectRealtimeMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.metrics.realtime = {
      requests: this.calculateRequestMetrics(),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        available: Math.round((memUsage.heapTotal - memUsage.heapUsed) / 1024 / 1024),
        percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        total: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      cpu: {
        percentage: this.calculateCpuPercent(cpuUsage),
        load: Math.round(process.uptime())
      },
      activeUsers: this.getActiveUserCount(),
      activeDomains: this.getActiveDomainCount(),
      queueLength: this.getQueueLength(),
      lastUpdate: Date.now()
    };
    
    this.aggregateMetrics();
  }

  calculateRequestMetrics() {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * 60 * 1000;
    
    let lastMinute = 0;
    let lastHour = 0;
    
    for (const [userId, userStat] of this.userStats.entries()) {
      if (userStat.lastActivity && (now - userStat.lastActivity) < oneMinute) {
        lastMinute += userStat.requestsLastMinute || 0;
      }
      if (userStat.lastActivity && (now - userStat.lastActivity) < oneHour) {
        lastHour += userStat.requestsLastHour || 0;
      }
    }
    
    return {
      current: this.getCurrentActiveRequests(),
      lastMinute,
      lastHour
    };
  }

  calculateCpuPercent(cpuUsage) {
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCpuTime / 1000000) / process.uptime() * 100;
    return Math.min(Math.round(cpuPercent), 100);
  }

  getCurrentActiveRequests() {
    try {
      const ProfileQueueManager = require('../scrapers/ProfileQueueManager');
      const stats = ProfileQueueManager.getQueueStats();
      return stats.totalActiveScrapeCount || 0;
    } catch (error) {
      return 0;
    }
  }

  getActiveUserCount() {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    let activeCount = 0;
    for (const [userId, userStat] of this.userStats.entries()) {
      if (userStat.lastActivity && (now - userStat.lastActivity) < fiveMinutes) {
        activeCount++;
      }
    }
    return activeCount;
  }

  getActiveDomainCount() {
    try {
      const ProfileQueueManager = require('../scrapers/ProfileQueueManager');
      const stats = ProfileQueueManager.getQueueStats();
      return stats.globalScrapingQueueSize || 0;
    } catch (error) {
      return 0;
    }
  }

  getQueueLength() {
    try {
      const ProfileQueueManager = require('../scrapers/ProfileQueueManager');
      const stats = ProfileQueueManager.getQueueStats();
      return stats.totalWaitingRequests || 0;
    } catch (error) {
      return 0;
    }
  }

  aggregateMetrics() {
    const now = new Date();
    const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}`;
    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const weekKey = this.getWeekKey(now);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    this.updateMetricsPeriod(this.metrics.hourly, hourKey, this.metrics.realtime);
    this.updateMetricsPeriod(this.metrics.daily, dayKey, this.metrics.realtime);
    this.updateMetricsPeriod(this.metrics.weekly, weekKey, this.metrics.realtime);
    this.updateMetricsPeriod(this.metrics.monthly, monthKey, this.metrics.realtime);
  }

  getWeekKey(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - startOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
  }

  updateMetricsPeriod(periodMap, key, metrics) {
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        timestamp: new Date().toISOString(),
        date: new Date().toDateString(),
        weekday: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        requests: 0,
        peakRequests: 0,
        avgMemory: 0,
        peakMemory: 0,
        avgCpu: 0,
        peakCpu: 0,
        avgUsers: 0,
        peakUsers: 0,
        samples: 0
      });
    }
    
    const period = periodMap.get(key);
    period.samples++;
    
    period.requests += metrics.requests.current;
    period.peakRequests = Math.max(period.peakRequests, metrics.requests.current);
    
    period.avgMemory = Math.round(((period.avgMemory * (period.samples - 1)) + metrics.memory.percentage) / period.samples);
    period.peakMemory = Math.max(period.peakMemory, metrics.memory.percentage);
    
    period.avgCpu = Math.round(((period.avgCpu * (period.samples - 1)) + metrics.cpu.percentage) / period.samples);
    period.peakCpu = Math.max(period.peakCpu, metrics.cpu.percentage);
    
    period.avgUsers = Math.round(((period.avgUsers * (period.samples - 1)) + metrics.activeUsers) / period.samples);
    period.peakUsers = Math.max(period.peakUsers, metrics.activeUsers);
  }

  trackRequest(userId, domain, jobTitle, plan = 'free') {
    this.trackUser(userId, plan);
    this.trackDomain(domain);
    this.trackJobTitle(jobTitle);
  }

  trackUser(userId, plan = 'free') {
    if (!this.userStats.has(userId)) {
      this.userStats.set(userId, {
        userId,
        plan,
        totalRequests: 0,
        totalDomains: new Set(),
        firstSeen: Date.now(),
        lastActivity: Date.now(),
        requestsToday: 0,
        requestsThisWeek: 0,
        requestsThisMonth: 0,
        requestsLastMinute: 0,
        requestsLastHour: 0
      });
      this.userPlanStats[plan]++;
    }
    
    const userStat = this.userStats.get(userId);
    userStat.totalRequests++;
    userStat.lastActivity = Date.now();
    userStat.plan = plan;
    
    this.updateUserPeriodRequests(userStat);
  }

  updateUserPeriodRequests(userStat) {
    const now = new Date();
    const today = now.toDateString();
    const weekStart = this.getWeekStart(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    if (!userStat.lastRequestDate || userStat.lastRequestDate !== today) {
      userStat.requestsToday = 1;
      userStat.lastRequestDate = today;
    } else {
      userStat.requestsToday++;
    }
    
    if (!userStat.lastWeekStart || userStat.lastWeekStart !== weekStart.getTime()) {
      userStat.requestsThisWeek = 1;
      userStat.lastWeekStart = weekStart.getTime();
    } else {
      userStat.requestsThisWeek++;
    }
    
    if (!userStat.lastMonthStart || userStat.lastMonthStart !== monthStart.getTime()) {
      userStat.requestsThisMonth = 1;
      userStat.lastMonthStart = monthStart.getTime();
    } else {
      userStat.requestsThisMonth++;
    }
    
    userStat.requestsLastMinute = (userStat.requestsLastMinute || 0) + 1;
    userStat.requestsLastHour = (userStat.requestsLastHour || 0) + 1;
    
    setTimeout(() => { userStat.requestsLastMinute = Math.max(0, (userStat.requestsLastMinute || 1) - 1); }, 60000);
    setTimeout(() => { userStat.requestsLastHour = Math.max(0, (userStat.requestsLastHour || 1) - 1); }, 3600000);
  }

  getWeekStart(date) {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
  }

  trackDomain(domain) {
    if (!this.domainStats.has(domain)) {
      this.domainStats.set(domain, {
        domain,
        totalRequests: 0,
        totalTime: 0,
        avgTime: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        requestsToday: 0,
        requestsThisWeek: 0,
        requestsThisMonth: 0,
        peakTime: 0,
        lastStep: null,
        uniqueUsers: new Set()
      });
    }
    
    const domainStat = this.domainStats.get(domain);
    domainStat.totalRequests++;
    domainStat.lastSeen = Date.now();
    
    this.updateDomainPeriodRequests(domainStat);
  }

  updateDomainPeriodRequests(domainStat) {
    const now = new Date();
    const today = now.toDateString();
    const weekStart = this.getWeekStart(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    if (!domainStat.lastRequestDate || domainStat.lastRequestDate !== today) {
      domainStat.requestsToday = 1;
      domainStat.lastRequestDate = today;
    } else {
      domainStat.requestsToday++;
    }
    
    if (!domainStat.lastWeekStart || domainStat.lastWeekStart !== weekStart.getTime()) {
      domainStat.requestsThisWeek = 1;
      domainStat.lastWeekStart = weekStart.getTime();
    } else {
      domainStat.requestsThisWeek++;
    }
    
    if (!domainStat.lastMonthStart || domainStat.lastMonthStart !== monthStart.getTime()) {
      domainStat.requestsThisMonth = 1;
      domainStat.lastMonthStart = monthStart.getTime();
    } else {
      domainStat.requestsThisMonth++;
    }
  }

  trackJobTitle(jobTitle) {
    if (!jobTitle || jobTitle.trim() === '') return;
    
    const normalized = jobTitle.toLowerCase().trim();
    
    if (!this.jobTitleStats.has(normalized)) {
      this.jobTitleStats.set(normalized, {
        title: jobTitle,
        count: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        variations: new Set([jobTitle])
      });
    }
    
    const jobStat = this.jobTitleStats.get(normalized);
    jobStat.count++;
    jobStat.lastSeen = Date.now();
    
    if (!jobStat.variations || !(jobStat.variations instanceof Set)) {
      jobStat.variations = new Set([jobTitle]);
    }
    
    jobStat.variations.add(jobTitle);
  }

  trackScrapingResult(domain, stepUsed, duration, success, userId) {
    this.trackStepPerformance(stepUsed, duration, success);
    this.updateDomainResult(domain, duration, success, stepUsed, userId);
  }

  trackStepPerformance(stepUsed, duration, success) {
    if (!this.stepPerformance.has(stepUsed)) {
      this.stepPerformance.set(stepUsed, {
        step: stepUsed,
        totalCalls: 0,
        totalTime: 0,
        avgTime: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        minTime: duration,
        maxTime: duration
      });
    }
    
    const stepStat = this.stepPerformance.get(stepUsed);
    stepStat.totalCalls++;
    stepStat.totalTime += duration;
    stepStat.avgTime = stepStat.totalTime / stepStat.totalCalls;
    
    if (success) {
      stepStat.successCount++;
    } else {
      stepStat.failureCount++;
    }
    
    stepStat.successRate = (stepStat.successCount / stepStat.totalCalls) * 100;
    stepStat.minTime = Math.min(stepStat.minTime, duration);
    stepStat.maxTime = Math.max(stepStat.maxTime, duration);
  }

  updateDomainResult(domain, duration, success, stepUsed, userId) {
    const domainStat = this.domainStats.get(domain);
    if (!domainStat) return;
    
    domainStat.totalTime += duration;
    domainStat.avgTime = domainStat.totalTime / domainStat.totalRequests;
    domainStat.peakTime = Math.max(domainStat.peakTime, duration);
    domainStat.lastStep = stepUsed;
    
    if (userId) {
      if (!domainStat.uniqueUsers || !(domainStat.uniqueUsers instanceof Set)) {
        domainStat.uniqueUsers = new Set();
      }
      domainStat.uniqueUsers.add(userId);
    }
    
    if (success) {
      domainStat.successCount++;
    } else {
      domainStat.failureCount++;
    }
    
    domainStat.successRate = (domainStat.successCount / (domainStat.successCount + domainStat.failureCount)) * 100;
  }

  trackBatch(batchId, domains, config, duration) {
    this.batchMetrics.set(batchId, {
      batchId,
      domains: domains.length,
      config,
      duration,
      timestamp: Date.now(),
      avgTimePerDomain: duration / domains.length
    });
  }

  async persistMetrics() {
    try {
      const files = [
        { name: 'domain_stats.json', data: this.serializeDomainStats() },
        { name: 'user_stats.json', data: this.serializeUserStats() },
        { name: 'step_performance.json', data: Object.fromEntries(this.stepPerformance) },
        { name: 'batch_metrics.json', data: this.serializeBatchMetrics() },
        { name: 'jobtitle_stats.json', data: this.serializeJobTitleStats() },
        { name: 'user_plan_stats.json', data: this.userPlanStats },
        { name: 'realtime_metrics.json', data: this.metrics.realtime },
        { name: 'hourly_metrics.json', data: Object.fromEntries(this.metrics.hourly) },
        { name: 'daily_metrics.json', data: Object.fromEntries(this.metrics.daily) },
        { name: 'weekly_metrics.json', data: Object.fromEntries(this.metrics.weekly) },
        { name: 'monthly_metrics.json', data: Object.fromEntries(this.metrics.monthly) }
      ];
      
      for (const file of files) {
        const filePath = path.join(this.monitoringDir, file.name);
        await fs.writeFile(filePath, JSON.stringify(file.data, null, 2));
      }
      
      config.smartLog('buffer','💾 Monitoring metrics persisted (including historical data)');
    } catch (error) {
      config.smartLog('fail',`Failed to persist metrics: ${error.message}`);
    }
  }

  getHistoricalData(period, limit = 30) {
    const periodMap = this.metrics[period];
    if (!periodMap || periodMap.size === 0) {
      return [];
    }
    
    return Array.from(periodMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-limit)
      .map(([key, data]) => ({
        ...data,
        key
      }));
  }

  generateTimelineData(days = 30) {
    const timeline = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      const dayData = this.metrics.daily.get(dayKey);
      
      timeline.push({
        timestamp: date.toISOString(),
        date: date.toDateString(),
        weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
        requests: dayData?.requests || 0,
        peakRequests: dayData?.peakRequests || 0,
        avgMemory: dayData?.avgMemory || 0,
        peakMemory: dayData?.peakMemory || 0,
        avgCpu: dayData?.avgCpu || 0,
        peakCpu: dayData?.peakCpu || 0,
        avgUsers: dayData?.avgUsers || 0,
        peakUsers: dayData?.peakUsers || 0,
        samples: dayData?.samples || 0
      });
    }
    
    return timeline;
  }

  serializeDomainStats() {
    const serialized = {};
    for (const [domain, stats] of this.domainStats.entries()) {
      serialized[domain] = {
        ...stats,
        uniqueUsers: Array.from(stats.uniqueUsers || [])
      };
    }
    return serialized;
  }

  serializeUserStats() {
    const serialized = {};
    for (const [userId, stats] of this.userStats.entries()) {
      serialized[userId] = {
        ...stats,
        totalDomains: Array.from(stats.totalDomains || [])
      };
    }
    return serialized;
  }

  serializeBatchMetrics() {
    const recent = Array.from(this.batchMetrics.entries())
      .slice(-100)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    return recent;
  }

  serializeJobTitleStats() {
    const serialized = {};
    for (const [title, stats] of this.jobTitleStats.entries()) {
      serialized[title] = {
        ...stats,
        variations: Array.from(stats.variations || [])
      };
    }
    return serialized;
  }

  getSystemOverview() {
    return {
      realtime: this.metrics.realtime,
      totals: {
        domains: this.domainStats.size,
        users: this.userStats.size,
        jobTitles: this.jobTitleStats.size,
        batches: this.batchMetrics.size,
        userPlans: this.userPlanStats
      },
      top: {
        domains: this.getTopDomains(10),
        users: this.getTopUsers(10),
        jobTitles: this.getTopJobTitles(10),
        steps: this.getTopSteps(10)
      },
      timestamp: Date.now()
    };
  }

  getTopDomains(limit = 10) {
    return Array.from(this.domainStats.values())
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, limit)
      .map(domain => ({
        domain: domain.domain,
        requests: domain.totalRequests,
        avgTime: Math.round(domain.avgTime),
        successRate: Math.round(domain.successRate)
      }));
  }

  getTopUsers(limit = 10) {
    return Array.from(this.userStats.values())
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, limit)
      .map(user => ({
        userId: user.userId,
        plan: user.plan,
        requests: user.totalRequests,
        domains: Array.from(user.totalDomains || []).length
      }));
  }

  getTopJobTitles(limit = 10) {
    return Array.from(this.jobTitleStats.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(job => ({
        title: job.title,
        count: job.count,
        variations: Array.from(job.variations || []).length
      }));
  }

  getTopSteps(limit = 10) {
    return Array.from(this.stepPerformance.values())
      .sort((a, b) => b.totalCalls - a.totalCalls)
      .slice(0, limit)
      .map(step => ({
        step: step.step,
        calls: step.totalCalls,
        avgTime: Math.round(step.avgTime),
        successRate: Math.round(step.successRate)
      }));
  }

  async shutdown() {
    config.smartLog('buffer','📊 MonitoringService shutting down...');
    
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    await this.persistMetrics();
    
    config.smartLog('buffer','✅ MonitoringService shutdown complete');
  }
}

module.exports = new MonitoringService();