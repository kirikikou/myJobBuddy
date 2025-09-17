const formatDate = (dateInput) => {
  if (!dateInput) return 'Never';
  
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  } catch (error) {
    return 'Invalid Date';
  }
};

const formatDuration = (milliseconds) => {
  if (!milliseconds || milliseconds < 0) return '0ms';
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  if (seconds > 0) return `${seconds}s`;
  
  return `${milliseconds}ms`;
};

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
};

const formatPercentage = (value, total, decimals = 1) => {
  if (!total || total === 0) return '0%';
  
  const percentage = (value / total) * 100;
  return percentage.toFixed(decimals) + '%';
};

const getComplexityBadge = (score) => {
  if (score >= 80) return { class: 'score-very-hard', label: 'Very Hard' };
  if (score >= 60) return { class: 'score-hard', label: 'Hard' };
  if (score >= 40) return { class: 'score-medium', label: 'Medium' };
  if (score >= 20) return { class: 'score-moderate', label: 'Moderate' };
  return { class: 'score-easy', label: 'Easy' };
};

const formatLanguageBadge = (language) => {
  const languageNames = {
    'en': 'English',
    'fr': 'Français',
    'es': 'Español',
    'de': 'Deutsch',
    'it': 'Italiano',
    'pt': 'Português',
    'nl': 'Nederlands',
    'sv': 'Svenska',
    'no': 'Norsk',
    'fi': 'Suomi',
    'pl': 'Polski',
    'uk': 'Українська'
  };
  
  const langName = languageNames[language] || language;
  return `<span class="language-badge">${langName}</span>`;
};

const createUrlPreview = (url, maxLength = 60) => {
  if (!url) return '';
  
  if (url.length <= maxLength) return url;
  
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search;
    
    if (domain.length + 10 >= maxLength) {
      return domain.substring(0, maxLength - 3) + '...';
    }
    
    const remainingLength = maxLength - domain.length - 3;
    const truncatedPath = path.length > remainingLength ? 
      path.substring(0, remainingLength - 3) + '...' : path;
    
    return domain + truncatedPath;
  } catch (e) {
    return url.substring(0, maxLength - 3) + '...';
  }
};

const calculateResourceUsage = (executionTime, memoryUsage) => {
  const cpuPercentage = Math.min((executionTime / 10000) * 100, 100);
  const memoryPercentage = Math.min((memoryUsage / 512) * 100, 100);
  const efficiency = Math.max(100 - (cpuPercentage + memoryPercentage) / 2, 0);
  
  return {
    cpu: cpuPercentage.toFixed(2),
    memory: memoryUsage.toFixed(2),
    efficiency: efficiency.toFixed(0)
  };
};

const formatConsoleError = (error) => {
  const levelColors = {
    error: '#f8d7da',
    warn: '#fff3cd',
    info: '#d1ecf1',
    log: '#f8f9fa'
  };
  
  const borderColors = {
    error: '#f5c6cb',
    warn: '#ffeaa7',
    info: '#bee5eb',
    log: '#dee2e6'
  };
  
  const textColors = {
    error: '#721c24',
    warn: '#856404',
    info: '#0c5460',
    log: '#495057'
  };
  
  const bgColor = levelColors[error.level] || levelColors.log;
  const borderColor = borderColors[error.level] || borderColors.log;
  const textColor = textColors[error.level] || textColors.log;
  
  return `
    <div class="console-error-entry" style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 4px; padding: 10px; margin: 5px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
        <strong style="color: ${textColor};">[${error.level.toUpperCase()}]</strong>
        <span class="small">${formatDate(error.timestamp)}</span>
      </div>
      <div style="font-family: monospace; font-size: 13px; word-break: break-word;">${error.message}</div>
      ${error.stack ? `
        <details style="margin-top: 10px;">
          <summary style="cursor: pointer; color: #666;">Stack Trace</summary>
          <pre style="margin-top: 5px; font-size: 11px; color: #666; overflow-x: auto;">${error.stack}</pre>
        </details>
      ` : ''}
      ${error.url ? `<div class="small" style="margin-top: 5px; color: #666;">URL: ${error.url}</div>` : ''}
      ${error.lineNumber ? `<div class="small" style="color: #666;">Line: ${error.lineNumber}</div>` : ''}
    </div>
  `;
};

const formatStepResult = (step, result) => {
  const statusClass = result.success ? 'success' : 'danger';
  const statusIcon = result.success ? '✓' : '✗';
  
  return `
    <div class="step-result ${statusClass}">
      <div class="step-header">
        <span class="step-icon">${statusIcon}</span>
        <span class="step-name">${step}</span>
        <span class="step-duration">${formatDuration(result.executionTime)}</span>
      </div>
      ${result.error ? `
        <div class="step-error">
          <strong>Error:</strong> ${result.error}
        </div>
      ` : ''}
      ${result.data && result.data.links ? `
        <div class="step-data">
          <strong>Links found:</strong> ${result.data.links.length}
        </div>
      ` : ''}
    </div>
  `;
};

const formatMetricsTable = (metrics, title = 'Metrics') => {
  if (!metrics || typeof metrics !== 'object') return '';
  
  const rows = Object.entries(metrics).map(([key, value]) => {
    let formattedValue = value;
    
    if (typeof value === 'number') {
      if (key.includes('Time') || key.includes('Duration')) {
        formattedValue = formatDuration(value);
      } else if (key.includes('Size') || key.includes('Memory')) {
        formattedValue = formatFileSize(value);
      } else if (key.includes('Rate') || key.includes('Percentage')) {
        formattedValue = formatPercentage(value, 100) + '%';
      } else {
        formattedValue = value.toLocaleString();
      }
    } else if (value instanceof Date) {
      formattedValue = formatDate(value);
    }
    
    return `
      <tr>
        <th>${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</th>
        <td>${formattedValue}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="metrics-card">
      <h3>${title}</h3>
      <table>
        ${rows}
      </table>
    </div>
  `;
};

const formatJobLink = (link, domain) => {
  const relevanceScore = link.relevanceScore || 0;
  const scoreClass = relevanceScore > 80 ? 'score-easy' : 
                    relevanceScore > 50 ? 'score-medium' : 'score-hard';
  
  return `
    <div class="job-link-item">
      <div class="job-link-header">
        <span class="job-title">${link.title || 'No title'}</span>
        <span class="relevance-score ${scoreClass}">${relevanceScore}%</span>
      </div>
      <div class="job-link-url">
        <a href="${link.url}" target="_blank">${createUrlPreview(link.url, 80)}</a>
      </div>
      <div class="job-link-meta">
        <span class="job-type">${link.isJobPosting ? 'Job Posting' : link.linkType || 'General'}</span>
        ${link.scrapedAt ? `<span class="scraped-date">${formatDate(link.scrapedAt)}</span>` : ''}
      </div>
    </div>
  `;
};

const formatErrorSummary = (errors) => {
  if (!errors || Object.keys(errors).length === 0) {
    return '<div class="no-errors">No errors detected</div>';
  }
  
  const totalErrors = Object.values(errors).reduce((sum, count) => sum + count, 0);
  
  const errorList = Object.entries(errors)
    .sort(([,a], [,b]) => b - a)
    .map(([type, count]) => `
      <tr>
        <td>${type}</td>
        <td>${count}</td>
        <td>${formatPercentage(count, totalErrors)}%</td>
      </tr>
    `).join('');
  
  return `
    <div class="error-summary">
      <h4>Error Summary (${totalErrors} total)</h4>
      <table>
        <tr>
          <th>Error Type</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
        ${errorList}
      </table>
    </div>
  `;
};

module.exports = {
  formatDate,
  formatDuration,
  formatFileSize,
  formatPercentage,
  getComplexityBadge,
  formatLanguageBadge,
  createUrlPreview,
  calculateResourceUsage,
  formatConsoleError,
  formatStepResult,
  formatMetricsTable,
  formatJobLink,
  formatErrorSummary
};