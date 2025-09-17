const express = require('express');
const router = express.Router();
const QueueBuffer = require('../utils/QueueBuffer');
const queueConfig = require('../config/queue');
const loggingService = require('../services/LoggingService');

function requireAdminAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required',
      redirectTo: '/login'
    });
  }
  
  if (!['admin', 'monitoring', 'developer'].includes(req.user.role)) {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required',
      userRole: req.user.role,
      requiredRoles: ['admin', 'monitoring', 'developer']
    });
  }
  
  next();
}

function logAdminAction(action, details = {}) {
  return (req, res, next) => {
    const logData = {
      action,
      userId: req.user?.id || 'unknown',
      userEmail: req.user?.email || 'unknown',
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      ...details
    };
    
    loggingService.service('QueueAdmin', action, logData);
    next();
  };
}

router.get('/dlq', requireAdminAuth, logAdminAction('dlq-list-accessed'), async (req, res) => {
  try {
    const { 
      errorClass, 
      domain, 
      page = 1, 
      limit = 50, 
      sortBy = 'timestamp', 
      sortOrder = 'desc' 
    } = req.query;
    
    const filters = {};
    if (errorClass) filters.errorClass = errorClass;
    if (domain) filters.domain = domain;
    
    const dlqData = QueueBuffer.getDeadLetterQueue(filters);
    
    let items = dlqData.items;
    
    if (sortBy === 'timestamp') {
      items.sort((a, b) => {
        const comparison = b.timestamp - a.timestamp;
        return sortOrder === 'asc' ? -comparison : comparison;
      });
    } else if (sortBy === 'attempts') {
      items.sort((a, b) => {
        const comparison = b.attempts - a.attempts;
        return sortOrder === 'asc' ? -comparison : comparison;
      });
    } else if (sortBy === 'domain') {
      items.sort((a, b) => {
        const comparison = a.domain.localeCompare(b.domain);
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }
    
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + parseInt(limit));
    
    const errorClasses = [...new Set(dlqData.items.map(item => item.errorClass))];
    const domains = [...new Set(dlqData.items.map(item => item.domain))];
    
    res.json({
      success: true,
      data: {
        items: paginatedItems.map(item => ({
          requestKey: item.requestKey,
          timestamp: item.timestamp,
          originalTimestamp: item.originalTimestamp,
          attempts: item.attempts,
          errorClass: item.errorClass,
          errorMessage: item.errorMessage.substring(0, 200) + (item.errorMessage.length > 200 ? '...' : ''),
          domain: item.domain,
          priority: item.priority,
          payloadHash: item.payloadHash,
          age: Date.now() - item.timestamp,
          originalAge: Date.now() - item.originalTimestamp
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems,
          itemsPerPage: parseInt(limit),
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: {
          availableErrorClasses: errorClasses,
          availableDomains: domains,
          applied: filters
        },
        statistics: {
          totalInDLQ: dlqData.total,
          filteredCount: dlqData.filtered,
          errorClassDistribution: errorClasses.reduce((acc, errorClass) => {
            acc[errorClass] = dlqData.items.filter(item => item.errorClass === errorClass).length;
            return acc;
          }, {}),
          domainDistribution: domains.slice(0, 10).reduce((acc, domain) => {
            acc[domain] = dlqData.items.filter(item => item.domain === domain).length;
            return acc;
          }, {}),
          oldestItem: items.length > 0 ? Math.max(...items.map(item => Date.now() - item.timestamp)) : 0,
          avgAttempts: items.length > 0 ? items.reduce((sum, item) => sum + item.attempts, 0) / items.length : 0
        }
      },
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('DLQ list retrieval failed', { 
      error: error.message,
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dlq/:requestKey', requireAdminAuth, logAdminAction('dlq-item-accessed'), async (req, res) => {
  try {
    const { requestKey } = req.params;
    
    const dlqData = QueueBuffer.getDeadLetterQueue();
    const item = dlqData.items.find(item => item.requestKey === requestKey);
    
    if (!item) {
      return res.status(404).json({ 
        success: false, 
        error: 'DLQ item not found',
        requestKey: requestKey.substring(0, 8) + '...'
      });
    }
    
    const enrichedItem = {
      ...item,
      age: Date.now() - item.timestamp,
      originalAge: Date.now() - item.originalTimestamp,
      isExpired: (Date.now() - item.timestamp) > queueConfig.DLQ_TTL_MS,
      canRequeue: item.attempts < queueConfig.RETRY_MAX_ATTEMPTS + 1,
      estimatedRetryDelay: Math.pow(queueConfig.RETRY_BACKOFF_FACTOR, item.attempts) * queueConfig.RETRY_BACKOFF_BASE_MS,
      relatedItems: dlqData.items.filter(relatedItem => 
        relatedItem.domain === item.domain && 
        relatedItem.errorClass === item.errorClass &&
        relatedItem.requestKey !== item.requestKey
      ).length
    };
    
    loggingService.service('QueueAdmin', 'dlq-item-detailed-view', { 
      requestKey: requestKey.substring(0, 8),
      errorClass: item.errorClass,
      domain: item.domain 
    });
    
    res.json({
      success: true,
      data: enrichedItem,
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('DLQ item retrieval failed', { 
      error: error.message,
      requestKey: req.params.requestKey?.substring(0, 8),
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/dlq/:requestKey/requeue', requireAdminAuth, logAdminAction('dlq-item-requeue'), async (req, res) => {
  try {
    const { requestKey } = req.params;
    const { force = false, priority = 'normal' } = req.body;
    
    const dlqData = QueueBuffer.getDeadLetterQueue();
    const item = dlqData.items.find(item => item.requestKey === requestKey);
    
    if (!item) {
      return res.status(404).json({ 
        success: false, 
        error: 'DLQ item not found',
        requestKey: requestKey.substring(0, 8) + '...'
      });
    }
    
    if (!force && item.attempts >= queueConfig.RETRY_MAX_ATTEMPTS + 1) {
      return res.status(400).json({
        success: false,
        error: 'Item has exceeded maximum retry attempts',
        currentAttempts: item.attempts,
        maxAttempts: queueConfig.RETRY_MAX_ATTEMPTS + 1,
        suggestion: 'Use force=true to override this limit'
      });
    }
    
    const result = await QueueBuffer.requeueFromDLQ(requestKey);
    
    loggingService.service('QueueAdmin', 'dlq-item-requeued', { 
      requestKey: requestKey.substring(0, 8),
      errorClass: item.errorClass,
      domain: item.domain,
      attempts: item.attempts,
      forced: force,
      priority,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: {
        ...result,
        item: {
          requestKey: requestKey.substring(0, 8) + '...',
          domain: item.domain,
          errorClass: item.errorClass,
          originalAttempts: item.attempts,
          requeuedAt: Date.now(),
          requeuedBy: req.user.email || req.user.id,
          priority
        }
      },
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('DLQ requeue failed', { 
      error: error.message,
      requestKey: req.params.requestKey?.substring(0, 8),
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/dlq/:requestKey', requireAdminAuth, logAdminAction('dlq-item-delete'), async (req, res) => {
  try {
    const { requestKey } = req.params;
    
    const dlqData = QueueBuffer.getDeadLetterQueue();
    const item = dlqData.items.find(item => item.requestKey === requestKey);
    
    if (!item) {
      return res.status(404).json({ 
        success: false, 
        error: 'DLQ item not found',
        requestKey: requestKey.substring(0, 8) + '...'
      });
    }
    
    const deletedItem = { ...item };
    QueueBuffer.deadLetterQueue.delete(requestKey);
    QueueBuffer.metrics.dlqItems--;
    
    loggingService.service('QueueAdmin', 'dlq-item-deleted', { 
      requestKey: requestKey.substring(0, 8),
      errorClass: deletedItem.errorClass,
      domain: deletedItem.domain,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: {
        message: 'DLQ item deleted successfully',
        deletedItem: {
          requestKey: requestKey.substring(0, 8) + '...',
          domain: deletedItem.domain,
          errorClass: deletedItem.errorClass,
          deletedAt: Date.now(),
          deletedBy: req.user.email || req.user.id
        }
      },
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('DLQ item deletion failed', { 
      error: error.message,
      requestKey: req.params.requestKey?.substring(0, 8),
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/dlq/clear', requireAdminAuth, logAdminAction('dlq-clear-all'), async (req, res) => {
  try {
    const { 
      confirm = false, 
      filters = {},
      dryRun = false 
    } = req.body;
    
    if (!confirm && !dryRun) {
      return res.status(400).json({
        success: false,
        error: 'Clear operation requires explicit confirmation',
        requiredFields: {
          confirm: 'Set to true to proceed with deletion',
          dryRun: 'Set to true to see what would be deleted without actually deleting'
        }
      });
    }
    
    const dlqData = QueueBuffer.getDeadLetterQueue(filters);
    const itemsToDelete = dlqData.items;
    
    if (dryRun) {
      const preview = {
        totalItems: itemsToDelete.length,
        errorClassBreakdown: itemsToDelete.reduce((acc, item) => {
          acc[item.errorClass] = (acc[item.errorClass] || 0) + 1;
          return acc;
        }, {}),
        domainBreakdown: itemsToDelete.reduce((acc, item) => {
          acc[item.domain] = (acc[item.domain] || 0) + 1;
          return acc;
        }, {}),
        oldestItem: itemsToDelete.length > 0 ? Math.max(...itemsToDelete.map(item => Date.now() - item.timestamp)) : 0,
        filters: filters
      };
      
      loggingService.service('QueueAdmin', 'dlq-clear-dry-run', { 
        preview,
        userId: req.user.id
      });
      
      return res.json({
        success: true,
        dryRun: true,
        data: {
          message: 'Dry run completed - no items were deleted',
          preview,
          nextStep: 'Set confirm=true to proceed with actual deletion'
        },
        timestamp: Date.now()
      });
    }
    
    let deletedCount = 0;
    const deletedBreakdown = { errorClass: {}, domain: {} };
    
    for (const item of itemsToDelete) {
      QueueBuffer.deadLetterQueue.delete(item.requestKey);
      deletedCount++;
      
      deletedBreakdown.errorClass[item.errorClass] = (deletedBreakdown.errorClass[item.errorClass] || 0) + 1;
      deletedBreakdown.domain[item.domain] = (deletedBreakdown.domain[item.domain] || 0) + 1;
    }
    
    QueueBuffer.metrics.dlqItems -= deletedCount;
    
    loggingService.service('QueueAdmin', 'dlq-cleared', { 
      deletedCount,
      deletedBreakdown,
      filters,
      userId: req.user.id,
      userEmail: req.user.email
    });
    
    res.json({
      success: true,
      data: {
        message: `Successfully deleted ${deletedCount} items from DLQ`,
        deletedCount,
        breakdown: deletedBreakdown,
        filters: filters,
        clearedAt: Date.now(),
        clearedBy: req.user.email || req.user.id,
        remainingInDLQ: QueueBuffer.deadLetterQueue.size
      },
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('DLQ clear operation failed', { 
      error: error.message,
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dlq/export', requireAdminAuth, logAdminAction('dlq-export'), async (req, res) => {
  try {
    const { format = 'json', filters = {} } = req.query;
    
    const dlqData = QueueBuffer.getDeadLetterQueue(filters);
    
    const exportData = dlqData.items.map(item => ({
      requestKey: item.requestKey,
      timestamp: new Date(item.timestamp).toISOString(),
      originalTimestamp: new Date(item.originalTimestamp).toISOString(),
      attempts: item.attempts,
      errorClass: item.errorClass,
      errorMessage: item.errorMessage,
      domain: item.domain,
      priority: item.priority,
      payloadHash: item.payloadHash,
      ageHours: Math.round((Date.now() - item.timestamp) / (1000 * 60 * 60))
    }));
    
    const filename = `dlq-export-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.json`);
      
      const exportPayload = {
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.email || req.user.id,
        filters: filters,
        totalItems: exportData.length,
        items: exportData
      };
      
      res.send(JSON.stringify(exportPayload, null, 2));
    } else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      
      const headers = Object.keys(exportData[0] || {});
      const csvRows = [headers.join(',')];
      
      for (const row of exportData) {
        const values = headers.map(header => {
          const value = row[header];
          return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
      }
      
      res.send(csvRows.join('\n'));
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid export format',
        supportedFormats: ['json', 'csv']
      });
    }
    
    loggingService.service('QueueAdmin', 'dlq-exported', { 
      format,
      itemCount: exportData.length,
      filters,
      userId: req.user.id
    });
  } catch (error) {
    loggingService.error('DLQ export failed', { 
      error: error.message,
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/dlq/stats', requireAdminAuth, logAdminAction('dlq-stats-accessed'), async (req, res) => {
  try {
    const dlqData = QueueBuffer.getDeadLetterQueue();
    const now = Date.now();
    
    const errorClassStats = dlqData.items.reduce((acc, item) => {
      if (!acc[item.errorClass]) {
        acc[item.errorClass] = {
          count: 0,
          domains: new Set(),
          avgAttempts: 0,
          oldestTimestamp: now,
          newestTimestamp: 0
        };
      }
      
      acc[item.errorClass].count++;
      acc[item.errorClass].domains.add(item.domain);
      acc[item.errorClass].avgAttempts += item.attempts;
      acc[item.errorClass].oldestTimestamp = Math.min(acc[item.errorClass].oldestTimestamp, item.timestamp);
      acc[item.errorClass].newestTimestamp = Math.max(acc[item.errorClass].newestTimestamp, item.timestamp);
      
      return acc;
    }, {});
    
    Object.keys(errorClassStats).forEach(errorClass => {
      const stats = errorClassStats[errorClass];
      stats.avgAttempts = Math.round(stats.avgAttempts / stats.count * 100) / 100;
      stats.uniqueDomains = stats.domains.size;
      stats.domains = Array.from(stats.domains);
      stats.ageRange = {
        oldest: now - stats.oldestTimestamp,
        newest: now - stats.newestTimestamp
      };
    });
    
    const timeRangeStats = {
      last24h: dlqData.items.filter(item => (now - item.timestamp) < 24 * 60 * 60 * 1000).length,
      last7d: dlqData.items.filter(item => (now - item.timestamp) < 7 * 24 * 60 * 60 * 1000).length,
      last30d: dlqData.items.filter(item => (now - item.timestamp) < 30 * 24 * 60 * 60 * 1000).length,
      older: dlqData.items.filter(item => (now - item.timestamp) >= 30 * 24 * 60 * 60 * 1000).length
    };
    
    const topDomains = Object.entries(
      dlqData.items.reduce((acc, item) => {
        acc[item.domain] = (acc[item.domain] || 0) + 1;
        return acc;
      }, {})
    ).sort(([,a], [,b]) => b - a).slice(0, 10);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalItems: dlqData.total,
          uniqueErrorClasses: Object.keys(errorClassStats).length,
          uniqueDomains: new Set(dlqData.items.map(item => item.domain)).size,
          avgAge: dlqData.items.length > 0 ? 
            dlqData.items.reduce((sum, item) => sum + (now - item.timestamp), 0) / dlqData.items.length : 0,
          oldestItem: dlqData.items.length > 0 ? 
            Math.max(...dlqData.items.map(item => now - item.timestamp)) : 0
        },
        errorClassStats,
        timeRangeStats,
        topDomains: topDomains.map(([domain, count]) => ({ domain, count })),
        config: {
          ttlMs: queueConfig.DLQ_TTL_MS,
          maxEntries: queueConfig.DLQ_MAX_ENTRIES,
          purgeIntervalMs: queueConfig.DLQ_PURGE_INTERVAL_MS
        }
      },
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('DLQ stats retrieval failed', { 
      error: error.message,
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/dlq/bulk-requeue', requireAdminAuth, logAdminAction('dlq-bulk-requeue'), async (req, res) => {
  try {
    const { 
      filters = {}, 
      maxItems = 50, 
      dryRun = false,
      force = false 
    } = req.body;
    
    const dlqData = QueueBuffer.getDeadLetterQueue(filters);
    const itemsToRequeue = dlqData.items.slice(0, maxItems);
    
    if (dryRun) {
      const preview = {
        totalItems: itemsToRequeue.length,
        wouldRequeue: itemsToRequeue.filter(item => force || item.attempts < queueConfig.RETRY_MAX_ATTEMPTS + 1).length,
        wouldSkip: itemsToRequeue.filter(item => !force && item.attempts >= queueConfig.RETRY_MAX_ATTEMPTS + 1).length,
        filters
      };
      
      return res.json({
        success: true,
        dryRun: true,
        data: {
          message: 'Dry run completed - no items were requeued',
          preview,
          nextStep: 'Remove dryRun=true to proceed with actual requeue'
        },
        timestamp: Date.now()
      });
    }
    
    const results = {
      requeued: 0,
      skipped: 0,
      errors: []
    };
    
    for (const item of itemsToRequeue) {
      try {
        if (!force && item.attempts >= queueConfig.RETRY_MAX_ATTEMPTS + 1) {
          results.skipped++;
          continue;
        }
        
        await QueueBuffer.requeueFromDLQ(item.requestKey);
        results.requeued++;
      } catch (error) {
        results.errors.push({
          requestKey: item.requestKey.substring(0, 8) + '...',
          error: error.message
        });
      }
    }
    
    loggingService.service('QueueAdmin', 'dlq-bulk-requeued', { 
      results,
      filters,
      maxItems,
      forced: force,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      data: {
        message: `Bulk requeue completed: ${results.requeued} requeued, ${results.skipped} skipped, ${results.errors.length} errors`,
        ...results,
        requeuedAt: Date.now(),
        requeuedBy: req.user.email || req.user.id
      },
      timestamp: Date.now()
    });
  } catch (error) {
    loggingService.error('DLQ bulk requeue failed', { 
      error: error.message,
      userId: req.user?.id 
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;