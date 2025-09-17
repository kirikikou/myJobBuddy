const ScrapingCoordinator = require('./scrapers/ScrapingCoordinator');
const { getCachedData, saveCache } = require('./cacheManager');
const { sessionManager, withSession } = require('./sessionManager');
const config = require('./config');
const parallelConfig = require('./config/parallelization');
const fs = require('fs').promises;
const path = require('path');

const scrapingCoordinator = ScrapingCoordinator.getInstance();

const timingLogs = [];

function logTiming(message, url = null, index = null) {
  const timestamp = new Date().toISOString();
  const timeOnly = timestamp.substr(11, 12);
  const logEntry = {
    timestamp,
    timeOnly,
    message,
    url,
    urlIndex: index,
    epochMs: Date.now()
  };
  
  timingLogs.push(logEntry);
  config.smartLog('timing', `[${timingLogs.length}] ${message}`);
}

async function exportTimingReport(sessionId, results) {
  if (!config.shouldExportTiming()) {
    config.smartLog('timing', 'Timing export skipped (ESSENTIAL mode)');
    return null;
  }
  
  config.smartLog('timing', `🔍 exportTimingReport called: sessionId=${sessionId}, timingLogs=${timingLogs.length}, results=${results.length}`);
  
  if (timingLogs.length === 0) {
    config.smartLog('fail', `⚠️ NO TIMING LOGS TO EXPORT - timingLogs array is empty!`);
    return null;
  }
  
  try {
    await fs.mkdir(config.DEBUG_DIR, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `timing-report-${sessionId}-${timestamp}.json`;
    const filePath = path.join(config.DEBUG_DIR, filename);
    
    const timingReport = {
      sessionId,
      exportedAt: new Date().toISOString(),
      totalLogs: timingLogs.length,
      urlResults: results.map(r => ({
        url: r.url,
        urlIndex: r.urlIndex,
        duration: r.duration,
        success: r.success,
        source: r.source
      })),
      detailedTimingLogs: [...timingLogs],
      parallelismAnalysis: {
        urlStartTimes: timingLogs
          .filter(log => log.message.includes('URL') && log.message.includes('START') && !log.message.includes('SCRAPING'))
          .map(log => ({
            urlIndex: log.urlIndex,
            startTime: log.epochMs,
            timeOnly: log.timeOnly,
            url: log.url
          })),
        urlEndTimes: timingLogs
          .filter(log => log.message.includes('URL') && log.message.includes('TOTAL END'))
          .map(log => ({
            urlIndex: log.urlIndex,
            endTime: log.epochMs,
            timeOnly: log.timeOnly,
            url: log.url
          }))
      }
    };
    
    const startTimes = timingReport.parallelismAnalysis.urlStartTimes;
    if (startTimes.length >= 2) {
      const timeDiffs = [];
      for (let i = 1; i < startTimes.length; i++) {
        const diff = startTimes[i].startTime - startTimes[0].startTime;
        timeDiffs.push(diff);
      }
      
      timingReport.parallelismAnalysis.startTimeDifferences = timeDiffs;
      timingReport.parallelismAnalysis.maxStartTimeDiff = Math.max(...timeDiffs);
      timingReport.parallelismAnalysis.isParallel = Math.max(...timeDiffs) < 1000;
      timingReport.parallelismAnalysis.verdict = Math.max(...timeDiffs) < 1000 ? 
        "PARALLEL - URLs started within 1 second" : 
        "SEQUENTIAL - URLs started with significant delay";
    }
    
    await fs.writeFile(filePath, JSON.stringify(timingReport, null, 2));
    
    config.smartLog('parallel', `✅ TIMING REPORT EXPORTED: ${filePath}`);
    config.smartLog('timing', `📊 Total logs: ${timingLogs.length}, Start times: ${startTimes.length}`);
    
    timingLogs.length = 0;
    
    return filePath;
  } catch (error) {
    config.smartLog('fail', `❌ Failed to export timing report: ${error.message}`);
    config.smartLog('fail', error.stack);
    return null;
  }
}

async function ensureDebugDirectoryExists() {
  try {
    await fs.mkdir(config.DEBUG_DIR, { recursive: true });
    const testFile = path.join(config.DEBUG_DIR, '.test');
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    config.smartLog('timing', `✅ Debug directory verified: ${config.DEBUG_DIR}`);
    return true;
  } catch (error) {
    config.smartLog('fail', `❌ Debug directory error: ${error.message}`);
    return false;
  }
}

function calculateOptimalBatching(urls) {
  const totalUrls = urls.length;
  const maxParallel = parallelConfig.MAX_PARALLEL;
  const maxBatchSize = parallelConfig.BATCH_CALCULATION.MAX_BATCH_SIZE;
  const minBatchSize = parallelConfig.BATCH_CALCULATION.MIN_BATCH_SIZE;
  
  if (totalUrls <= maxParallel) {
    return { batchSize: totalUrls, batchCount: 1 };
  }
  
  const optimalBatchSize = Math.min(maxBatchSize, Math.max(minBatchSize, maxParallel));
  const batchCount = Math.ceil(totalUrls / optimalBatchSize);
  
  config.smartLog('buffer', `Calculated batching: ${batchCount} batches of ~${optimalBatchSize} URLs each`);
  
  return { batchSize: optimalBatchSize, batchCount };
}

function createBatches(urls, batchSize) {
  const batches = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push(urls.slice(i, i + batchSize));
  }
  return batches;
}

async function processBatch(batch, sessionId, options, logger, batchIndex, totalBatches, onPartialResult = null) {
  const batchStartTime = config.logBatchStart(batchIndex, totalBatches, batch.length);
  
  logTiming(`🚀 BATCH ${batchIndex + 1} STARTING - URLs: ${batch.length}`);
  
  const batchPromises = batch.map(async (url, index) => {
    const urlStartTime = Date.now();
    const globalIndex = batchIndex * batch.length + index + 1;
    
    logTiming(`🚀 URL${globalIndex} START`, url, globalIndex);
    
    try {
      let result = null;
      let source = 'fresh';
      
      if (options.useCache !== false) {
        result = await getCachedData(url, { fallbackOnError: true });
        if (result) {
          logger.logCacheHit(url);
          source = 'cache';
          const duration = Date.now() - urlStartTime;
          logTiming(`✅ URL${globalIndex} END (CACHE) - Duration: ${duration}ms`, url, globalIndex);
        } else {
          logger.logCacheMiss(url);
        }
      }
      
      if (!result) {
        const scrapingStartTime = Date.now();
        logTiming(`🔥 URL${globalIndex} SCRAPING START`, url, globalIndex);
        
        result = await scrapingCoordinator.coordinatedScrape(url, sessionId, options, options.userId);
        source = result ? result.source || 'fresh' : 'error';
        
        const scrapingDuration = Date.now() - scrapingStartTime;
        logTiming(`🏁 URL${globalIndex} SCRAPING END - Duration: ${scrapingDuration}ms`, url, globalIndex);
        
        if (result && result.data && options.saveCache !== false) {
          const saveSuccess = await saveCache(url, result.data);
          if (saveSuccess) {
            config.smartLog('cache', `Result cached for ${url}`);
          } else {
            config.smartLog('fail', `Cache save failed for ${url}`);
          }
        }
      }
      
      if (result && result.data) {
        const duration = Date.now() - urlStartTime;
        const jobCount = result.data.links ? result.data.links.filter(link => link.isJobPosting).length : 0;
        const totalLinks = result.data.links ? result.data.links.length : 0;
        
        logTiming(`✅ URL${globalIndex} TOTAL END - Duration: ${duration}ms`, url, globalIndex);
        
        logger.logScrapingComplete(url, totalLinks, duration);
        logger.logJobsFound(url, jobCount, totalLinks);
        
        const urlResult = {
          url,
          source,
          duration,
          success: true,
          result: result.data,
          urlIndex: globalIndex
        };
        
        if (onPartialResult && typeof onPartialResult === 'function') {
          try {
            onPartialResult({
              url,
              status: source === 'cache' ? 'from-cache' : 'scraped',
              source,
              success: true,
              result: result.data,
              duration,
              timestamp: Date.now()
            });
          } catch (callbackError) {
            config.smartLog('fail', `onPartialResult callback error: ${callbackError.message}`);
          }
        }
        
        return urlResult;
      } else {
        const duration = Date.now() - urlStartTime;
        logTiming(`❌ URL${globalIndex} FAILED END - Duration: ${duration}ms`, url, globalIndex);
        
        logger.logScrapingFailed(url, 'No result returned from scraping');
        
        const urlResult = {
          url,
          source: 'error',
          duration,
          success: false,
          error: 'No result returned',
          urlIndex: globalIndex
        };
        
        if (onPartialResult && typeof onPartialResult === 'function') {
          try {
            onPartialResult({
              url,
              status: 'failed',
              source: 'error',
              success: false,
              error: 'No result returned',
              duration,
              timestamp: Date.now()
            });
          } catch (callbackError) {
            config.smartLog('fail', `onPartialResult callback error: ${callbackError.message}`);
          }
        }
        
        return urlResult;
      }
    } catch (error) {
      const duration = Date.now() - urlStartTime;
      logTiming(`💥 URL${globalIndex} ERROR END - Duration: ${duration}ms - Error: ${error.message}`, url, globalIndex);
      
      logger.logError(url, `Error processing URL: ${error.message}`, error);
      
      const urlResult = {
        url,
        source: 'error',
        duration,
        success: false,
        error: error.message,
        urlIndex: globalIndex
      };
      
      if (onPartialResult && typeof onPartialResult === 'function') {
        try {
          onPartialResult({
            url,
            status: 'error',
            source: 'error',
            success: false,
            error: error.message,
            duration,
            timestamp: Date.now()
          });
        } catch (callbackError) {
          config.smartLog('fail', `onPartialResult callback error: ${callbackError.message}`);
        }
      }
      
      return urlResult;
    }
  });
  
  logTiming(`⏳ BATCH ${batchIndex + 1} - All ${batch.length} promises created, waiting for Promise.allSettled...`);
  
  const batchResults = await Promise.allSettled(batchPromises);
  
  const batchDuration = Date.now() - batchStartTime;
  logTiming(`🏁 BATCH ${batchIndex + 1} COMPLETE - Duration: ${batchDuration}ms`);
  
  const processedResults = batchResults.map(result => 
    result.status === 'fulfilled' ? result.value : {
      url: 'unknown',
      source: 'error',
      duration: 0,
      success: false,
      error: result.reason?.message || 'Promise rejected'
    }
  );
  
  const successCount = processedResults.filter(r => r.success).length;
  const failureCount = processedResults.filter(r => !r.success).length;
  
  config.logBatchEnd(batchIndex, totalBatches, batch.length, batchStartTime, successCount, failureCount);
  
  return processedResults;
}

async function scrapeMultipleCareerPages(userId, userEmail, searchQuery, urls, options = {}, req = null, onPartialResult = null) {
  const sessionId = await sessionManager.startSession(userId, userEmail, searchQuery, urls, req);
  const logger = withSession(sessionId);
  
  await ensureDebugDirectoryExists();
  
  timingLogs.length = 0;
  logTiming(`🎬 SCRAPING SESSION START - ${urls.length} URLs`);
  
  config.smartLog('buffer', `Starting parallel scraping for ${urls.length} URLs`);
  logger.logProgress(null, `Starting batch scraping for ${urls.length} URLs`);
  logger.logUserAction('start_batch_scraping', { searchQuery, urlCount: urls.length });
  
  options.userId = userId;
  
  const results = [];
  
  try {
    const { batchSize, batchCount } = calculateOptimalBatching(urls);
    const batches = createBatches(urls, batchSize);
    
    const estimatedSequentialTime = urls.length * 3000;
    config.logParallelStart(urls.length, batchCount, estimatedSequentialTime);
    
    let globalProcessedCount = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      logger.logProgress(null, `Processing batch ${batchIndex + 1}/${batchCount} (${batch.length} URLs)`);
      
      const batchResults = await processBatch(batch, sessionId, options, logger, batchIndex, batchCount, onPartialResult);
      results.push(...batchResults);
      
      globalProcessedCount += batch.length;
      logger.logProgress(null, `Progress: ${globalProcessedCount}/${urls.length} URLs processed`);
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    logTiming(`🎬 SCRAPING SESSION END - Success: ${successCount}, Failed: ${failureCount}`);
    
    let performanceReport = null;
    let reportPath = null;
    let diagnosticPath = null;
    let timingPath = null;
    
    try {
      config.smartLog('timing', `📊 Starting report generation with ${timingLogs.length} timing logs`);
      
      performanceReport = config.logParallelEnd(successCount, failureCount);
      const effectiveness = config.isParallelWorkingEffectively();
      
      timingPath = await exportTimingReport(sessionId, results);
      reportPath = await exportParallelReport(sessionId, performanceReport, results);
      diagnosticPath = await createParallelDiagnosticReport(urls, results, sessionId);
      
      if (config.shouldExportTiming()) {
        config.smartLog('parallel', `✅ ALL REPORTS EXPORTED:`);
        config.smartLog('parallel', `  - Timing: ${timingPath}`);
        config.smartLog('parallel', `  - Performance: ${reportPath}`);
        config.smartLog('parallel', `  - Diagnostic: ${diagnosticPath}`);
      } else {
        config.smartLog('parallel', `✅ REPORTS GENERATION SKIPPED (ESSENTIAL mode)`);
      }
      
    } catch (metricsError) {
      config.smartLog('fail', `Performance metrics error: ${metricsError.message}`);
      config.smartLog('fail', metricsError.stack);
      
      timingPath = await exportTimingReport(sessionId, results);
      reportPath = await exportParallelReport(sessionId, null, results);
      diagnosticPath = await createParallelDiagnosticReport(urls, results, sessionId);
    }
    
    config.smartLog('win', `Parallel scraping completed: ${successCount} successful, ${failureCount} failed`);
    logger.logProgress(null, `Batch completed: ${successCount} successful, ${failureCount} failed`);
    logger.logUserAction('complete_batch_scraping', { 
      successCount, 
      failureCount, 
      totalUrls: urls.length,
      parallelSpeedup: performanceReport?.speedupRatio || 0,
      isParallelEffective: performanceReport?.speedupRatio > 2.0 || false,
      reportPath,
      timingPath,
      diagnosticPath
    });
    
    await sessionManager.endSession(sessionId, 'completed');
    
    return {
      sessionId,
      success: true,
      totalUrls: urls.length,
      successCount,
      failureCount,
      results,
      reportPath,
      timingPath,
      diagnosticPath,
      parallelSpeedup: performanceReport?.speedupRatio || 0
    };
    
  } catch (error) {
    config.smartLog('fail', `Parallel scraping failed: ${error.message}`);
    logger.logError(null, `Batch scraping failed: ${error.message}`, error);
    logger.logUserAction('error_batch_scraping', { error: error.message });
    await sessionManager.endSession(sessionId, 'failed');
    
    let errorReportPath = null;
    let errorDiagnosticPath = null;
    let errorTimingPath = null;
    
    try {
      errorTimingPath = await exportTimingReport(sessionId, results);
      
      const partialReport = config.getParallelPerformanceReport();
      if (partialReport.status === 'success') {
        errorReportPath = await exportParallelReport(sessionId, partialReport, results);
      } else {
        errorReportPath = await exportParallelReport(sessionId, null, results);
      }
      errorDiagnosticPath = await createParallelDiagnosticReport(urls, results, sessionId);
    } catch (reportError) {
      config.smartLog('fail', `Failed to export error report: ${reportError.message}`);
    }
    
    return {
      sessionId,
      success: false,
      error: error.message,
      results,
      errorReportPath,
      errorDiagnosticPath,
      errorTimingPath
    };
  }
}

async function scrapeCareerPageWithSession(url, sessionId, options = {}) {
  return await scrapingCoordinator.executeScraping(url, sessionId, options);
}

async function scrapeCareerPage(url, options = {}) {
  const userId = options.userId || 'anonymous';
  const userEmail = options.userEmail || null;
  const useExistingSlot = options.requesterId || options.sessionId;
  
  const sessionId = useExistingSlot || await sessionManager.startSession(userId, userEmail, `Single URL: ${url}`, [url]);
  
  try {
    let result = null;
    
    if (options.useCache !== false && !options.skipCache) {
      result = await getCachedData(url, { fallbackOnError: true });
      if (result) {
        config.smartLog('cache', `Using cached data for ${url}`);
        if (!useExistingSlot) {
          await sessionManager.endSession(sessionId, 'completed');
        }
        return { 
          success: true,
          method: 'cache',
          wasHeadless: false,
          platform: result.detectedPlatform,
          error: null,
          data: result
        };
      } else {
        config.smartLog('cache', `No valid cache found for ${url}, proceeding with scrape`);
      }
    }
    
    let scrapingResult = null;
    
    if (options.skipCoordination || useExistingSlot) {
      config.smartLog('steps', `Direct scraping ${useExistingSlot ? 'with existing slot' : 'without coordination'} for ${url}`);
      const data = await scrapingCoordinator.executeScraping(url, sessionId, options);
      
      scrapingResult = {
        success: !!data,
        data: data,
        error: data ? null : 'Scraping failed'
      };
    } else {
      scrapingResult = await scrapingCoordinator.coordinatedScrape(url, sessionId, options, userId);
    }
    
    if (scrapingResult && scrapingResult.success && scrapingResult.data && options.saveCache !== false) {
      const saveSuccess = await saveCache(url, scrapingResult.data);
      if (!saveSuccess) {
        config.smartLog('fail', `Failed to save cache for ${url}`);
      }
    }
    
    if (!useExistingSlot) {
      await sessionManager.endSession(sessionId, 'completed');
    }
    
    if (scrapingResult && scrapingResult.success) {
      return {
        success: true,
        method: scrapingResult.data?.method || 'coordinator',
        wasHeadless: scrapingResult.data?.wasHeadless || false,
        platform: scrapingResult.data?.detectedPlatform || scrapingResult.data?.platform,
        error: null,
        data: scrapingResult.data
      };
    } else {
      return {
        success: false,
        method: 'all_failed',
        wasHeadless: false,
        platform: null,
        error: scrapingResult?.error || 'All scraping methods failed',
        data: null
      };
    }
  } catch (error) {
    if (!useExistingSlot) {
      await sessionManager.endSession(sessionId, 'failed');
    }
    return {
      success: false,
      method: 'error',
      wasHeadless: false,
      platform: null,
      error: error.message,
      data: null
    };
  }
}

async function closeBrowsers() {
  try {
    sessionManager.forceEndAllSessions('browser_shutdown');
    await scrapingCoordinator.close();
  } catch (error) {
    config.smartLog('fail', `Error closing browsers: ${error.message}`);
  }
}

function detectJobPlatform(url) {
  return scrapingCoordinator.detectJobPlatform(url);
}

function hasJobContent(text) {
  return scrapingCoordinator.hasJobContent(text);
}

function getParallelPerformanceReport() {
  return config.getParallelPerformanceReport();
}

function clearPerformanceMetrics() {
  config.clearPerformanceMetrics();
}

async function exportParallelReport(sessionId, performanceReport, results) {
  if (!config.shouldExportParallelReport()) {
    config.smartLog('parallel', 'Parallel report export skipped (ESSENTIAL mode)');
    return null;
  }
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `parallel-report-${sessionId}-${timestamp}.json`;
    const filePath = path.join(config.DEBUG_DIR, filename);
    
    await fs.mkdir(config.DEBUG_DIR, { recursive: true });
    
    const detailedReport = {
      sessionId,
      timestamp: new Date().toISOString(),
      parallelConfig: {
        maxParallel: parallelConfig.MAX_PARALLEL,
        maxBatchSize: parallelConfig.BATCH_CALCULATION.MAX_BATCH_SIZE,
        preset: parallelConfig.SYSTEM_INFO?.PRESET || 'UNKNOWN',
        totalCores: parallelConfig.SYSTEM_INFO?.TOTAL_CORES || 'UNKNOWN',
        calculatedScrapers: parallelConfig.SYSTEM_INFO?.CALCULATED_SCRAPERS || 'UNKNOWN'
      },
      performanceMetrics: performanceReport || { status: 'no_data', error: 'Performance metrics not available' },
      urlResults: results.map(result => ({
        url: result.url,
        success: result.success,
        source: result.source,
        duration: result.duration,
        error: result.error || null
      })),
      summary: {
        totalUrls: results.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length,
        cacheHits: results.filter(r => r.source === 'cache').length,
        freshScrapes: results.filter(r => r.source === 'fresh').length,
        avgTimePerUrl: Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length),
        parallelEfficiency: performanceReport?.efficiency || 0,
        speedupRatio: performanceReport?.speedupRatio || 0,
        isParallelEffective: performanceReport?.speedupRatio > 2.0 || false,
        recommendation: performanceReport?.speedupRatio > 2.0 ? 
          'Parallel processing is working effectively' : 
          'Consider adjusting batch size or checking for bottlenecks'
      },
      batchDetails: config._performanceMetrics?.batchTimings?.map(batch => ({
        batchIndex: batch.batchIndex + 1,
        batchSize: batch.batchSize,
        duration: batch.duration,
        successCount: batch.successCount,
        failureCount: batch.failureCount,
        avgTimePerUrl: batch.avgTimePerUrl,
        successRate: Math.round((batch.successCount / batch.batchSize) * 100)
      })) || [],
      diagnostics: {
        reportGenerated: true,
        performanceReportStatus: performanceReport ? 'available' : 'missing',
        batchTimingsCount: config._performanceMetrics?.batchTimings?.length || 0,
        configLoaded: !!parallelConfig,
        debugDirExists: true,
        generatedAt: new Date().toISOString()
      }
    };
    
    await fs.writeFile(filePath, JSON.stringify(detailedReport, null, 2));
    
    config.smartLog('parallel', `📄 REPORT EXPORTED: ${filePath}`);
    if (performanceReport?.speedupRatio) {
      config.smartLog('timing', `🎯 PARALLEL ANALYSIS: ${detailedReport.summary.speedupRatio.toFixed(1)}x speedup, ${detailedReport.summary.parallelEfficiency}% efficiency`);
    }
    
    return filePath;
  } catch (error) {
    config.smartLog('fail', `Failed to export parallel report: ${error.message}`);
    
    try {
      const errorFilename = `parallel-error-${sessionId}-${Date.now()}.json`;
      const errorFilePath = path.join(config.DEBUG_DIR, errorFilename);
      const errorReport = {
        error: error.message,
        stack: error.stack,
        sessionId,
        timestamp: new Date().toISOString(),
        attemptedExport: true,
        debugDir: config.DEBUG_DIR,
        resultsCount: results?.length || 0
      };
      await fs.writeFile(errorFilePath, JSON.stringify(errorReport, null, 2));
      config.smartLog('fail', `Error report saved: ${errorFilePath}`);
      return errorFilePath;
    } catch (secondError) {
      config.smartLog('fail', `Failed to save error report: ${secondError.message}`);
      return null;
    }
  }
}

async function createParallelDiagnosticReport(urls, results, sessionId) {
  if (!config.shouldExportDiagnostic()) {
    config.smartLog('parallel', 'Diagnostic export skipped (ESSENTIAL mode)');
    return null;
  }
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `parallel-diagnostic-${sessionId}-${timestamp}.json`;
    const filePath = path.join(config.DEBUG_DIR, filename);
    
    const diagnostic = {
      sessionId,
      timestamp: new Date().toISOString(),
      testInfo: {
        urlCount: urls.length,
        urls: urls,
        resultsCount: results.length,
        testType: 'parallel_scraping_diagnostic'
      },
      parallelizationConfig: {
        local: {
          maxParallel: parallelConfig.MAX_PARALLEL,
          batchSize: parallelConfig.BATCH_CALCULATION.MAX_BATCH_SIZE,
          preset: parallelConfig.SYSTEM_INFO?.PRESET
        }
      },
      timingAnalysis: {
        totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
        avgTimePerUrl: Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length),
        sequentialEstimate: results.length * 3000,
        actualVsSequential: `${Math.round(results.reduce((sum, r) => sum + r.duration, 0) / 1000)}s vs ${Math.round(results.length * 3)}s estimated`,
        isParallelLikelyWorking: results.reduce((sum, r) => sum + r.duration, 0) < (results.length * 3000 * 0.7)
      },
      resultBreakdown: {
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        cached: results.filter(r => r.source === 'cache').length,
        fresh: results.filter(r => r.source === 'fresh').length
      },
      urlDetails: results.map((result, index) => ({
        index: index + 1,
        url: result.url,
        success: result.success,
        source: result.source,
        duration: result.duration,
        error: result.error
      })),
      conclusion: {
        parallelismDetected: results.reduce((sum, r) => sum + r.duration, 0) < (results.length * 3000 * 0.7),
        recommendation: results.reduce((sum, r) => sum + r.duration, 0) < (results.length * 3000 * 0.7) ? 
          'Parallelism appears to be working - URLs processed faster than sequential estimate' :
          'Parallelism may not be working - processing time similar to sequential estimate'
      }
    };
    
    await fs.mkdir(config.DEBUG_DIR, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(diagnostic, null, 2));
    
    config.smartLog('parallel', `🔍 DIAGNOSTIC EXPORTED: ${filePath}`);
    return filePath;
  } catch (error) {
    config.smartLog('fail', `Failed to create diagnostic report: ${error.message}`);
    return null;
  }
}

module.exports = {
  scrapeCareerPage,
  scrapeMultipleCareerPages,
  scrapeCareerPageWithSession,
  closeBrowsers,
  detectJobPlatform,
  hasJobContent,
  getParallelPerformanceReport,
  clearPerformanceMetrics,
  exportParallelReport,
  createParallelDiagnosticReport,
  exportTimingReport
};