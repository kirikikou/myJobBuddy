const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const MonitoringService = require('../../monitoring/MonitoringService');
const scrapingMetrics = require('../../scrapers/scrapingMetricsService');
const { filterJobResults, shouldExcludeResult, calculateSimilarityScore } = require('../../dictionaries/resultsExclusion');
const { getCachedData } = require('../../cacheManager');
const { createBaseLayout, createBreadcrumb } = require('./utils/htmlTemplates');
const { formatDate, formatDuration, formatPercentage, getComplexityBadge, formatLanguageBadge, createUrlPreview, calculateResourceUsage } = require('./utils/formatters');
const { validateStatisticsRequest, validateDomainName } = require('./utils/validators');
const statsTemplates = require('./templates/statsTemplates');
const dictionaries = require('../../dictionaries');

const router = express.Router();

const EXPORT_CONFIG = {
  MAX_DOMAINS: 100,
  MAX_JOB_TITLES: 50,
  MAX_LINKS_PER_DOMAIN: 200,
  MAX_ERROR_ENTRIES: 500,
  DEFAULT_DOMAIN_LIMIT: 20,
  DEFAULT_JOB_TITLE_LIMIT: 15,
  DEFAULT_LINK_LIMIT: 10
};

const loggingService = require('../../services/LoggingService');
function cleanDomainName(domain) {
  if (!domain) return '';
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
    .trim();
}

function cleanUrlForAnalysis(url) {
  if (!url) return '';
  return url
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim();
}

const calculateRelevanceScore = (link, domain) => {
  if (!link || !link.text) return 0;
  
  let score = 0;
  const text = (link.text || '').toLowerCase();
  const url = (link.url || '').toLowerCase();
  
  try {
    const jobTerms = dictionaries.jobTerms || [];
    const jobTitleMappings = dictionaries.jobTitleMappings || {};
    
    if (link.isJobPosting === true) score += 40;
    if (link.linkType === 'job') score += 30;
    
    jobTerms.forEach(term => {
      if (text.includes(term.toLowerCase())) score += 20;
      if (url.includes(term.toLowerCase())) score += 15;
    });
    
    if (link.text && link.text.length > 0) {
      try {
        const titleVariants = dictionaries.generateJobTitleVariants(link.text);
        if (titleVariants && titleVariants.length > 1) {
          score += 10;
        }
      } catch (e) {}
    }
    
    if (jobTitleMappings.positions) {
      Object.keys(jobTitleMappings.positions).forEach(position => {
        if (text.includes(position.toLowerCase())) score += 15;
      });
    }
    
    if (jobTitleMappings.technical) {
      Object.keys(jobTitleMappings.technical).forEach(tech => {
        if (text.includes(tech.toLowerCase())) score += 12;
      });
    }
    
    if (jobTitleMappings.seniority) {
      Object.keys(jobTitleMappings.seniority).forEach(level => {
        if (text.includes(level.toLowerCase())) score += 8;
      });
    }
    
    if (text.length > 10 && text.length < 150) score += 10;
    
    if (url.includes('job') || url.includes('career') || url.includes('emploi') || 
        url.includes('vacancy') || url.includes('position') || url.includes('opportunity')) {
      score += 20;
    }
    
    if (domain && url.includes(domain.toLowerCase())) score += 15;
    
    const hasNumbers = /\d/.test(text);
    if (hasNumbers && text.length < 50) score += 5;
    
    const actionWords = ['apply', 'join', 'hiring', 'recruitment', 'postuler', 'rejoindre', 'candidature'];
    actionWords.forEach(word => {
      if (text.includes(word.toLowerCase())) score += 8;
    });
    
  } catch (error) {
    const fallbackJobKeywords = [
      'job', 'career', 'emploi', 'poste', 'position', 'opportunity', 'role', 'work',
      'recruitment', 'hiring', 'vacancies', 'vacancy', 'opening', 'apply',
      'engineer', 'developer', 'manager', 'analyst', 'specialist', 'director',
      'senior', 'junior', 'lead', 'coordinator', 'consultant', 'executive'
    ];
    
    if (link.isJobPosting === true) score += 40;
    if (link.linkType === 'job') score += 30;
    
    fallbackJobKeywords.forEach(keyword => {
      if (text.includes(keyword)) score += 15;
      if (url.includes(keyword)) score += 10;
    });
    
    if (text.length > 10 && text.length < 150) score += 10;
    if (url.includes('job') || url.includes('career') || url.includes('emploi')) score += 20;
    if (domain && url.includes(domain)) score += 15;
  }
  
  return Math.min(score, 100);
};

const getScrapedLinksForDomain = async (domain) => {
  try {
    const files = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const domainLinks = [];
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(config.CACHE_DIR, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        if (parsedData.data && parsedData.data.url && parsedData.data.url.includes(domain)) {
          const links = parsedData.data.links || [];
          
          links.forEach(link => {
            const relevanceScore = calculateRelevanceScore(link, domain);
            
            if (relevanceScore > 5) {
              domainLinks.push({
                title: link.text || 'No title',
                url: link.url,
                relevanceScore: relevanceScore,
                linkType: link.linkType || 'general',
                isJobPosting: link.isJobPosting || false,
                scrapedAt: parsedData.timestamp || parsedData.data.scrapedAt,
                sourceUrl: parsedData.data.url
              });
            }
          });
        }
      } catch (error) {
        continue;
      }
    }
    
    return domainLinks.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  } catch (error) {
    loggingService.error('Error retrieving scraped links:',{ error: error });
    return [];
  }
};

async function getAllScrapedData() {
  try {
    const files = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const allData = [];
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(config.CACHE_DIR, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        if (parsedData.data && parsedData.data.url) {
          allData.push({
            domain: cleanUrlForAnalysis(parsedData.data.url),
            originalUrl: parsedData.data.url,
            links: parsedData.data.links || [],
            scrapedAt: parsedData.timestamp || parsedData.data.scrapedAt,
            jobTitles: parsedData.data.jobTitles || [],
            step: parsedData.data.step || 'unknown',
            success: parsedData.data.success || false,
            executionTime: parsedData.data.executionTime || 0
          });
        }
      } catch (error) {
        continue;
      }
    }
    
    return allData;
  } catch (error) {
    loggingService.error('Error retrieving scraped data:',{ error: error });
    return [];
  }
}

function calculateDomainLinkMetrics(domainData) {
  const metrics = {
    totalLinks: 0,
    jobLinks: 0,
    excludedLinks: 0,
    avgRelevanceScore: 0,
    topLinkTitles: [],
    linkTypes: {}
  };
  
  const relevanceScores = [];
  const linkTitleCount = {};
  
  domainData.forEach(data => {
    data.links.forEach(link => {
      metrics.totalLinks++;
      
      if (shouldExcludeResult(link.text, link.url)) {
        metrics.excludedLinks++;
        return;
      }
      
      if (link.isJobPosting || link.linkType === 'job') {
        metrics.jobLinks++;
      }
      
      const relevanceScore = calculateSimilarityScore(data.jobTitles?.join(' ') || '', link.text || '');
      relevanceScores.push(relevanceScore);
      
      const linkType = link.linkType || 'general';
      metrics.linkTypes[linkType] = (metrics.linkTypes[linkType] || 0) + 1;
      
      const linkTitle = (link.text || '').toLowerCase().trim();
      if (linkTitle && linkTitle.length > 0 && linkTitle.length < 100) {
        linkTitleCount[linkTitle] = (linkTitleCount[linkTitle] || 0) + 1;
      }
    });
  });
  
  metrics.avgRelevanceScore = relevanceScores.length > 0 
    ? (relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length).toFixed(2)
    : 0;
  
  metrics.topLinkTitles = Object.entries(linkTitleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([title, count]) => ({ title, count }));
  
  return metrics;
}

async function generateDomainSynthesis(limit = EXPORT_CONFIG.DEFAULT_DOMAIN_LIMIT) {
  const allData = await getAllScrapedData();
  const domainMap = new Map();
  
  allData.forEach(data => {
    const domain = data.domain;
    if (!domainMap.has(domain)) {
      domainMap.set(domain, []);
    }
    domainMap.get(domain).push(data);
  });
  
  const domainStats = [];
  
  domainMap.forEach((data, domain) => {
    const linkMetrics = calculateDomainLinkMetrics(data);
    const totalRequests = data.length;
    const successfulRequests = data.filter(d => d.success).length;
    const avgExecutionTime = data.reduce((sum, d) => sum + (d.executionTime || 0), 0) / data.length;
    
    const jobTitleCounts = {};
    data.forEach(d => {
      (d.jobTitles || []).forEach(title => {
        const cleanTitle = title.toLowerCase().trim();
        jobTitleCounts[cleanTitle] = (jobTitleCounts[cleanTitle] || 0) + 1;
      });
    });
    
    domainStats.push({
      domain: cleanDomainName(domain),
      originalDomain: domain,
      totalRequests,
      successfulRequests,
      successRate: ((successfulRequests / totalRequests) * 100).toFixed(1),
      avgExecutionTime: (avgExecutionTime / 1000).toFixed(2),
      totalLinks: linkMetrics.totalLinks,
      jobLinks: linkMetrics.jobLinks,
      jobLinkRatio: linkMetrics.totalLinks > 0 
        ? ((linkMetrics.jobLinks / linkMetrics.totalLinks) * 100).toFixed(1)
        : 0,
      avgRelevanceScore: linkMetrics.avgRelevanceScore,
      topJobTitles: Object.entries(jobTitleCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, count]) => ({ title, count })),
      topLinkTitles: linkMetrics.topLinkTitles.slice(0, 5),
      linkTypes: linkMetrics.linkTypes,
      lastScraped: Math.max(...data.map(d => new Date(d.scrapedAt).getTime())),
      firstScraped: Math.min(...data.map(d => new Date(d.scrapedAt).getTime()))
    });
  });
  
  return domainStats
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, Math.min(limit, EXPORT_CONFIG.MAX_DOMAINS));
}

async function generateJobTitleSynthesis(limit = EXPORT_CONFIG.DEFAULT_JOB_TITLE_LIMIT) {
  const allData = await getAllScrapedData();
  const jobTitleMap = new Map();
  
  allData.forEach(data => {
    (data.jobTitles || []).forEach(title => {
      const cleanTitle = title.toLowerCase().trim();
      if (cleanTitle && cleanTitle.length > 0) {
        if (!jobTitleMap.has(cleanTitle)) {
          jobTitleMap.set(cleanTitle, {
            title: cleanTitle,
            count: 0,
            domains: new Set(),
            variations: new Set([title])
          });
        }
        const entry = jobTitleMap.get(cleanTitle);
        entry.count++;
        entry.domains.add(cleanDomainName(data.domain));
        entry.variations.add(title);
      }
    });
  });
  
  return Array.from(jobTitleMap.values())
    .map(entry => ({
      title: entry.title,
      count: entry.count,
      domainsCount: entry.domains.size,
      domains: Array.from(entry.domains).slice(0, 10),
      variations: Array.from(entry.variations).slice(0, 5),
      percentage: ((entry.count / allData.length) * 100).toFixed(2)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.min(limit, EXPORT_CONFIG.MAX_JOB_TITLES));
}

async function generateLinkTitleSynthesis(limit = EXPORT_CONFIG.DEFAULT_LINK_LIMIT) {
  const allData = await getAllScrapedData();
  const linkTitleMap = new Map();
  
  allData.forEach(data => {
    data.links.forEach(link => {
      const linkTitle = (link.text || '').toLowerCase().trim();
      if (linkTitle && linkTitle.length > 0 && linkTitle.length < 150) {
        if (!shouldExcludeResult(link.text, link.url)) {
          if (!linkTitleMap.has(linkTitle)) {
            linkTitleMap.set(linkTitle, {
              title: linkTitle,
              count: 0,
              domains: new Set(),
              isJobPosting: link.isJobPosting || false,
              linkType: link.linkType || 'general'
            });
          }
          const entry = linkTitleMap.get(linkTitle);
          entry.count++;
          entry.domains.add(cleanDomainName(data.domain));
        }
      }
    });
  });
  
  return Array.from(linkTitleMap.values())
    .map(entry => ({
      title: entry.title,
      count: entry.count,
      domainsCount: entry.domains.size,
      domains: Array.from(entry.domains).slice(0, 5),
      isJobPosting: entry.isJobPosting,
      linkType: entry.linkType
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.min(limit, EXPORT_CONFIG.MAX_LINKS_PER_DOMAIN));
}

async function generateErrorSynthesis(limit = EXPORT_CONFIG.DEFAULT_DOMAIN_LIMIT) {
  const rawStats = await scrapingMetrics.getStepStats();
  
  const excludedErrorTypes = [
    'StepNotApplicable',
    'NoResult', 
    'StepSkipped',
    'PlatformNotDetected',
    'NoJobsFound',
    'NotApplicable',
    'SkippedStep'
  ];
  
  const criticalErrors = rawStats.domains
    .map(domain => {
      const realErrors = Object.entries(domain.errorsByType || {})
        .filter(([type]) => !excludedErrorTypes.includes(type))
        .reduce((sum, [, count]) => sum + count, 0);
      
      return {
        domain: cleanDomainName(domain.domain),
        originalDomain: domain.domain,
        realErrors,
        totalAttempts: domain.totalRealAttempts || 0,
        errorRate: domain.totalRealAttempts > 0 
          ? ((realErrors / domain.totalRealAttempts) * 100).toFixed(1)
          : 0,
        errorTypes: Object.entries(domain.errorsByType || {})
          .filter(([type]) => !excludedErrorTypes.includes(type))
          .reduce((obj, [type, count]) => {
            obj[type] = count;
            return obj;
          }, {}),
        lastError: domain.lastErrorAt || null,
        complexityScore: domain.complexityScore || 0,
        step: domain.lastSuccessfulStep || 'none'
      };
    })
    .filter(domain => domain.realErrors > 0)
    .sort((a, b) => b.realErrors - a.realErrors)
    .slice(0, Math.min(limit, EXPORT_CONFIG.MAX_ERROR_ENTRIES));
  
  const errorTypesSummary = {};
  criticalErrors.forEach(domain => {
    Object.entries(domain.errorTypes).forEach(([type, count]) => {
      errorTypesSummary[type] = (errorTypesSummary[type] || 0) + count;
    });
  });
  
  return {
    domains: criticalErrors,
    errorTypesSummary: Object.entries(errorTypesSummary)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count })),
    totalCriticalErrors: Object.values(errorTypesSummary).reduce((sum, count) => sum + count, 0)
  };
}

const filterRealErrors = (stats) => {
  const excludedErrorTypes = [
    'StepNotApplicable',
    'NoResult', 
    'StepSkipped',
    'PlatformNotDetected',
    'NoJobsFound',
    'NotApplicable',
    'SkippedStep'
  ];
  
  const filteredStats = JSON.parse(JSON.stringify(stats));
  
  filteredStats.errorStats.totalErrors = 0;
  filteredStats.errorStats.byErrorType = {};
  
  Object.entries(stats.errorStats.byErrorType || {}).forEach(([type, count]) => {
    if (!excludedErrorTypes.includes(type)) {
      filteredStats.errorStats.byErrorType[type] = count;
      filteredStats.errorStats.totalErrors += count;
    }
  });
  
  filteredStats.domains = filteredStats.domains.map(domain => {
    const realErrors = (domain.errorsByType && Object.entries(domain.errorsByType)
      .filter(([type]) => !excludedErrorTypes.includes(type))
      .reduce((sum, [, count]) => sum + count, 0)) || 0;
    
    return {
      ...domain,
      realErrors: realErrors,
      errors: realErrors
    };
  });
  
  return filteredStats;
};

router.get('/', async (req, res) => {
  try {
    const validation = validateStatisticsRequest(req.query);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parameters',
        errors: validation.errors
      });
    }

    const filters = {
      step: req.query.step || null,
      category: req.query.category || null,
      minScore: req.query.minScore ? parseInt(req.query.minScore) : null,
      maxScore: req.query.maxScore ? parseInt(req.query.maxScore) : null,
      sortBy: req.query.sortBy || 'complexityScore',
      sortDir: req.query.sortDir || 'desc',
      selectedDomain: req.query.domain || null
    };
    
    const rawStats = await scrapingMetrics.getStepStats();
    const stats = filterRealErrors(rawStats);
    
    let filteredDomains = [...stats.domains];
    
    if (filters.step) {
      filteredDomains = filteredDomains.filter(domain => domain.lastSuccessfulStep === filters.step);
    }
    
    if (filters.category) {
      filteredDomains = filteredDomains.filter(domain => domain.complexityCategory === filters.category);
    }
    
    if (filters.minScore !== null) {
      filteredDomains = filteredDomains.filter(domain => domain.complexityScore >= filters.minScore);
    }
    
    if (filters.maxScore !== null) {
      filteredDomains = filteredDomains.filter(domain => domain.complexityScore <= filters.maxScore);
    }
    
    filteredDomains.sort((a, b) => {
      let aValue = a[filters.sortBy] || 0;
      let bValue = b[filters.sortBy] || 0;
      
      if (typeof aValue === 'string' && aValue.includes('-')) {
        try {
          aValue = new Date(aValue).getTime();
          bValue = new Date(bValue).getTime();
        } catch (e) {}
      }
      
      return filters.sortDir === 'asc' ? aValue - bValue : bValue - aValue;
    });

    let scrapedLinks = [];
    if (filters.selectedDomain) {
      scrapedLinks = await getScrapedLinksForDomain(filters.selectedDomain);
    }
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const htmlContent = statsTemplates.generateMainTemplate(stats, filters, filteredDomains, scrapedLinks, cleanDomainName);
      const html = createBaseLayout('Scraping Statistics - Debug Tools', htmlContent, statsTemplates.getCSS(), statsTemplates.getJS());
      res.send(html);
    } else {
      res.json({
        success: true,
        stats
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/export/synthesis/domains', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_DOMAIN_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_DOMAINS);
    
    const synthesis = await generateDomainSynthesis(maxLimit);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=domain-synthesis-${Date.now()}.json`);
    
    res.json({
      exportType: 'domain-synthesis',
      exportDate: new Date().toISOString(),
      config: {
        limit: maxLimit,
        totalFound: synthesis.length
      },
      summary: {
        totalDomains: synthesis.length,
        totalRequests: synthesis.reduce((sum, d) => sum + d.totalRequests, 0),
        avgSuccessRate: (synthesis.reduce((sum, d) => sum + parseFloat(d.successRate), 0) / synthesis.length).toFixed(1),
        totalJobLinks: synthesis.reduce((sum, d) => sum + d.jobLinks, 0),
        mostSearchedDomain: synthesis[0]?.domain || 'N/A',
        mostSearchedDomainHits: synthesis[0]?.totalRequests || 0
      },
      data: synthesis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/jobtitles', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_JOB_TITLE_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_JOB_TITLES);
    
    const synthesis = await generateJobTitleSynthesis(maxLimit);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=jobtitle-synthesis-${Date.now()}.json`);
    
    res.json({
      exportType: 'jobtitle-synthesis',
      exportDate: new Date().toISOString(),
      config: {
        limit: maxLimit,
        totalFound: synthesis.length
      },
      summary: {
        totalJobTitles: synthesis.length,
        totalSearches: synthesis.reduce((sum, j) => sum + j.count, 0),
        mostSearchedJobTitle: synthesis[0]?.title || 'N/A',
        mostSearchedJobTitleCount: synthesis[0]?.count || 0,
        avgDomainsPerJobTitle: (synthesis.reduce((sum, j) => sum + j.domainsCount, 0) / synthesis.length).toFixed(1)
      },
      data: synthesis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/links', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_LINK_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_LINKS_PER_DOMAIN);
    
    const synthesis = await generateLinkTitleSynthesis(maxLimit);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=link-synthesis-${Date.now()}.json`);
    
    res.json({
      exportType: 'link-synthesis',
      exportDate: new Date().toISOString(),
      config: {
        limit: maxLimit,
        totalFound: synthesis.length
      },
      summary: {
        totalLinkTitles: synthesis.length,
        totalOccurrences: synthesis.reduce((sum, l) => sum + l.count, 0),
        mostCommonLinkTitle: synthesis[0]?.title || 'N/A',
        mostCommonLinkTitleCount: synthesis[0]?.count || 0,
        jobPostingRatio: (synthesis.filter(l => l.isJobPosting).length / synthesis.length * 100).toFixed(1)
      },
      data: synthesis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/errors', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_DOMAIN_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_ERROR_ENTRIES);
    
    const synthesis = await generateErrorSynthesis(maxLimit);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=error-synthesis-${Date.now()}.json`);
    
    res.json({
      exportType: 'error-synthesis',
      exportDate: new Date().toISOString(),
      config: {
        limit: maxLimit,
        totalFound: synthesis.domains.length
      },
      summary: {
        totalProblematicDomains: synthesis.domains.length,
        totalCriticalErrors: synthesis.totalCriticalErrors,
        avgErrorRate: synthesis.domains.length > 0 
          ? (synthesis.domains.reduce((sum, d) => sum + parseFloat(d.errorRate), 0) / synthesis.domains.length).toFixed(1)
          : 0,
        mostProblematicDomain: synthesis.domains[0]?.domain || 'N/A',
        mostProblematicDomainErrors: synthesis.domains[0]?.realErrors || 0,
        topErrorType: synthesis.errorTypesSummary[0]?.type || 'N/A'
      },
      errorTypes: synthesis.errorTypesSummary,
      data: synthesis.domains
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/performance', async (req, res) => {
  try {
    const monitoringData = MonitoringService.getSystemOverview();
    const stepData = MonitoringService.getTopSteps(20);
    
    const performanceSynthesis = {
      system: {
        totalDomains: monitoringData.totals.domains,
        totalUsers: monitoringData.totals.users,
        totalBatches: monitoringData.totals.batches,
        activeDomains: monitoringData.realtime.activeDomains,
        currentMemoryUsage: monitoringData.realtime.memory.percentage,
        currentCpuUsage: monitoringData.realtime.cpu.percentage
      },
      topDomains: monitoringData.top.domains.map(domain => ({
        domain: cleanDomainName(domain.domain),
        requests: domain.requests,
        avgTime: domain.avgTime,
        successRate: domain.successRate
      })),
      stepPerformance: stepData.map(step => ({
        step: step.step,
        calls: step.calls,
        avgTime: step.avgTime,
        successRate: step.successRate
      })),
      resourceMetrics: {
        memoryUsed: monitoringData.realtime.memory.used,
        memoryAvailable: monitoringData.realtime.memory.available,
        cpuLoad: monitoringData.realtime.cpu.load,
        queueLength: monitoringData.realtime.queueLength
      }
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=performance-synthesis-${Date.now()}.json`);
    
    res.json({
      exportType: 'performance-synthesis',
      exportDate: new Date().toISOString(),
      summary: {
        systemHealth: monitoringData.realtime.memory.percentage < 80 && monitoringData.realtime.cpu.percentage < 80 ? 'Good' : 'Warning',
        totalRequests: monitoringData.realtime.requests.lastHour,
        avgResponseTime: performanceSynthesis.topDomains.reduce((sum, d) => sum + d.avgTime, 0) / performanceSynthesis.topDomains.length,
        topPerformingStep: stepData[0]?.step || 'N/A',
        worstPerformingStep: stepData[stepData.length - 1]?.step || 'N/A'
      },
      data: performanceSynthesis
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_DOMAIN_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_DOMAINS);
    
    const [domains, jobTitles, links, errors] = await Promise.all([
      generateDomainSynthesis(maxLimit),
      generateJobTitleSynthesis(maxLimit),
      generateLinkTitleSynthesis(maxLimit),
      generateErrorSynthesis(maxLimit)
    ]);
    
    const monitoringData = MonitoringService.getSystemOverview();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=complete-synthesis-${Date.now()}.json`);
    
    res.json({
      exportType: 'complete-synthesis',
      exportDate: new Date().toISOString(),
      config: {
        limit: maxLimit
      },
      summary: {
        totalDomains: domains.length,
        totalJobTitles: jobTitles.length,
        totalLinkTitles: links.length,
        totalCriticalErrors: errors.totalCriticalErrors,
        mostSearchedDomain: domains[0]?.domain || 'N/A',
        mostSearchedDomainHits: domains[0]?.totalRequests || 0,
        mostSearchedJobTitle: jobTitles[0]?.title || 'N/A',
        mostSearchedJobTitleCount: jobTitles[0]?.count || 0,
        mostCommonLinkTitle: links[0]?.title || 'N/A',
        mostCommonLinkTitleCount: links[0]?.count || 0,
        systemHealth: monitoringData.realtime.memory.percentage < 80 && monitoringData.realtime.cpu.percentage < 80 ? 'Good' : 'Warning'
      },
      data: {
        domains,
        jobTitles,
        links,
        errors,
        monitoring: monitoringData
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/domains/html', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_DOMAIN_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_DOMAINS);
    
    const synthesis = await generateDomainSynthesis(maxLimit);
    const htmlContent = statsTemplates.generateDomainsHTMLExport(synthesis);
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename=domain-report-${Date.now()}.html`);
    res.send(htmlContent);
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/jobtitles/html', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_JOB_TITLE_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_JOB_TITLES);
    
    const synthesis = await generateJobTitleSynthesis(maxLimit);
    const htmlContent = statsTemplates.generateJobTitlesHTMLExport(synthesis);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename=jobtitles-report-${Date.now()}.html`);
    res.send(htmlContent);
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/synthesis/errors/html', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || EXPORT_CONFIG.DEFAULT_DOMAIN_LIMIT;
    const maxLimit = Math.min(limit, EXPORT_CONFIG.MAX_ERROR_ENTRIES);
    
    const synthesis = await generateErrorSynthesis(maxLimit);
    const htmlContent = statsTemplates.generateErrorsHTMLExport(synthesis);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename=errors-report-${Date.now()}.html`);
    res.send(htmlContent);
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/export/config', (req, res) => {
  res.json({
    success: true,
    config: EXPORT_CONFIG,
    availableExports: {
      'synthesis/domains': 'Domain analysis synthesis',
      'synthesis/jobtitles': 'Job titles synthesis', 
      'synthesis/links': 'Link titles synthesis',
      'synthesis/errors': 'Critical errors synthesis',
      'synthesis/performance': 'Performance metrics synthesis',
      'synthesis/all': 'Complete synthesis (all data)'
    },
    parameters: {
      'limit': 'Number of items to include (respects max limits)',
      'format': 'Export format (json only for now)'
    }
  });
});

router.get('/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    
    const validation = validateDomainName(domain);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }
    
    const metrics = await scrapingMetrics.getDomainMetrics(domain);
    const errors = await scrapingMetrics.getDomainErrors(domain);
    const resourceMetrics = await scrapingMetrics.getDomainResourceMetrics(domain);
    const cacheMetrics = await scrapingMetrics.getDomainCacheMetrics(domain);
    const cacheRecommendation = await scrapingMetrics.getCacheRecommendation(domain);
    
    if (!metrics) {
      return res.status(404).json({
        success: false,
        message: `No metrics found for domain: ${domain}`
      });
    }
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const htmlContent = statsTemplates.generateDomainDetailTemplate(domain, metrics, errors, resourceMetrics, cacheMetrics, cacheRecommendation, cleanDomainName);
      const html = createBaseLayout(`Scraping Metrics: ${cleanDomainName(domain)} - Debug Tools`, htmlContent, statsTemplates.getCSS());
      res.send(html);
    } else {
      res.json({
        success: true,
        metrics,
        errors,
        resourceMetrics,
        cacheMetrics,
        cacheRecommendation
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;