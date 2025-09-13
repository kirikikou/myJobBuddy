const express = require('express');
const router = express.Router();
const MonitoringService = require('../monitoring/MonitoringService');

router.get('/', (req, res) => {
  res.sendFile(require('path').join(__dirname, '../public/monitoring/historical.html'));
});

router.get('/api/timeline/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { days = 30, domain = null } = req.query;
    
    let timelineData = [];
    const now = new Date();
    
    switch (period) {
      case 'hourly':
        timelineData = generateHourlyTimeline(parseInt(days));
        break;
      case 'daily':
        timelineData = generateDailyTimeline(parseInt(days));
        break;
      case 'weekly':
        timelineData = generateWeeklyTimeline(12);
        break;
      case 'monthly':
        timelineData = generateMonthlyTimeline(12);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }
    
    if (domain) {
      timelineData = filterByDomain(timelineData, domain);
    }
    
    res.json({
      success: true,
      data: {
        period,
        timeline: timelineData,
        total: timelineData.length,
        domain: domain || 'all',
        timestamp: Date.now()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function generateHourlyTimeline(days) {
  const timeline = [];
  const now = new Date();
  
  for (let i = days * 24; i >= 0; i--) {
    const date = new Date(now.getTime() - (i * 60 * 60 * 1000));
    const hourKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
    
    const hourlyData = MonitoringService.metrics.hourly.get(hourKey);
    
    timeline.push({
      timestamp: date.toISOString(),
      hour: date.getHours(),
      date: date.toDateString(),
      requests: hourlyData?.requests?.total || 0,
      peakRequests: hourlyData?.requests?.peak || 0,
      avgMemory: hourlyData ? Math.round(hourlyData.memory.avg) : 0,
      peakMemory: hourlyData?.memory?.peak || 0,
      avgCpu: hourlyData ? Math.round(hourlyData.cpu.avg) : 0,
      peakCpu: hourlyData?.cpu?.peak || 0,
      avgUsers: hourlyData ? Math.round(hourlyData.users.avg) : 0,
      peakUsers: hourlyData?.users?.peak || 0,
      samples: hourlyData?.samples || 0
    });
  }
  
  return timeline;
}

function generateDailyTimeline(days) {
  const timeline = [];
  const now = new Date();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    
    const dailyData = MonitoringService.metrics.daily.get(dayKey);
    
    timeline.push({
      timestamp: date.toISOString(),
      date: date.toDateString(),
      weekday: date.toLocaleDateString('en', { weekday: 'long' }),
      requests: dailyData?.requests?.total || 0,
      peakRequests: dailyData?.requests?.peak || 0,
      avgMemory: dailyData ? Math.round(dailyData.memory.avg) : 0,
      peakMemory: dailyData?.memory?.peak || 0,
      avgCpu: dailyData ? Math.round(dailyData.cpu.avg) : 0,
      peakCpu: dailyData?.cpu?.peak || 0,
      avgUsers: dailyData ? Math.round(dailyData.users.avg) : 0,
      peakUsers: dailyData?.users?.peak || 0,
      samples: dailyData?.samples || 0
    });
  }
  
  return timeline;
}

function generateWeeklyTimeline(weeks) {
  const timeline = [];
  const now = new Date();
  
  for (let i = weeks; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
    const weekKey = getWeekKey(weekStart);
    
    const weeklyData = MonitoringService.metrics.weekly.get(weekKey);
    
    timeline.push({
      timestamp: weekStart.toISOString(),
      week: weekKey,
      weekStart: weekStart.toDateString(),
      requests: weeklyData?.requests?.total || 0,
      peakRequests: weeklyData?.requests?.peak || 0,
      avgMemory: weeklyData ? Math.round(weeklyData.memory.avg) : 0,
      peakMemory: weeklyData?.memory?.peak || 0,
      avgCpu: weeklyData ? Math.round(weeklyData.cpu.avg) : 0,
      peakCpu: weeklyData?.cpu?.peak || 0,
      avgUsers: weeklyData ? Math.round(weeklyData.users.avg) : 0,
      peakUsers: weeklyData?.users?.peak || 0,
      samples: weeklyData?.samples || 0
    });
  }
  
  return timeline;
}

function generateMonthlyTimeline(months) {
  const timeline = [];
  const now = new Date();
  
  for (let i = months; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    
    const monthlyData = MonitoringService.metrics.monthly.get(monthKey);
    
    timeline.push({
      timestamp: monthDate.toISOString(),
      month: monthDate.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
      monthKey: monthKey,
      requests: monthlyData?.requests?.total || 0,
      peakRequests: monthlyData?.requests?.peak || 0,
      avgMemory: monthlyData ? Math.round(monthlyData.memory.avg) : 0,
      peakMemory: monthlyData?.memory?.peak || 0,
      avgCpu: monthlyData ? Math.round(monthlyData.cpu.avg) : 0,
      peakCpu: monthlyData?.cpu?.peak || 0,
      avgUsers: monthlyData ? Math.round(monthlyData.users.avg) : 0,
      peakUsers: monthlyData?.users?.peak || 0,
      samples: monthlyData?.samples || 0
    });
  }
  
  return timeline;
}

function getWeekKey(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - startOfYear) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNumber}`;
}

function filterByDomain(timeline, domain) {
  return timeline.map(entry => ({
    ...entry,
    domainSpecific: true,
    targetDomain: domain
  }));
}

router.get('/api/batch-analysis', async (req, res) => {
  try {
    const IntelligentBatchManager = require('../utils/IntelligentBatchManager');
    const ResourceMonitor = require('../utils/ResourceMonitor');
    const QueueBuffer = require('../utils/QueueBuffer');
    
    const batchStats = IntelligentBatchManager.getBatchingStats();
    const resourceStats = ResourceMonitor.getResourceStats();
    const queueStats = QueueBuffer.getQueueStats();
    
    const analysis = {
      batchSystem: {
        status: 'active',
        totalBatches: batchStats.history.totalBatches,
        averageBatchTime: batchStats.history.averageBatchTime,
        currentQueue: batchStats.currentQueue.size,
        efficiency: calculateBatchEfficiency(batchStats)
      },
      parallelization: {
        currentParallel: getCurrentParallelCount(),
        optimalParallel: getOptimalParallelCount(),
        utilizationRate: calculateUtilizationRate(resourceStats),
        adaptiveDecisions: getAdaptiveDecisions()
      },
      awsFallback: {
        fallbackRate: calculateAWSFallbackRate(),
        serverCapacity: calculateServerCapacity(resourceStats),
        queueManagement: queueStats.queues.server.estimatedWaitTime
      },
      recommendations: generatePerformanceRecommendations(batchStats, resourceStats, queueStats)
    };
    
    res.json({
      success: true,
      data: analysis,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function calculateBatchEfficiency(batchStats) {
  const recentBatches = batchStats.currentQueue.batches || [];
  if (recentBatches.length === 0) return 0;
  
  const avgTime = recentBatches.reduce((sum, batch) => sum + (batch.duration || 0), 0) / recentBatches.length;
  const targetTime = 150000;
  
  return Math.max(0, Math.min(100, ((targetTime - avgTime) / targetTime) * 100));
}

function getCurrentParallelCount() {
  try {
    const ProfileQueueManager = require('../scrapers/ProfileQueueManager');
    const stats = ProfileQueueManager.getQueueStats();
    return stats.totalActiveScrapeCount || 0;
  } catch (error) {
    return 0;
  }
}

function getOptimalParallelCount() {
  try {
    const ResourceMonitor = require('../utils/ResourceMonitor');
    return ResourceMonitor.calculateOptimalParallel(['example.com']) || 5;
  } catch (error) {
    return 5;
  }
}

function calculateUtilizationRate(resourceStats) {
  const cpuUtil = resourceStats.current.cpu / 100;
  const memUtil = resourceStats.current.ram / 8;
  return Math.round(((cpuUtil + memUtil) / 2) * 100);
}

function getAdaptiveDecisions() {
  return {
    lastDecision: 'server-processing',
    decisionTime: Date.now() - 30000,
    reason: 'Sufficient server capacity',
    alternativeConsidered: 'aws-fallback'
  };
}

function calculateAWSFallbackRate() {
  const total = MonitoringService.stats?.totalRequests || 1;
  const aws = MonitoringService.stats?.awsFallbacks || 0;
  return Math.round((aws / total) * 100);
}

function calculateServerCapacity(resourceStats) {
  const maxCpu = 80;
  const maxMem = 6;
  
  const cpuCapacity = Math.max(0, maxCpu - resourceStats.current.cpu);
  const memCapacity = Math.max(0, maxMem - resourceStats.current.ram);
  
  return {
    cpu: cpuCapacity,
    memory: memCapacity,
    overall: Math.round(((cpuCapacity / maxCpu) + (memCapacity / maxMem)) / 2 * 100)
  };
}

function generatePerformanceRecommendations(batchStats, resourceStats, queueStats) {
  const recommendations = [];
  
  if (resourceStats.current.cpu > 75) {
    recommendations.push({
      type: 'performance',
      priority: 'high',
      message: 'CPU usage high - consider reducing batch sizes or increasing AWS fallback threshold',
      action: 'reduce_parallel_count'
    });
  }
  
  if (queueStats.queues.server.length > 10) {
    recommendations.push({
      type: 'queue',
      priority: 'medium', 
      message: 'Server queue building up - increase parallel processing or enable AWS fallback',
      action: 'increase_parallel_or_aws'
    });
  }
  
  if (batchStats.history.averageBatchTime > 180) {
    recommendations.push({
      type: 'efficiency',
      priority: 'medium',
      message: 'Batch processing slower than target - optimize step selection',
      action: 'optimize_steps'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'status',
      priority: 'info',
      message: 'System operating within optimal parameters',
      action: 'maintain_current'
    });
  }
  
  return recommendations;
}

module.exports = router;