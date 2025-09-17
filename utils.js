const fs = require('fs').promises;
const path = require('path');
const config = require('./config');
const crypto = require('crypto');
const loggingService = require('./services/LoggingService');

const randomDelay = async (min = 200, max = 800) => {
  const delay = min + Math.floor(Math.random() * (max - min));
  return new Promise(resolve => setTimeout(resolve, delay));
};

const getRandomUserAgent = () => {
  return config.userAgents[Math.floor(Math.random() * config.userAgents.length)];
};

const ensureDebugDir = async () => {
  if (config.DEBUG) {
    try {
      await fs.mkdir(config.DEBUG_DIR, { recursive: true });
    } catch (err) {
      loggingService.error('Error creating debug directory', { error: err.message });
    }
  }
};

const isWithinOneMonth = (dateText) => {
  if (!dateText) return true;
  
  const today = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);
  
  const daysAgoMatch = dateText.match(/(\d+)\s+(?:days?|jours?) ago|il y a (\d+)\s+(?:jours?)/i);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1] || daysAgoMatch[2]);
    return days <= 30;
  }
  
  try {
    const frenchDateMatch = dateText.match(/(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i);
    if (frenchDateMatch) {
      const day = parseInt(frenchDateMatch[1]);
      const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      const month = monthNames.findIndex(m => m.toLowerCase() === frenchDateMatch[2].toLowerCase());
      const year = parseInt(frenchDateMatch[3]);
      
      const date = new Date(year, month, day);
      return date >= oneMonthAgo;
    }
    
    const date = new Date(dateText);
    if (!isNaN(date.getTime())) {
      return date >= oneMonthAgo;
    }
  } catch (e) {
    loggingService.error('Date parsing error', { dateText, error: e.message });
  }
  
  return true;
};

const findMatches = (pageData, jobTitles, locations = []) => {
  const pageTextLower = pageData.text.toLowerCase();
  const pageTitleLower = pageData.title.toLowerCase();
  
  const matches = {
    jobTitles: [],
    locations: [],
    links: [],
    priority: 0
  };
  
  for (const jobTitle of jobTitles) {
    const jobTitleLower = jobTitle.toLowerCase().trim();
    
    if (pageTextLower.includes(jobTitleLower) || pageTitleLower.includes(jobTitleLower)) {
      matches.jobTitles.push(jobTitle);
      
      const jobLinks = pageData.links.filter(link => {
        const linkTextLower = link.text.toLowerCase();
        const linkUrlLower = link.url.toLowerCase();
        
        return linkTextLower.includes(jobTitleLower) || 
               linkUrlLower.includes(jobTitleLower) ||
               linkUrlLower.includes(jobTitleLower.replace(/\s+/g, '-')) ||
               linkUrlLower.includes(jobTitleLower.replace(/\s+/g, '_'));
      });
      
      matches.links.push(...jobLinks);
    }
  }
  
  if (matches.jobTitles.length > 0) {
    matches.priority = 1;
    
    if (locations && locations.length > 0) {
      for (const location of locations) {
        const locationLower = location.toLowerCase();
        
        if (pageTextLower.includes(locationLower) || pageTitleLower.includes(locationLower)) {
          matches.locations.push(location);
          matches.priority = 2;
        }
      }
    }
  }
  
  const uniqueLinks = [];
  const seenUrls = new Set();
  
  for (const link of matches.links) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      uniqueLinks.push(link);
    }
  }
  
  matches.links = uniqueLinks;
  
  return matches;
};

const validateSelector = (selector) => {
  if (!selector || typeof selector !== 'string') return false;
  
  const openBrackets = (selector.match(/\[/g) || []).length;
  const closeBrackets = (selector.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) return false;
  
  if (selector.includes('[*]') || selector.includes('[data-*]')) return false;
  
  const singleQuotes = (selector.match(/'/g) || []).length;
  const doubleQuotes = (selector.match(/"/g) || []).length;
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) return false;
  
  return true;
};

const sanitizeSelectors = (selectors) => {
  return selectors.filter(sel => validateSelector(sel));
};

module.exports = {
  randomDelay,
  getRandomUserAgent,
  ensureDebugDir,
  isWithinOneMonth,
  findMatches,
  validateSelector,
  sanitizeSelectors
};