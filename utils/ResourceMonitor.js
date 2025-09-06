const config = require('../config');
const fs = require('fs');
const path = require('path');
const parallelizationConfig = require('../config/parallelization');

class ResourceMonitor {
  constructor() {
    this.metrics = {
      cpu: 0,
      ram: 0,
      activeWorkers: 0,
      queueLength: 0,
      lastUpdate: Date.now()
    };
    this.stepWeights = parallelizationConfig.STEP_WEIGHTS;
    this.averageStepTimes = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.loadAverageStepTimes();
    this.initialized = true;
    config.smartLog('buffer','🔧 ResourceMonitor initialized');
  }

  async loadAverageStepTimes() {
    try {
      const debugDir = path.join(__dirname, '../debug');
      const metricsPath = path.join(debugDir, 'scraping_metrics.json');
      
      if (fs.existsSync(metricsPath)) {
        const data = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
        
        if (data.stepPerformance) {
          for (const [step, metrics] of Object.entries(data.stepPerformance)) {
            this.averageStepTimes.set(step, metrics.averageTime || 20000);
          }
        }
      }
      
      if (this.averageStepTimes.size === 0) {
        this.averageStepTimes.set('http-simple', 5000);
        this.averageStepTimes.set('mobile-variant', 8000);
        this.averageStepTimes.set('lighthouse', 12000);
        this.averageStepTimes.set('headless', 25000);
        this.averageStepTimes.set('ocr-fallback', 45000);
      }
      
      config.smartLog('buffer',`📊 Loaded ${this.averageStepTimes.size} average step times`);
    } catch (error) {
      config.smartLog('buffer',`⚠️ Failed to load step times: ${error.message}`);
    }
  }

  getCurrentLoad() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.metrics = {
      cpu: this.calculateCpuPercent(cpuUsage),
      ram: memUsage.heapUsed / (1024 * 1024 * 1024),
      activeWorkers: this.getActiveWorkerCount(),
      queueLength: this.getQueueLength(),
      lastUpdate: Date.now()
    };
    
    return this.metrics;
  }

  calculateCpuPercent(cpuUsage) {
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    const cpuPercent = (totalCpuTime / 1000000) / process.uptime() * 100;
    return Math.min(cpuPercent, 100);
  }

  getActiveWorkerCount() {
    try {
      const ProfileQueueManager = require('../scrapers/ProfileQueueManager');
      const stats = ProfileQueueManager.getQueueStats();
      return stats.totalActiveScrapeCount || 0;
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

  estimateStepWeight(domain) {
    try {
      const DomainProfiler = require('../scrapers/DomainProfiler');
      const profiler = new DomainProfiler();
      const profile = profiler.currentProfiles?.get(domain);
      
      if (profile && profile.bestStep) {
        return this.stepWeights[profile.bestStep] || 5;
      }
      
      return 3;
    } catch (error) {
      return 3;
    }
  }

  getStepWeight(stepType) {
    return this.stepWeights[stepType] || 5;
  }

  getAverageStepTime(domains) {
    if (!domains || domains.length === 0) return 20000;
    
    let totalTime = 0;
    let count = 0;
    
    for (const domain of domains) {
      try {
        const DomainProfiler = require('../scrapers/DomainProfiler');
        const profiler = new DomainProfiler();
        const profile = profiler.currentProfiles?.get(domain);
        
        if (profile && profile.bestStep) {
          const stepTime = this.averageStepTimes.get(profile.bestStep) || 20000;
          totalTime += stepTime;
        } else {
          totalTime += 20000;
        }
        count++;
      } catch (error) {
        totalTime += 20000;
        count++;
      }
    }
    
    return count > 0 ? totalTime / count : 20000;
  }

  estimateProcessingTime(domains, parallelCount) {
    const averageStepTime = this.getAverageStepTime(domains);
    const batchCount = Math.ceil(domains.length / parallelCount);
    return batchCount * averageStepTime;
  }

  getAvailableResources() {
    const currentLoad = this.getCurrentLoad();
    const maxCpu = parallelizationConfig.RESOURCE_LIMITS.MAX_CPU_PERCENT;
    const maxRam = parallelizationConfig.RESOURCE_LIMITS.MAX_RAM_GB;
    
    return {
      cpu: Math.max(0, (maxCpu - currentLoad.cpu) / 100),
      ram: Math.max(0, maxRam - currentLoad.ram),
      workers: Math.max(0, parallelizationConfig.RESOURCE_LIMITS.MAX_CONCURRENT_SCRAPERS - currentLoad.activeWorkers)
    };
  }

  canHandleLoad(estimatedWeight) {
    const available = this.getAvailableResources();
    const maxConcurrentWeight = available.cpu * 40;
    
    return estimatedWeight <= maxConcurrentWeight && available.workers > 0;
  }

  calculateOptimalParallel(domains) {
    if (!this.initialized) {
      config.smartLog('buffer','⚠️ ResourceMonitor not initialized, using default parallel count');
      return Math.min(5, domains.length);
    }
    
    const available = this.getAvailableResources();
    const totalWeight = domains.reduce((sum, domain) => {
      return sum + this.estimateStepWeight(domain);
    }, 0);
    
    const averageWeight = totalWeight / domains.length;
    const maxConcurrentWeight = available.cpu * 40;
    
    if (totalWeight <= maxConcurrentWeight) {
      const maxByWorkers = Math.min(available.workers, domains.length);
      const maxByCpu = Math.floor(maxConcurrentWeight / averageWeight);
      return Math.min(maxByWorkers, maxByCpu, parallelizationConfig.MAX_PARALLEL);
    }
    
    const optimalParallel = Math.floor(maxConcurrentWeight / averageWeight);
    return Math.max(
      parallelizationConfig.MIN_PARALLEL,
      Math.min(optimalParallel, parallelizationConfig.MAX_PARALLEL, available.workers)
    );
  }

  shouldUseServerProcessing(domains) {
    const optimalParallel = this.calculateOptimalParallel(domains);
    const estimatedTime = this.estimateProcessingTime(domains, optimalParallel);
    const maxWaitTimeMs = parallelizationConfig.MAX_WAIT_TIME_MINUTES * 60 * 1000;
    
    const queueWaitTime = this.getQueueLength() * 15000;
    const totalWaitTime = estimatedTime + queueWaitTime;
    
    return totalWaitTime <= maxWaitTimeMs;
  }

  getResourceStats() {
    return {
      current: this.metrics,
      available: this.getAvailableResources(),
      limits: parallelizationConfig.RESOURCE_LIMITS,
      stepWeights: Object.fromEntries(this.averageStepTimes),
      timestamp: Date.now()
    };
  }

  async updateStepTime(stepType, duration) {
    const current = this.averageStepTimes.get(stepType) || 20000;
    const updated = (current * 0.8) + (duration * 0.2);
    this.averageStepTimes.set(stepType, updated);
    
    try {
      await this.saveStepTimes();
    } catch (error) {
      config.smartLog('buffer',`⚠️ Failed to save step times: ${error.message}`);
    }
  }

  async saveStepTimes() {
    try {
      const debugDir = path.join(__dirname, '../debug');
      const metricsPath = path.join(debugDir, 'resource_metrics.json');
      
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const data = {
        stepTimes: Object.fromEntries(this.averageStepTimes),
        lastUpdated: new Date().toISOString(),
        totalUpdates: this.averageStepTimes.size
      };
      
      fs.writeFileSync(metricsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      config.smartLog('buffer',`⚠️ Failed to save step times: ${error.message}`);
    }
  }
}

module.exports = new ResourceMonitor();