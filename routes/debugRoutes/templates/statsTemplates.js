const { createBreadcrumb } = require('../utils/htmlTemplates');
const { formatDate, formatDuration, formatPercentage, getComplexityBadge, formatLanguageBadge, createUrlPreview, calculateResourceUsage } = require('../utils/formatters');

const generateMainTemplate = (stats, filters, filteredDomains, scrapedLinks, cleanDomainName) => {
  const breadcrumb = createBreadcrumb([
    { label: 'Debug', url: '/debug' },
    { label: 'Scraping Statistics', url: '/debug/stats' }
  ]);

  const stepTableWidth = Object.keys(stats.stepStats).length * 150;
  const chartWidth = Object.keys(stats.stepStats).length * 80;
  
  return `
    ${breadcrumb}
    
    <h1>Scraping Statistics</h1>
    
    <div class="actions">
      <a href="/debug" class="button secondary">Back to Debug</a>
      <a href="/debug/stats" class="button">Refresh</a>
      <div class="export-section" style="display: inline-block; margin-left: 20px;">
        <label for="export-limit">Export Limit:</label>
        <select id="export-limit" style="margin: 0 10px;">
          <option value="10">10 items</option>
          <option value="20" selected>20 items</option>
          <option value="50">50 items</option>
          <option value="100">100 items</option>
        </select>
        <div class="export-buttons" style="display: inline-block;">
          <button onclick="exportSynthesis('domains')" class="button">📊 Export Domains</button>
          <button onclick="exportSynthesis('jobtitles')" class="button">💼 Export Job Titles</button>
          <button onclick="exportSynthesis('links')" class="button">🔗 Export Links</button>
          <button onclick="exportSynthesis('errors')" class="button">❌ Export Errors</button>
          <button onclick="exportSynthesis('performance')" class="button">⚡ Export Performance</button>
          <button onclick="exportSynthesis('all')" class="button" style="background-color: #28a745;">📋 Export ALL</button>
          <br><br>
          <button onclick="exportSynthesisHTML('domains')" class="button" style="background-color: #007bff;">📊📈 Domains HTML</button>
          <button onclick="exportSynthesisHTML('jobtitles')" class="button" style="background-color: #fd7e14;">💼📈 Job Titles HTML</button>
          <button onclick="exportSynthesisHTML('errors')" class="button" style="background-color: #dc3545;">🚨📈 Errors HTML</button>
        </div>
      </div>
    </div>
    
    <div class="tabs">
      <div class="tab active" data-tab="tab-overview">Overview</div>
      <div class="tab" data-tab="tab-domains">Domains</div>
      <div class="tab" data-tab="tab-links">Links</div>
      <div class="tab" data-tab="tab-errors">Errors</div>
      <div class="tab" data-tab="tab-resources">Resources</div>
      <div class="tab" data-tab="tab-cache">Cache</div>
    </div>
    
    ${generateOverviewTab(stats, chartWidth)}
    ${generateDomainsTab(stats, filters, filteredDomains, cleanDomainName)}
    ${generateLinksTab(stats, filters, scrapedLinks, cleanDomainName)}
    ${generateErrorsTab(stats, cleanDomainName)}
    ${generateResourcesTab(stats, chartWidth, cleanDomainName)}
    ${generateCacheTab(stats, cleanDomainName)}
  `;
};

const generateOverviewTab = (stats, chartWidth) => {
  return `
    <div id="tab-overview" class="tab-content active">
      <div class="section">
        <h2>General Overview</h2>
        <div class="metrics-grid">
          <div class="metrics-card">
            <h3>Scraping</h3>
            <table>
              <tr>
                <th>Analyzed Domains</th>
                <td>${stats.totalDomains}</td>
              </tr>
              <tr>
                <th>Applicability Checks</th>
                <td>${stats.totalApplicabilityChecks}</td>
              </tr>
              <tr>
                <th>Real Attempts</th>
                <td>${stats.totalRealAttempts}</td>
              </tr>
            </table>
          </div>
          
          <div class="metrics-card">
            <h3>Real Errors</h3>
            <table>
              <tr>
                <th>Total Errors</th>
                <td>${stats.errorStats.totalErrors}</td>
              </tr>
              <tr>
                <th>Error Rate</th>
                <td class="${stats.totalRealAttempts > 0 && (stats.errorStats.totalErrors / stats.totalRealAttempts) > 0.3 ? 'danger' : stats.totalRealAttempts > 0 && (stats.errorStats.totalErrors / stats.totalRealAttempts) > 0.1 ? 'warning' : 'success'}">
                  ${stats.totalRealAttempts > 0 ? ((stats.errorStats.totalErrors / stats.totalRealAttempts) * 100).toFixed(1) : 0}%
                </td>
              </tr>
              <tr>
                <th>Note</th>
                <td class="small">StepNotApplicable excluded (normal behavior)</td>
              </tr>
            </table>
          </div>
          
          <div class="metrics-card">
            <h3>Cache</h3>
            <table>
              <tr>
                <th>Hits</th>
                <td>${stats.cacheStats.totalHits}</td>
              </tr>
              <tr>
                <th>Misses</th>
                <td>${stats.cacheStats.totalMisses}</td>
              </tr>
              <tr>
                <th>Success Rate</th>
                <td class="${parseFloat(stats.cacheStats.globalHitRate) > 50 ? 'success' : 'warning'}">
                  ${stats.cacheStats.globalHitRate}
                </td>
              </tr>
            </table>
          </div>
          
          <div class="metrics-card">
            <h3>Resources</h3>
            <table>
              <tr>
                <th>Average Execution Time</th>
                <td>${(stats.resourceStats.avgExecutionTime / 1000).toFixed(2)} s</td>
              </tr>
              <tr>
                <th>Total Execution Time</th>
                <td>${(stats.resourceStats.totalExecutionTime / 1000 / 60).toFixed(2)} min</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h2>Statistics by Step</h2>
        
        <div class="chart-container">
          <div style="overflow-x: auto;">
            <div class="bar-chart" style="min-width: ${chartWidth}px; display: flex; height: 250px; align-items: flex-end;">
              ${Object.entries(stats.stepStats).map(([step, data]) => {
                const successRate = parseFloat(data.realSuccessRate);
                const height = Math.max(successRate, 5);
                
                let color = '#4CAF50';
                if (successRate < 50) color = '#FFC107';
                if (successRate < 25) color = '#F44336';
                
                return `
                  <div class="bar" style="height: ${height}%; background-color: ${color}; margin: 0 5px; min-width: 60px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
                    <div class="bar-value" style="color: white; padding: 5px 0; font-weight: bold; font-size: 11px;">${successRate}%</div>
                    <div class="bar-label" style="position: absolute; bottom: -40px; text-align: center; font-size: 10px; width: 70px; word-wrap: break-word; transform: rotate(-45deg); transform-origin: center;">${step}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        
        <div class="responsive-table">
          <table style="min-width: ${stats.stepStats ? Object.keys(stats.stepStats).length * 150 : 800}px;">
            <tr>
              <th>Step</th>
              <th>Applicability Checks</th>
              <th>Real Attempts</th>
              <th>Not Applicable</th>
              <th>Successes</th>
              <th>Real Success Rate</th>
              <th>Average Time (s)</th>
              <th>Domains</th>
            </tr>
            ${Object.entries(stats.stepStats).map(([step, data]) => `
              <tr>
                <td style="white-space: nowrap; font-size: 12px;">${step}</td>
                <td class="small">${data.totalApplicabilityChecks}</td>
                <td>${data.totalRealAttempts}</td>
                <td class="small">${data.totalNotApplicable}</td>
                <td>${data.totalSuccesses}</td>
                <td class="${parseFloat(data.realSuccessRate) > 50 ? 'success' : 'warning'}">${data.realSuccessRate}</td>
                <td>${(data.avgExecutionTime / 1000).toFixed(2)}</td>
                <td>${data.domains}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>
      
      <div class="section">
        <h2>Top 5 Most Complex Domains</h2>
        <div class="responsive-table">
          <table>
            <tr>
              <th>Domain</th>
              <th>Score</th>
              <th>Category</th>
              <th>Language</th>
              <th>Last Successful Step</th>
              <th>Average Time (s)</th>
              <th>Actions</th>
            </tr>
            ${stats.domains.slice(0, 5).map((domain) => {
              const badge = getComplexityBadge(domain.complexityScore);
              return `
                <tr>
                  <td>${domain.domain}</td>
                  <td>
                    <span class="score-badge ${badge.class}">
                      ${domain.complexityScore}/100
                    </span>
                  </td>
                  <td>${domain.complexityCategory}</td>
                  <td>${domain.detectedLanguage ? formatLanguageBadge(domain.detectedLanguage) : 'Unknown'}</td>
                  <td>${domain.lastSuccessfulStep || 'None'}</td>
                  <td>${domain.resourceMetrics ? (domain.resourceMetrics.avgExecutionTime / 1000).toFixed(2) : 'N/A'}</td>
                  <td>
                    <a href="/debug/stats/${domain.domain}" class="button" style="padding: 5px 10px; font-size: 12px;">Details</a>
                    <a href="/debug/scraping/test?url=${encodeURIComponent(domain.url)}" target="_blank" class="button secondary" style="padding: 5px 10px; font-size: 12px;">Test</a>
                  </td>
                </tr>
              `;
            }).join('')}
          </table>
        </div>
        <p><a href="/debug/stats?tab=domains" class="button">View All Domains</a></p>
      </div>
    </div>
  `;
};

const generateDomainsTab = (stats, filters, filteredDomains, cleanDomainName) => {
  return `
    <div id="tab-domains" class="tab-content">
      <div class="section">
        <h2>Statistics by Domain</h2>
        
        <div class="filter-panel">
          <form action="/debug/stats" method="get">
            <input type="hidden" name="tab" value="domains">
            <div class="filter-group">
              <label for="step">Step:</label>
              <select name="step" id="step">
                <option value="">All</option>
                ${Object.keys(stats.stepStats).map(step => 
                  `<option value="${step}" ${filters.step === step ? 'selected' : ''}>${step}</option>`
                ).join('')}
              </select>
            </div>
            <div class="filter-group">
              <label for="category">Category:</label>
              <select name="category" id="category">
                <option value="">All</option>
                <option value="Easy" ${filters.category === 'Easy' ? 'selected' : ''}>Easy</option>
                <option value="Moderate" ${filters.category === 'Moderate' ? 'selected' : ''}>Moderate</option>
                <option value="Medium" ${filters.category === 'Medium' ? 'selected' : ''}>Medium</option>
                <option value="Hard" ${filters.category === 'Hard' ? 'selected' : ''}>Hard</option>
                <option value="Very Hard" ${filters.category === 'Very Hard' ? 'selected' : ''}>Very Hard</option>
              </select>
            </div>
            <div class="filter-group">
              <label for="sortBy">Sort by:</label>
              <select name="sortBy" id="sortBy">
                <option value="complexityScore" ${filters.sortBy === 'complexityScore' ? 'selected' : ''}>Complexity Score</option>
                <option value="totalRealAttempts" ${filters.sortBy === 'totalRealAttempts' ? 'selected' : ''}>Real Attempts</option>
                <option value="lastSuccessAt" ${filters.sortBy === 'lastSuccessAt' ? 'selected' : ''}>Last Success</option>
              </select>
            </div>
            <div class="filter-group">
              <label for="sortDir">Direction:</label>
              <select name="sortDir" id="sortDir">
                <option value="desc" ${filters.sortDir === 'desc' ? 'selected' : ''}>Descending</option>
                <option value="asc" ${filters.sortDir === 'asc' ? 'selected' : ''}>Ascending</option>
              </select>
            </div>
            <div class="filter-group">
              <label>&nbsp;</label>
              <button type="submit" class="button">Filter</button>
            </div>
          </form>
        </div>
        
        <p class="small">List of ${filteredDomains.length} domains matching filters (out of ${stats.domains.length} total)</p>
        
        <div class="responsive-table">
          <table>
            <tr>
              <th>Domain</th>
              <th>Score</th>
              <th>Language</th>
              <th>Real Attempts</th>
              <th>Real Errors</th>
              <th>Last Successful Step</th>
              <th>Last Success</th>
              <th>Actions</th>
            </tr>
            ${filteredDomains.map((domain, index) => {
              const badge = getComplexityBadge(domain.complexityScore);
              return `
                <tr>
                  <td>${cleanDomainName(domain.domain)}</td>
                  <td>
                    <span class="score-badge ${badge.class}">
                      ${domain.complexityScore}/100
                    </span>
                  </td>
                  <td>${domain.detectedLanguage ? formatLanguageBadge(domain.detectedLanguage) : 'Unknown'}</td>
                  <td>${domain.totalRealAttempts}</td>
                  <td class="${domain.realErrors > 5 ? 'warning' : 'success'}">${domain.realErrors || 0}</td>
                  <td>${domain.lastSuccessfulStep || 'None'}</td>
                  <td>${domain.lastSuccessAt ? formatDate(domain.lastSuccessAt) : 'Never'}</td>
                  <td>
                    <button class="domain-toggle" data-domain="${index}" style="padding: 5px 10px; font-size: 12px;">► Details</button>
                    <a href="/debug/stats/${domain.domain}" style="padding: 5px 10px; font-size: 12px;">View</a>
                    <a href="/debug/scraping/test?url=${encodeURIComponent(domain.url)}" target="_blank" style="padding: 5px 10px; font-size: 12px;">Test</a>
                  </td>
                </tr>
                <tr id="domain-details-${index}" style="display: none;">
                  <td colspan="8">
                    <div style="padding: 15px; background-color: #f9f9f9;">
                      <p><strong>URL:</strong> <a href="${domain.url}" target="_blank">${domain.url}</a></p>
                      <p><strong>Complexity Category:</strong> ${domain.complexityCategory}</p>
                      <p><strong>Detected Language:</strong> ${domain.detectedLanguage ? formatLanguageBadge(domain.detectedLanguage) : 'Unknown'}</p>
                      <p><strong>Applicability Checks:</strong> ${domain.totalApplicabilityChecks}</p>
                      <p><strong>Real Attempts:</strong> ${domain.totalRealAttempts}</p>
                      ${domain.resourceMetrics ? `
                        <p><strong>Average Execution Time:</strong> ${(domain.resourceMetrics.avgExecutionTime / 1000).toFixed(2)} seconds</p>
                        <p><strong>Estimated Memory Usage:</strong> ${domain.resourceMetrics.estimatedMemoryUsage.toFixed(2)} MB</p>
                        <p><strong>Estimated CPU Usage:</strong> ${calculateResourceUsage(domain.resourceMetrics.avgExecutionTime, domain.resourceMetrics.estimatedMemoryUsage).cpu}%</p>
                      ` : ''}
                      ${domain.cacheMetrics ? `
                        <p><strong>Cache Success Rate:</strong> ${domain.cacheMetrics.hitRate.toFixed(1)}%</p>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </table>
        </div>
      </div>
    </div>
  `;
};

const generateLinksTab = (stats, filters, scrapedLinks, cleanDomainName) => {
  return `
    <div id="tab-links" class="tab-content">
      <div class="section">
        <h2>Scraped Links</h2>
        
        <div class="filter-panel">
          <form action="/debug/stats" method="get">
            <input type="hidden" name="tab" value="links">
            <div class="filter-group">
              <label for="domain">Domain:</label>
              <select name="domain" id="domain">
                <option value="">Select a domain</option>
                ${stats.domains.map(domain => 
                  `<option value="${domain.domain}" ${filters.selectedDomain === domain.domain ? 'selected' : ''}>${cleanDomainName(domain.domain)}</option>`
                ).join('')}
              </select>
            </div>
            <div class="filter-group">
              <label>&nbsp;</label>
              <button type="submit" class="button">View Links</button>
            </div>
          </form>
        </div>
        
        ${filters.selectedDomain ? `
          <h3>Links for ${cleanDomainName(filters.selectedDomain)} (${scrapedLinks.length} found)</h3>
          
          ${scrapedLinks.length > 0 ? `
            <div class="responsive-table">
              <table>
                <tr>
                  <th>Job Title</th>
                  <th>Link</th>
                  <th>Type</th>
                  <th>Relevance Score</th>
                  <th>Scraped on</th>
                  <th>Actions</th>
                </tr>
                ${scrapedLinks.map(link => `
                  <tr>
                    <td style="max-width: 300px; word-wrap: break-word;">${link.title}</td>
                    <td><a href="${link.url}" target="_blank" style="font-size: 12px;">${createUrlPreview(link.url, 50)}</a></td>
                    <td>
                      <span class="${link.isJobPosting ? 'success' : ''}" style="font-size: 12px;">
                        ${link.isJobPosting ? 'Job Posting' : link.linkType}
                      </span>
                    </td>
                    <td>
                      <span class="score-badge ${link.relevanceScore > 80 ? 'score-easy' : link.relevanceScore > 50 ? 'score-medium' : 'score-hard'}">
                        ${link.relevanceScore || 0}%
                      </span>
                    </td>
                    <td style="font-size: 12px;">${formatDate(link.scrapedAt)}</td>
                    <td>
                      <a href="${link.url}" target="_blank" class="button" style="padding: 5px 10px; font-size: 12px;">Open</a>
                      <a href="/debug/scraping/test?url=${encodeURIComponent(link.sourceUrl)}" class="button secondary" style="padding: 5px 10px; font-size: 12px;">Re-scrape</a>
                    </td>
                  </tr>
                `).join('')}
              </table>
            </div>
          ` : `
            <div class="empty-state">
              <h3>No links found</h3>
              <p>No job posting links were found for this domain in cache.</p>
              <a href="/debug/scraping/test" class="button">Test Scraping</a>
            </div>
          `}
        ` : `
          <div class="empty-state">
            <h3>Select a domain</h3>
            <p>Choose a domain from the dropdown to see all scraped job posting links.</p>
          </div>
        `}
      </div>
    </div>
  `;
};

const generateErrorsTab = (stats, cleanDomainName) => {
  return `
    <div id="tab-errors" class="tab-content">
      <div class="section">
        <h2>Real Error Analysis</h2>
        <p class="small" style="background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 20px;">
          <strong>Note:</strong> "StepNotApplicable" and "NoResult" errors are excluded as they represent normal bot behavior testing different strategies.
        </p>
        
        <div class="error-stats">
          <h3>Real Error Distribution by Type</h3>
          ${Object.keys(stats.errorStats.byErrorType).length > 0 ? `
            <table>
              <tr>
                <th>Error Type</th>
                <th>Count</th>
                <th>Percentage</th>
              </tr>
              ${Object.entries(stats.errorStats.byErrorType).map(([type, count]) => `
                <tr>
                  <td>${type}</td>
                  <td>${count}</td>
                  <td>${stats.errorStats.totalErrors > 0 ? ((count / stats.errorStats.totalErrors) * 100).toFixed(1) : 0}%</td>
                </tr>
              `).join('')}
            </table>
          ` : `
            <div class="empty-state">
              <h3>No real errors detected</h3>
              <p>Excellent! All your scrapers are working perfectly.</p>
            </div>
          `}
        </div>
        
        <div class="error-stats">
          <h3>Domains with Most Real Errors</h3>
          ${stats.domains.filter(domain => domain.realErrors > 0).length > 0 ? `
            <table>
              <tr>
                <th>Domain</th>
                <th>Language</th>
                <th>Real Errors</th>
                <th>Real Attempts</th>
                <th>Error Rate</th>
                <th>Actions</th>
              </tr>
              ${stats.domains
                .filter(domain => domain.realErrors > 0)
                .sort((a, b) => b.realErrors - a.realErrors)
                .slice(0, 10)
                .map(domain => `
                  <tr>
                    <td>${cleanDomainName(domain.domain)}</td>
                    <td>${domain.detectedLanguage ? formatLanguageBadge(domain.detectedLanguage) : 'Unknown'}</td>
                    <td>${domain.realErrors}</td>
                    <td>${domain.totalRealAttempts}</td>
                    <td class="${domain.totalRealAttempts > 0 && (domain.realErrors / domain.totalRealAttempts) > 0.5 ? 'danger' : 'warning'}">
                      ${domain.totalRealAttempts > 0 ? ((domain.realErrors / domain.totalRealAttempts) * 100).toFixed(1) : 0}%
                    </td>
                    <td>
                      <a href="/debug/stats/${domain.domain}" style="padding: 5px 10px; font-size: 12px;">View</a>
                      <a href="/debug/scraping/test?url=${encodeURIComponent(domain.url)}" target="_blank" style="padding: 5px 10px; font-size: 12px;">Test</a>
                    </td>
                  </tr>
                `).join('')}
            </table>
          ` : `
            <div class="empty-state">
              <h3>No real errors detected</h3>
              <p>All your domains are working perfectly!</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};

const generateResourcesTab = (stats, chartWidth, cleanDomainName) => {
  return `
    <div id="tab-resources" class="tab-content">
      <div class="section">
        <h2>Resource Dashboard</h2>
        
        <div class="chart-container">
          <h3>Average Execution Time by Step (seconds)</h3>
          <div style="overflow-x: auto;">
            <div class="bar-chart" style="min-width: ${chartWidth}px; display: flex; height: 200px; align-items: flex-end;">
              ${Object.entries(stats.stepStats).map(([step, data]) => {
                const avgTime = data.avgExecutionTime / 1000;
                const maxTime = 10;
                const height = Math.min(100, (avgTime / maxTime) * 100);
                
                let color = '#4CAF50';
                if (avgTime > 5) color = '#FFC107';
                if (avgTime > 8) color = '#F44336';
                
                return `
                  <div class="bar" style="height: ${height}%; background-color: ${color}; margin: 0 5px; min-width: 60px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;">
                    <div class="bar-value" style="color: white; padding: 5px 0; font-weight: bold; font-size: 11px;">${avgTime.toFixed(1)}</div>
                    <div class="bar-label" style="position: absolute; bottom: -40px; text-align: center; font-size: 10px; width: 70px; word-wrap: break-word; transform: rotate(-45deg); transform-origin: center;">${step}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        
        <h3>Most Resource-Intensive Domains</h3>
        <table>
          <tr>
            <th>Domain</th>
            <th>Language</th>
            <th>Total Time (s)</th>
            <th>Average Time (s)</th>
            <th>Estimated Memory</th>
            <th>Estimated CPU</th>
            <th>Actions</th>
          </tr>
          ${stats.domains
            .filter(domain => domain.resourceMetrics && domain.resourceMetrics.totalExecutionTime > 0)
            .sort((a, b) => b.resourceMetrics.totalExecutionTime - a.resourceMetrics.totalExecutionTime)
            .slice(0, 10)
            .map(domain => {
              const resourceUsage = calculateResourceUsage(domain.resourceMetrics.avgExecutionTime, domain.resourceMetrics.estimatedMemoryUsage);
              return `
                <tr>
                  <td>${cleanDomainName(domain.domain)}</td>
                  <td>${domain.detectedLanguage ? formatLanguageBadge(domain.detectedLanguage) : 'Unknown'}</td>
                  <td>${(domain.resourceMetrics.totalExecutionTime / 1000).toFixed(2)}</td>
                  <td>${(domain.resourceMetrics.avgExecutionTime / 1000).toFixed(2)}</td>
                  <td>${domain.resourceMetrics.estimatedMemoryUsage.toFixed(2)} MB</td>
                  <td>${resourceUsage.cpu}%</td>
                  <td>
                    <a href="/debug/stats/${domain.domain}" style="padding: 5px 10px; font-size: 12px;">View</a>
                    <a href="/debug/scraping/test?url=${encodeURIComponent(domain.url)}" target="_blank" style="padding: 5px 10px; font-size: 12px;">Test</a>
                  </td>
                </tr>
              `;
            }).join('')}
        </table>
      </div>
    </div>
  `;
};

const generateCacheTab = (stats, cleanDomainName) => {
  return `
    <div id="tab-cache" class="tab-content">
      <div class="section">
        <h2>Cache Optimization</h2>
        
        <div class="metrics-card">
          <h3>Global Cache Statistics</h3>
          <table>
            <tr>
              <th>Total Hits</th>
              <td>${stats.cacheStats.totalHits}</td>
            </tr>
            <tr>
              <th>Total Misses</th>
              <td>${stats.cacheStats.totalMisses}</td>
            </tr>
            <tr>
              <th>Global Success Rate</th>
              <td class="${parseFloat(stats.cacheStats.globalHitRate) > 50 ? 'success' : 'warning'}">
                ${stats.cacheStats.globalHitRate}
              </td>
            </tr>
          </table>
        </div>
        
        <h3>Cache Recommendations by Domain</h3>
        <p class="small">Domains with high hit rates can have longer cache duration, while domains with frequently updated content should have shorter duration.</p>
        
        <table>
          <tr>
            <th>Domain</th>
            <th>Language</th>
            <th>Hit Rate</th>
            <th>Hits</th>
            <th>Misses</th>
            <th>Recommendation</th>
          </tr>
          ${stats.domains
            .filter(domain => domain.cacheMetrics && (domain.cacheMetrics.hits > 0 || domain.cacheMetrics.misses > 0))
            .sort((a, b) => b.cacheMetrics.hitRate - a.cacheMetrics.hitRate)
            .slice(0, 15)
            .map(domain => {
              const recommendation = domain.cacheMetrics.hitRate > 80 ? {
                message: "Increase duration (48h)",
                class: "success"
              } : domain.cacheMetrics.hitRate < 20 ? {
                message: "Reduce duration (6h)",
                class: "warning"
              } : {
                message: "Current duration OK",
                class: ""
              };
              
              return `
                <tr>
                  <td>${cleanDomainName(domain.domain)}</td>
                  <td>${domain.detectedLanguage ? formatLanguageBadge(domain.detectedLanguage) : 'Unknown'}</td>
                  <td class="${domain.cacheMetrics.hitRate > 50 ? 'success' : 'warning'}">
                    ${domain.cacheMetrics.hitRate.toFixed(1)}%
                  </td>
                  <td>${domain.cacheMetrics.hits}</td>
                  <td>${domain.cacheMetrics.misses}</td>
                  <td class="${recommendation.class}">${recommendation.message}</td>
                </tr>
              `;
            }).join('')}
        </table>
      </div>
    </div>
  `;
};

const generateDomainDetailTemplate = (domain, metrics, errors, resourceMetrics, cacheMetrics, cacheRecommendation, cleanDomainName) => {
  const breadcrumb = createBreadcrumb([
    { label: 'Debug', url: '/debug' },
    { label: 'Statistics', url: '/debug/stats' },
    { label: cleanDomainName(domain), url: '#' }
  ]);

  const badge = getComplexityBadge(metrics.complexityScore || 0);
  const resourceUsage = metrics.resourceMetrics ? 
    calculateResourceUsage(metrics.resourceMetrics.avgExecutionTime, metrics.resourceMetrics.estimatedMemoryUsage) : 
    { cpu: '0.00', memory: '0.00', efficiency: '0' };
  
  return `
    ${breadcrumb}
    
    <h1>Scraping Metrics - ${cleanDomainName(domain)}</h1>
    
    <div class="actions">
      <a href="/debug/stats" class="button secondary">Back to Statistics</a>
      <a href="/debug/scraping/test?url=${encodeURIComponent(metrics.url)}" class="button">Test Scraping</a>
    </div>
    
    <div class="metrics-grid">
      <div class="metrics-card">
        <h3>General Information</h3>
        <table>
          <tr>
            <th>URL</th>
            <td><a href="${metrics.url}" target="_blank">${createUrlPreview(metrics.url, 50)}</a></td>
          </tr>
          <tr>
            <th>Clean Domain</th>
            <td>${cleanDomainName(domain)}</td>
          </tr>
          <tr>
            <th>Applicability Checks</th>
            <td>${metrics.totalApplicabilityChecks || 0}</td>
          </tr>
          <tr>
            <th>Real Attempts</th>
            <td>${metrics.totalRealAttempts || 0}</td>
          </tr>
          <tr>
            <th>Detected Language</th>
            <td>${metrics.detectedLanguage ? formatLanguageBadge(metrics.detectedLanguage) : 'Unknown'}</td>
          </tr>
          <tr>
            <th>Last Successful Step</th>
            <td>${metrics.lastSuccessfulStep || 'None'}</td>
          </tr>
          <tr>
            <th>Last Success</th>
            <td>${metrics.lastSuccessAt ? formatDate(metrics.lastSuccessAt) : 'Never'}</td>
          </tr>
          <tr>
            <th>Complexity Score</th>
            <td>
              <span class="score-badge ${badge.class}">
                ${metrics.complexityScore || 0}/100
              </span>
              ${metrics.complexityCategory || 'Unclassified'}
            </td>
          </tr>
          <tr>
            <th>First Analysis</th>
            <td>${metrics.firstSeen ? formatDate(metrics.firstSeen) : 'Unknown'}</td>
          </tr>
        </table>
      </div>
      
      ${errors ? `
      <div class="metrics-card">
        <h3>Errors</h3>
        <table>
          <tr>
            <th>Total Errors</th>
            <td>${errors.totalErrors}</td>
          </tr>
          <tr>
            <th>Error Rate</th>
            <td class="${metrics.totalRealAttempts > 0 && (errors.totalErrors / metrics.totalRealAttempts) > 0.3 ? 'danger' : 'warning'}">
              ${metrics.totalRealAttempts > 0 ? ((errors.totalErrors / metrics.totalRealAttempts) * 100).toFixed(1) : 0}%
            </td>
          </tr>
          <tr>
            <th>Error Types</th>
            <td>
              ${Object.entries(errors.errorTypes || {}).map(([type, count]) => 
                `${type}: ${count} (${errors.totalErrors > 0 ? ((count / errors.totalErrors) * 100).toFixed(1) : 0}%)`
              ).join('<br>')}
            </td>
          </tr>
        </table>
      </div>
      ` : ''}
      
      <div class="metrics-card">
        <h3>Resource Usage</h3>
        <table>
          <tr>
            <th>Total Execution Time</th>
            <td>${resourceMetrics && resourceMetrics.steps ? Object.values(resourceMetrics.steps).reduce((sum, step) => sum + (step.totalExecutionTime || 0), 0) / 1000 : 0} seconds</td>
          </tr>
          <tr>
            <th>Average Execution Time</th>
            <td>${resourceMetrics && resourceMetrics.steps ? Object.values(resourceMetrics.steps).reduce((sum, step) => sum + (step.avgExecutionTime || 0), 0) / Object.keys(resourceMetrics.steps).length / 1000 || 0 : 0} seconds</td>
          </tr>
          <tr>
            <th>Estimated Memory</th>
            <td>${resourceUsage.memory} MB</td>
          </tr>
          <tr>
            <th>Estimated CPU</th>
            <td>${resourceUsage.cpu}%</td>
          </tr>
          <tr>
            <th>Efficiency Score</th>
            <td>${resourceUsage.efficiency}</td>
          </tr>
        </table>
      </div>
      
      ${cacheMetrics ? `
      <div class="metrics-card">
        <h3>Cache Metrics</h3>
        <table>
          <tr>
            <th>Hits</th>
            <td>${cacheMetrics.hits || 0}</td>
          </tr>
          <tr>
            <th>Misses</th>
            <td>${cacheMetrics.misses || 0}</td>
          </tr>
          <tr>
            <th>Hit Rate</th>
            <td class="${cacheMetrics.hitRate > 50 ? 'success' : 'warning'}">
              ${cacheMetrics.hitRate ? cacheMetrics.hitRate.toFixed(1) : 0}%
            </td>
          </tr>
          <tr>
            <th>Recommendation</th>
            <td>${cacheRecommendation.recommendation}</td>
          </tr>
        </table>
      </div>
      ` : ''}
    </div>
    
    <div class="section">
      <h2>Performance by Step</h2>
      <table>
        <tr>
          <th>Step</th>
          <th>Applicability Checks</th>
          <th>Real Attempts</th>
          <th>Not Applicable</th>
          <th>Successes</th>
          <th>Real Success Rate</th>
          <th>Average Time (s)</th>
          <th>Last Attempt</th>
          <th>Last Success</th>
        </tr>
        ${Object.entries(metrics.steps).map(([step, data]) => {
          const realSuccessRate = data.realAttempts > 0 
            ? ((data.successes / data.realAttempts) * 100).toFixed(1) + '%' 
            : '0%';
          
          return `
            <tr>
              <td>${step}</td>
              <td class="small">${data.applicabilityChecks || 0}</td>
              <td>${data.realAttempts || 0}</td>
              <td class="small">${data.notApplicableCount || 0}</td>
              <td>${data.successes || 0}</td>
              <td class="${parseFloat(realSuccessRate) > 50 ? 'success' : 'warning'}">${realSuccessRate}</td>
              <td>${data.averageExecutionTime ? (data.averageExecutionTime / 1000).toFixed(2) : 'N/A'}</td>
              <td>${data.lastAttemptedAt ? formatDate(data.lastAttemptedAt) : 'Never'}</td>
              <td>${data.lastSuccessAt ? formatDate(data.lastSuccessAt) : 'Never'}</td>
            </tr>
          `;
        }).join('')}
      </table>
    </div>
    
    ${errors && errors.errorHistory ? `
    <div class="section">
      <h2>Error History</h2>
      <div style="max-height: 300px; overflow-y: auto;">
        <table>
          <tr>
            <th>Date</th>
            <th>Step</th>
            <th>Type</th>
            <th>Message</th>
            <th>Duration (s)</th>
          </tr>
          ${errors.errorHistory.map(error => `
            <tr>
              <td>${formatDate(error.timestamp)}</td>
              <td>${error.step}</td>
              <td>${error.type}</td>
              <td>${error.message}</td>
              <td>${(error.executionTime / 1000).toFixed(2)}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
    ` : ''}
  `;
};

const generateDomainsHTMLExport = (synthesis) => {
  const chartData = {
    domains: synthesis.slice(0, 10).map(d => d.domain),
    requests: synthesis.slice(0, 10).map(d => d.totalRequests),
    successRates: synthesis.slice(0, 10).map(d => parseFloat(d.successRate)),
    jobLinkRatios: synthesis.slice(0, 10).map(d => parseFloat(d.jobLinkRatio))
  };
  
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Domain Synthesis Report - ${new Date().toLocaleDateString()}</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
          body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 20px;
              background-color: #f8f9fa;
              color: #333;
          }
          .container {
              max-width: 1200px;
              margin: 0 auto;
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          .header {
              text-align: center;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 3px solid #007bff;
          }
          .header h1 {
              color: #007bff;
              margin-bottom: 10px;
              font-size: 2.5em;
          }
          .header .subtitle {
              color: #6c757d;
              font-size: 1.1em;
          }
          .summary-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 20px;
              margin-bottom: 40px;
          }
          .summary-card {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 20px;
              border-radius: 10px;
              text-align: center;
              box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          }
          .summary-card h3 {
              margin: 0 0 10px 0;
              font-size: 0.9em;
              opacity: 0.9;
          }
          .summary-card .value {
              font-size: 2em;
              font-weight: bold;
              margin: 0;
          }
          .chart-container {
              margin: 40px 0;
              padding: 20px;
              background: #f8f9fa;
              border-radius: 10px;
              border: 2px solid #e9ecef;
          }
          .chart-title {
              text-align: center;
              margin-bottom: 20px;
              font-size: 1.4em;
              color: #495057;
              font-weight: 600;
          }
          .data-table {
              margin-top: 40px;
              overflow-x: auto;
          }
          table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
              background: white;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              border-radius: 10px;
              overflow: hidden;
          }
          th {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 15px;
              text-align: left;
              font-weight: 600;
          }
          td {
              padding: 12px 15px;
              border-bottom: 1px solid #e9ecef;
          }
          tr:nth-child(even) {
              background-color: #f8f9fa;
          }
          tr:hover {
              background-color: #e3f2fd;
              transition: background-color 0.3s;
          }
          .badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 0.8em;
              font-weight: bold;
              color: white;
          }
          .badge-success { background-color: #28a745; }
          .badge-warning { background-color: #ffc107; color: #333; }
          .badge-danger { background-color: #dc3545; }
          .footer {
              text-align: center;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 2px solid #e9ecef;
              color: #6c757d;
              font-size: 0.9em;
          }
          @media print {
              .container { box-shadow: none; margin: 0; padding: 15px; }
              .chart-container canvas { max-height: 300px; }
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>📊 Domain Analysis Report</h1>
              <div class="subtitle">Generated on ${new Date().toLocaleString()} | Top ${synthesis.length} Domains</div>
          </div>

          <div class="summary-grid">
              <div class="summary-card">
                  <h3>Total Domains</h3>
                  <div class="value">${synthesis.length}</div>
              </div>
              <div class="summary-card">
                  <h3>Total Requests</h3>
                  <div class="value">${synthesis.reduce((sum, d) => sum + d.totalRequests, 0).toLocaleString()}</div>
              </div>
              <div class="summary-card">
                  <h3>Avg Success Rate</h3>
                  <div class="value">${(synthesis.reduce((sum, d) => sum + parseFloat(d.successRate), 0) / synthesis.length).toFixed(1)}%</div>
              </div>
              <div class="summary-card">
                  <h3>Total Job Links</h3>
                  <div class="value">${synthesis.reduce((sum, d) => sum + d.jobLinks, 0).toLocaleString()}</div>
              </div>
              <div class="summary-card">
                  <h3>Most Searched</h3>
                  <div class="value" style="font-size: 1.2em;">${synthesis[0]?.domain || 'N/A'}</div>
              </div>
              <div class="summary-card">
                  <h3>Top Domain Hits</h3>
                  <div class="value">${synthesis[0]?.totalRequests || 0}</div>
              </div>
          </div>

          <div class="chart-container">
              <div class="chart-title">🔍 Top 10 Domains by Request Volume</div>
              <canvas id="requestsChart" width="400" height="200"></canvas>
          </div>

          <div class="chart-container">
              <div class="chart-title">✅ Success Rate Distribution</div>
              <canvas id="successChart" width="400" height="200"></canvas>
          </div>

          <div class="chart-container">
              <div class="chart-title">💼 Job Links Ratio Comparison</div>
              <canvas id="jobLinksChart" width="400" height="200"></canvas>
          </div>

          <div class="data-table">
              <h2>📋 Detailed Domain Analysis</h2>
              <table>
                  <thead>
                      <tr>
                          <th>Domain</th>
                          <th>Requests</th>
                          <th>Success Rate</th>
                          <th>Total Links</th>
                          <th>Job Links</th>
                          <th>Job Ratio</th>
                          <th>Avg Time (s)</th>
                          <th>Top Job Titles</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${synthesis.map(domain => `
                          <tr>
                              <td><strong>${domain.domain}</strong></td>
                              <td>${domain.totalRequests.toLocaleString()}</td>
                              <td>
                                  <span class="badge ${parseFloat(domain.successRate) > 70 ? 'badge-success' : parseFloat(domain.successRate) > 40 ? 'badge-warning' : 'badge-danger'}">
                                      ${domain.successRate}%
                                  </span>
                              </td>
                              <td>${domain.totalLinks}</td>
                              <td>${domain.jobLinks}</td>
                              <td>
                                  <span class="badge ${parseFloat(domain.jobLinkRatio) > 60 ? 'badge-success' : parseFloat(domain.jobLinkRatio) > 30 ? 'badge-warning' : 'badge-danger'}">
                                      ${domain.jobLinkRatio}%
                                  </span>
                              </td>
                              <td>${domain.avgExecutionTime}s</td>
                              <td>
                                  ${domain.topJobTitles.slice(0, 3).map(job => 
                                      `<small style="display: block; color: #6c757d;">${job.title} (${job.count})</small>`
                                  ).join('')}
                              </td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          </div>

          <div class="footer">
              <p>📈 Report generated by myJobBuddy Scraping Analytics System</p>
              <p>For technical support or questions about this data, please contact the development team.</p>
          </div>
      </div>

      <script>
          const chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: {
                      position: 'top',
                      labels: {
                          font: { size: 12 },
                          padding: 20
                      }
                  }
              },
              scales: {
                  y: {
                      beginAtZero: true,
                      grid: { color: 'rgba(0,0,0,0.1)' },
                      ticks: { font: { size: 11 } }
                  },
                  x: {
                      grid: { display: false },
                      ticks: { 
                          font: { size: 10 },
                          maxRotation: 45,
                          minRotation: 45
                      }
                  }
              }
          };

          new Chart(document.getElementById('requestsChart').getContext('2d'), {
              type: 'bar',
              data: {
                  labels: ${JSON.stringify(chartData.domains)},
                  datasets: [{
                      label: 'Number of Requests',
                      data: ${JSON.stringify(chartData.requests)},
                      backgroundColor: 'rgba(54, 162, 235, 0.8)',
                      borderColor: 'rgba(54, 162, 235, 1)',
                      borderWidth: 2,
                      borderRadius: 6,
                      borderSkipped: false
                  }]
              },
              options: {
                  ...chartOptions,
                  scales: {
                      ...chartOptions.scales,
                      y: {
                          ...chartOptions.scales.y,
                          title: {
                              display: true,
                              text: 'Number of Requests',
                              font: { size: 12, weight: 'bold' }
                          }
                      }
                  }
              }
          });

          new Chart(document.getElementById('successChart').getContext('2d'), {
              type: 'line',
              data: {
                  labels: ${JSON.stringify(chartData.domains)},
                  datasets: [{
                      label: 'Success Rate (%)',
                      data: ${JSON.stringify(chartData.successRates)},
                      backgroundColor: 'rgba(75, 192, 192, 0.2)',
                      borderColor: 'rgba(75, 192, 192, 1)',
                      borderWidth: 3,
                      fill: true,
                      tension: 0.4,
                      pointBackgroundColor: 'rgba(75, 192, 192, 1)',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                      pointRadius: 6
                  }]
              },
              options: {
                  ...chartOptions,
                  scales: {
                      ...chartOptions.scales,
                      y: {
                          ...chartOptions.scales.y,
                          max: 100,
                          title: {
                              display: true,
                              text: 'Success Rate (%)',
                              font: { size: 12, weight: 'bold' }
                          }
                      }
                  }
              }
          });

          new Chart(document.getElementById('jobLinksChart').getContext('2d'), {
              type: 'doughnut',
              data: {
                  labels: ${JSON.stringify(chartData.domains)},
                  datasets: [{
                      label: 'Job Links Ratio (%)',
                      data: ${JSON.stringify(chartData.jobLinkRatios)},
                      backgroundColor: [
                          'rgba(255, 99, 132, 0.8)',
                          'rgba(54, 162, 235, 0.8)',
                          'rgba(255, 205, 86, 0.8)',
                          'rgba(75, 192, 192, 0.8)',
                          'rgba(153, 102, 255, 0.8)',
                          'rgba(255, 159, 64, 0.8)',
                          'rgba(199, 199, 199, 0.8)',
                          'rgba(83, 102, 255, 0.8)',
                          'rgba(255, 99, 255, 0.8)',
                          'rgba(99, 255, 132, 0.8)'
                      ],
                      borderColor: [
                          'rgba(255, 99, 132, 1)',
                          'rgba(54, 162, 235, 1)',
                          'rgba(255, 205, 86, 1)',
                          'rgba(75, 192, 192, 1)',
                          'rgba(153, 102, 255, 1)',
                          'rgba(255, 159, 64, 1)',
                          'rgba(199, 199, 199, 1)',
                          'rgba(83, 102, 255, 1)',
                          'rgba(255, 99, 255, 1)',
                          'rgba(99, 255, 132, 1)'
                      ],
                      borderWidth: 2
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: {
                          position: 'right',
                          labels: {
                              font: { size: 10 },
                              padding: 15
                          }
                      },
                      tooltip: {
                          callbacks: {
                              label: function(context) {
                                  return context.label + ': ' + context.parsed + '%';
                              }
                          }
                      }
                  }
              }
          });
      </script>
  </body>
  </html>
  `;
};

const generateJobTitlesHTMLExport = (synthesis) => {
  const chartData = {
    titles: synthesis.slice(0, 15).map(j => j.title.length > 20 ? j.title.substring(0, 20) + '...' : j.title),
    counts: synthesis.slice(0, 15).map(j => j.count),
    domainCounts: synthesis.slice(0, 15).map(j => j.domainsCount)
  };
  
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Job Titles Analysis Report - ${new Date().toLocaleDateString()}</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
          body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #333;
              min-height: 100vh;
          }
          .container {
              max-width: 1200px;
              margin: 0 auto;
              background: white;
              padding: 30px;
              border-radius: 15px;
              box-shadow: 0 0 30px rgba(0,0,0,0.2);
          }
          .header {
              text-align: center;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 3px solid #ff6b6b;
          }
          .header h1 {
              color: #ff6b6b;
              margin-bottom: 10px;
              font-size: 2.5em;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
          }
          .header .subtitle {
              color: #6c757d;
              font-size: 1.1em;
          }
          .summary-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 20px;
              margin-bottom: 40px;
          }
          .summary-card {
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
              padding: 25px;
              border-radius: 15px;
              text-align: center;
              box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3);
              transform: translateY(0);
              transition: transform 0.3s ease;
          }
          .summary-card:hover {
              transform: translateY(-5px);
          }
          .summary-card h3 {
              margin: 0 0 15px 0;
              font-size: 1em;
              opacity: 0.9;
          }
          .summary-card .value {
              font-size: 2.2em;
              font-weight: bold;
              margin: 0;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
          }
          .chart-container {
              margin: 40px 0;
              padding: 25px;
              background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
              border-radius: 15px;
              border: 2px solid #dee2e6;
              box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          }
          .chart-title {
              text-align: center;
              margin-bottom: 25px;
              font-size: 1.5em;
              color: #495057;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
          }
          .data-table {
              margin-top: 40px;
              overflow-x: auto;
          }
          table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
              background: white;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              border-radius: 15px;
              overflow: hidden;
          }
          th {
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: white;
              padding: 18px;
              text-align: left;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              font-size: 0.9em;
          }
          td {
              padding: 15px 18px;
              border-bottom: 1px solid #e9ecef;
              vertical-align: top;
          }
          tr:nth-child(even) {
              background: linear-gradient(90deg, #f8f9fa 0%, #ffffff 100%);
          }
          tr:hover {
              background: linear-gradient(90deg, #fff3cd 0%, #ffffff 100%);
              transition: background 0.3s ease;
          }
          .badge {
              display: inline-block;
              padding: 6px 12px;
              border-radius: 20px;
              font-size: 0.8em;
              font-weight: bold;
              color: white;
              margin: 2px;
          }
          .badge-primary { background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); }
          .badge-success { background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); }
          .badge-warning { background: linear-gradient(135deg, #ffc107 0%, #d39e00 100%); color: #333; }
          .badge-info { background: linear-gradient(135deg, #17a2b8 0%, #117a8b 100%); }
          .footer {
              text-align: center;
              margin-top: 50px;
              padding-top: 30px;
              border-top: 3px solid #e9ecef;
              color: #6c757d;
              font-size: 0.9em;
          }
          .job-title-highlight {
              font-weight: 600;
              color: #495057;
          }
          .variation-list {
              font-size: 0.85em;
              color: #6c757d;
              margin-top: 5px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>💼 Job Titles Analysis Report</h1>
              <div class="subtitle">Generated on ${new Date().toLocaleString()} | Top ${synthesis.length} Job Titles</div>
          </div>

          <div class="summary-grid">
              <div class="summary-card">
                  <h3>Total Job Titles</h3>
                  <div class="value">${synthesis.length}</div>
              </div>
              <div class="summary-card">
                  <h3>Total Searches</h3>
                  <div class="value">${synthesis.reduce((sum, j) => sum + j.count, 0).toLocaleString()}</div>
              </div>
              <div class="summary-card">
                  <h3>Most Searched Title</h3>
                  <div class="value" style="font-size: 1.4em;">${synthesis[0]?.title || 'N/A'}</div>
              </div>
              <div class="summary-card">
                  <h3>Top Title Count</h3>
                  <div class="value">${synthesis[0]?.count || 0}</div>
              </div>
          </div>

          <div class="chart-container">
              <div class="chart-title">🏆 Top 15 Most Searched Job Titles</div>
              <canvas id="jobTitlesChart" width="400" height="300"></canvas>
          </div>

          <div class="chart-container">
              <div class="chart-title">🌐 Domain Distribution per Job Title</div>
              <canvas id="domainDistributionChart" width="400" height="300"></canvas>
          </div>

          <div class="data-table">
              <h2>📊 Detailed Job Titles Analysis</h2>
              <table>
                  <thead>
                      <tr>
                          <th>Rank</th>
                          <th>Job Title</th>
                          <th>Search Count</th>
                          <th>Domains</th>
                          <th>Percentage</th>
                          <th>Variations Found</th>
                          <th>Associated Domains</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${synthesis.map((job, index) => `
                          <tr>
                              <td><strong>#${index + 1}</strong></td>
                              <td class="job-title-highlight">${job.title}</td>
                              <td><span class="badge badge-primary">${job.count}</span></td>
                              <td><span class="badge badge-success">${job.domainsCount}</span></td>
                              <td><span class="badge badge-warning">${job.percentage}%</span></td>
                              <td>
                                  <div class="variation-list">
                                      ${job.variations.map(variation => `<span class="badge badge-info">${variation}</span>`).join(' ')}
                                  </div>
                              </td>
                              <td>
                                  <div class="variation-list">
                                      ${job.domains.slice(0, 5).map(domain => `<small style="display: block; margin-bottom: 2px;">• ${domain}</small>`).join('')}
                                      ${job.domains.length > 5 ? `<small style="color: #007bff;">... and ${job.domains.length - 5} more</small>` : ''}
                                  </div>
                              </td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          </div>

          <div class="footer">
              <p>💼 Job Titles Report generated by myJobBuddy Analytics</p>
              <p>This data reflects user search patterns and job market trends across ${synthesis.reduce((sum, j) => sum + j.domainsCount, 0)} unique domains.</p>
          </div>
      </div>

      <script>
          const chartOptions = {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                  legend: {
                      position: 'top',
                      labels: {
                          font: { size: 12 },
                          padding: 20,
                          usePointStyle: true
                      }
                  }
              }
          };

          new Chart(document.getElementById('jobTitlesChart').getContext('2d'), {
              type: 'bar',
              data: {
                  labels: ${JSON.stringify(chartData.titles)},
                  datasets: [{
                      label: 'Number of Searches',
                      data: ${JSON.stringify(chartData.counts)},
                      backgroundColor: [
                          'rgba(255, 99, 132, 0.8)',
                          'rgba(54, 162, 235, 0.8)',
                          'rgba(255, 205, 86, 0.8)',
                          'rgba(75, 192, 192, 0.8)',
                          'rgba(153, 102, 255, 0.8)',
                          'rgba(255, 159, 64, 0.8)',
                          'rgba(199, 199, 199, 0.8)',
                          'rgba(83, 102, 255, 0.8)',
                          'rgba(255, 99, 255, 0.8)',
                          'rgba(99, 255, 132, 0.8)',
                          'rgba(255, 165, 0, 0.8)',
                          'rgba(128, 0, 128, 0.8)',
                          'rgba(255, 20, 147, 0.8)',
                          'rgba(0, 191, 255, 0.8)',
                          'rgba(50, 205, 50, 0.8)'
                      ],
                      borderColor: 'rgba(255, 255, 255, 0.8)',
                      borderWidth: 2,
                      borderRadius: 8
                  }]
              },
              options: {
                  ...chartOptions,
                  scales: {
                      x: {
                          beginAtZero: true,
                          grid: { color: 'rgba(0,0,0,0.1)' },
                          title: {
                              display: true,
                              text: 'Number of Searches',
                              font: { size: 12, weight: 'bold' }
                          }
                      },
                      y: {
                          grid: { display: false },
                          ticks: { font: { size: 10 } }
                      }
                  }
              }
          });

          new Chart(document.getElementById('domainDistributionChart').getContext('2d'), {
              type: 'bar',
              data: {
                  labels: ${JSON.stringify(chartData.titles)},
                  datasets: [{
                      label: 'Number of Domains',
                      data: ${JSON.stringify(chartData.domainCounts)},
                      backgroundColor: 'rgba(75, 192, 192, 0.6)',
                      borderColor: 'rgba(75, 192, 192, 1)',
                      borderWidth: 2,
                      borderRadius: 6,
                      borderSkipped: false
                  }]
              },
              options: {
                  ...chartOptions,
                  scales: {
                      y: {
                          beginAtZero: true,
                          grid: { color: 'rgba(0,0,0,0.1)' },
                          title: {
                              display: true,
                              text: 'Number of Domains',
                              font: { size: 12, weight: 'bold' }
                          }
                      },
                      x: {
                          grid: { display: false },
                          ticks: { 
                              font: { size: 9 },
                              maxRotation: 45,
                              minRotation: 45
                          }
                      }
                  }
              }
          });
      </script>
  </body>
  </html>
  `;
};

const generateErrorsHTMLExport = (synthesis) => {
  const chartData = {
    domains: synthesis.domains.slice(0, 10).map(d => d.domain),
    errorCounts: synthesis.domains.slice(0, 10).map(d => d.realErrors),
    errorRates: synthesis.domains.slice(0, 10).map(d => parseFloat(d.errorRate)),
    errorTypes: synthesis.errorTypesSummary.slice(0, 8).map(e => e.type),
    errorTypeCounts: synthesis.errorTypesSummary.slice(0, 8).map(e => e.count)
  };
  
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Critical Errors Analysis Report - ${new Date().toLocaleDateString()}</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
          body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 20px;
              background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
              color: #333;
              min-height: 100vh;
          }
          .container {
              max-width: 1200px;
              margin: 0 auto;
              background: white;
              padding: 30px;
              border-radius: 15px;
              box-shadow: 0 0 30px rgba(0,0,0,0.3);
          }
          .header {
              text-align: center;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 4px solid #dc3545;
          }
          .header h1 {
              color: #dc3545;
              margin-bottom: 10px;
              font-size: 2.5em;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
          }
          .alert-banner {
              background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
              border: 2px solid #ffc107;
              border-radius: 10px;
              padding: 20px;
              margin-bottom: 30px;
              text-align: center;
          }
          .alert-banner h3 {
              color: #856404;
              margin: 0 0 10px 0;
          }
          .summary-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 20px;
              margin-bottom: 40px;
          }
          .summary-card {
              background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
              color: white;
              padding: 25px;
              border-radius: 15px;
              text-align: center;
              box-shadow: 0 8px 25px rgba(220, 53, 69, 0.4);
              position: relative;
              overflow: hidden;
          }
          .summary-card::before {
              content: '';
              position: absolute;
              top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
              transition: left 0.5s;
          }
          .summary-card:hover::before {
              left: 100%;
          }
          .summary-card h3 {
              margin: 0 0 15px 0;
              font-size: 1em;
              opacity: 0.9;
              position: relative;
              z-index: 1;
          }
          .summary-card .value {
              font-size: 2.2em;
              font-weight: bold;
              margin: 0;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
              position: relative;
              z-index: 1;
          }
          .chart-container {
              margin: 40px 0;
              padding: 25px;
              background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
              border-radius: 15px;
              border: 2px solid #dee2e6;
              box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          }
          .chart-title {
              text-align: center;
              margin-bottom: 25px;
              font-size: 1.5em;
              color: #495057;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 1px;
          }
          .critical-section {
              background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
              border: 2px solid #f8d7da;
              border-radius: 15px;
              padding: 25px;
              margin: 30px 0;
          }
          table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
              background: white;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              border-radius: 15px;
              overflow: hidden;
          }
          th {
              background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
              color: white;
              padding: 18px;
              text-align: left;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              font-size: 0.9em;
          }
          td {
              padding: 15px 18px;
              border-bottom: 1px solid #e9ecef;
              vertical-align: top;
          }
          tr:nth-child(even) {
              background: linear-gradient(90deg, #fff5f5 0%, #ffffff 100%);
          }
          tr:hover {
              background: linear-gradient(90deg, #ffebee 0%, #ffffff 100%);
              transition: background 0.3s ease;
          }
          .badge {
              display: inline-block;
              padding: 6px 12px;
              border-radius: 20px;
              font-size: 0.8em;
              font-weight: bold;
              color: white;
              margin: 2px;
          }
          .badge-danger { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); }
          .badge-warning { background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%); color: #333; }
          .badge-critical { 
              background: linear-gradient(135deg, #6f42c1 0%, #5a2d91 100%);
              animation: pulse 2s infinite;
          }
          @keyframes pulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.05); }
              100% { transform: scale(1); }
          }
          .error-type-list {
              font-size: 0.85em;
              color: #6c757d;
          }
          .footer {
              text-align: center;
              margin-top: 50px;
              padding-top: 30px;
              border-top: 3px solid #e9ecef;
              color: #6c757d;
              font-size: 0.9em;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <h1>🚨 Critical Errors Analysis Report</h1>
              <div class="subtitle">Generated on ${new Date().toLocaleString()}</div>
          </div>

          ${synthesis.totalCriticalErrors > 0 ? `
              <div class="alert-banner">
                  <h3>⚠️ Action Required</h3>
                  <p><strong>${synthesis.totalCriticalErrors} critical errors</strong> detected across <strong>${synthesis.domains.length} domains</strong>. 
                  Review and address high-priority issues to improve scraping performance.</p>
              </div>
          ` : `
              <div class="alert-banner" style="background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); border-color: #28a745;">
                  <h3 style="color: #155724;">✅ System Health: Excellent</h3>
                  <p>No critical errors detected. All scraping operations are running smoothly!</p>
              </div>
          `}

          <div class="summary-grid">
              <div class="summary-card">
                  <h3>Total Critical Errors</h3>
                  <div class="value">${synthesis.totalCriticalErrors}</div>
              </div>
              <div class="summary-card">
                  <h3>Problematic Domains</h3>
                  <div class="value">${synthesis.domains.length}</div>
              </div>
              <div class="summary-card">
                  <h3>Avg Error Rate</h3>
                  <div class="value">${synthesis.domains.length > 0 ? (synthesis.domains.reduce((sum, d) => sum + parseFloat(d.errorRate), 0) / synthesis.domains.length).toFixed(1) : 0}%</div>
              </div>
              <div class="summary-card">
                  <h3>Most Problematic</h3>
                  <div class="value" style="font-size: 1.2em;">${synthesis.domains[0]?.domain || 'None'}</div>
              </div>
              <div class="summary-card">
                  <h3>Top Error Type</h3>
                  <div class="value" style="font-size: 1.1em;">${synthesis.errorTypesSummary[0]?.type || 'None'}</div>
              </div>
              <div class="summary-card">
                  <h3>Highest Error Count</h3>
                  <div class="value">${synthesis.domains[0]?.realErrors || 0}</div>
              </div>
          </div>

          ${synthesis.totalCriticalErrors > 0 ? `
              <div class="chart-container">
                  <div class="chart-title">🔴 Top 10 Domains by Error Count</div>
                  <canvas id="errorDomainsChart" width="400" height="250"></canvas>
              </div>

              <div class="chart-container">
                  <div class="chart-title">📊 Error Rate Distribution</div>
                  <canvas id="errorRatesChart" width="400" height="250"></canvas>
              </div>

              <div class="chart-container">
                  <div class="chart-title">🏷️ Error Types Distribution</div>
                  <canvas id="errorTypesChart" width="400" height="250"></canvas>
              </div>

              <div class="critical-section">
                  <h2>🚨 Critical Domains Requiring Attention</h2>
                  <table>
                      <thead>
                          <tr>
                              <th>Priority</th>
                              <th>Domain</th>
                              <th>Critical Errors</th>
                              <th>Error Rate</th>
                              <th>Total Attempts</th>
                              <th>Error Types</th>
                              <th>Last Error</th>
                              <th>Complexity</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${synthesis.domains.map((domain, index) => `
                              <tr>
                                  <td>
                                      <span class="badge ${index < 3 ? 'badge-critical' : index < 7 ? 'badge-danger' : 'badge-warning'}">
                                          ${index < 3 ? 'HIGH' : index < 7 ? 'MEDIUM' : 'LOW'}
                                      </span>
                                  </td>
                                  <td><strong>${domain.domain}</strong></td>
                                  <td>
                                      <span class="badge badge-danger">${domain.realErrors}</span>
                                  </td>
                                  <td>
                                      <span class="badge ${parseFloat(domain.errorRate) > 70 ? 'badge-critical' : parseFloat(domain.errorRate) > 40 ? 'badge-danger' : 'badge-warning'}">
                                          ${domain.errorRate}%
                                      </span>
                                  </td>
                                  <td>${domain.totalAttempts}</td>
                                  <td>
                                      <div class="error-type-list">
                                          ${Object.entries(domain.errorTypes).map(([type, count]) => 
                                              `<div style="margin-bottom: 2px;"><strong>${type}:</strong> ${count}</div>`
                                          ).join('')}
                                      </div>
                                  </td>
                                  <td style="font-size: 0.85em;">${domain.lastError ? new Date(domain.lastError).toLocaleString() : 'Unknown'}</td>
                                  <td>
                                      <span class="badge badge-warning">${domain.complexityScore}/100</span>
                                      <div style="font-size: 0.8em; color: #6c757d; margin-top: 5px;">${domain.step}</div>
                                  </td>
                              </tr>
                          `).join('')}
                      </tbody>
                  </table>
              </div>
          ` : `
              <div class="critical-section" style="background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); border-color: #28a745;">
                  <h2 style="color: #155724;">🎉 No Critical Errors Detected!</h2>
                  <p style="color: #155724; font-size: 1.1em;">Your scraping system is operating at peak performance. All domains are functioning correctly without critical errors.</p>
                  <p style="color: #155724;"><strong>Recommendation:</strong> Continue monitoring for any new issues and maintain regular system health checks.</p>
              </div>
          `}

          <div class="footer">
              <p>🔍 Critical Errors Report generated by myJobBuddy Error Monitoring System</p>
              <p><strong>Note:</strong> Only real errors are included. Normal operational messages like "StepNotApplicable" are excluded.</p>
          </div>
      </div>

      ${synthesis.totalCriticalErrors > 0 ? `
      <script>
          new Chart(document.getElementById('errorDomainsChart').getContext('2d'), {
              type: 'bar',
              data: {
                  labels: ${JSON.stringify(chartData.domains)},
                  datasets: [{
                      label: 'Number of Critical Errors',
                      data: ${JSON.stringify(chartData.errorCounts)},
                      backgroundColor: 'rgba(220, 53, 69, 0.8)',
                      borderColor: 'rgba(220, 53, 69, 1)',
                      borderWidth: 2,
                      borderRadius: 6
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: true } },
                  scales: {
                      y: { 
                          beginAtZero: true,
                          title: { display: true, text: 'Critical Errors Count' }
                      },
                      x: { 
                          ticks: { maxRotation: 45, minRotation: 45 }
                      }
                  }
              }
          });

          new Chart(document.getElementById('errorRatesChart').getContext('2d'), {
              type: 'line',
              data: {
                  labels: ${JSON.stringify(chartData.domains)},
                  datasets: [{
                      label: 'Error Rate (%)',
                      data: ${JSON.stringify(chartData.errorRates)},
                      backgroundColor: 'rgba(255, 99, 132, 0.2)',
                      borderColor: 'rgba(255, 99, 132, 1)',
                      borderWidth: 3,
                      fill: true,
                      tension: 0.4,
                      pointBackgroundColor: 'rgba(255, 99, 132, 1)',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                      pointRadius: 6
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                      y: { 
                          beginAtZero: true,
                          max: 100,
                          title: { display: true, text: 'Error Rate (%)' }
                      }
                  }
              }
          });

          new Chart(document.getElementById('errorTypesChart').getContext('2d'), {
              type: 'pie',
              data: {
                  labels: ${JSON.stringify(chartData.errorTypes)},
                  datasets: [{
                      data: ${JSON.stringify(chartData.errorTypeCounts)},
                      backgroundColor: [
                          'rgba(220, 53, 69, 0.8)',
                          'rgba(255, 99, 132, 0.8)',
                          'rgba(255, 159, 64, 0.8)',
                          'rgba(255, 205, 86, 0.8)',
                          'rgba(75, 192, 192, 0.8)',
                          'rgba(54, 162, 235, 0.8)',
                          'rgba(153, 102, 255, 0.8)',
                          'rgba(201, 203, 207, 0.8)'
                      ]
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'right' }
                  }
              }
          });
      </script>
      ` : ''}
  </body>
  </html>
  `;
};

const getCSS = () => {
  return `
    .score-badge { display: inline-block; padding: 5px 10px; border-radius: 20px; color: white; font-weight: bold; }
    .score-easy { background-color: #4CAF50; }
    .score-moderate { background-color: #8BC34A; }
    .score-medium { background-color: #FFC107; }
    .score-hard { background-color: #FF9800; }
    .score-very-hard { background-color: #F44336; }
    .bar-chart { min-height: 200px; }
    .bar { position: relative; }
    .language-badge { background-color: #17a2b8; color: white; padding: 3px 8px; border-radius: 12px; font-size: 11px; }
    .empty-state { text-align: center; padding: 40px; background-color: #f8f9fa; border-radius: 8px; }
    .export-section { background-color: #f8f9fa; padding: 10px; border-radius: 5px; border: 1px solid #dee2e6; }
    .export-buttons button { margin: 0 5px; }
    .export-buttons button:hover { transform: translateY(-2px); transition: transform 0.2s; }
  `;
};

const getJS = () => {
  return `
    function exportSynthesis(type) {
      const limit = document.getElementById('export-limit').value;
      const url = '/debug/stats/export/synthesis/' + type + '?limit=' + limit;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = type + '-synthesis-' + Date.now() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showExportNotification(type, limit);
    }
    
    function exportSynthesisHTML(type) {
      const limit = document.getElementById('export-limit').value;
      const url = '/debug/stats/export/synthesis/' + type + '/html?limit=' + limit;
      
      window.open(url, '_blank');
      showExportNotification(type + ' HTML', limit);
    }
    
    function showExportNotification(type, limit) {
      const notification = document.createElement('div');
      notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 15px 20px; border-radius: 5px; z-index: 9999; font-weight: bold;';
      notification.textContent = 'Export ' + type + ' (' + limit + ' items) started...';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 3000);
    }
  
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('.domain-toggle').forEach(btn => {
        btn.addEventListener('click', function() {
          const domainId = this.getAttribute('data-domain');
          const detailsRow = document.getElementById('domain-details-' + domainId);
          
          if (detailsRow.style.display === 'none' || !detailsRow.style.display) {
            detailsRow.style.display = 'table-row';
            this.textContent = '▼ Details';
          } else {
            detailsRow.style.display = 'none';
            this.textContent = '► Details';
          }
        });
      });
      
      const urlParams = new URLSearchParams(window.location.search);
      const activeTab = urlParams.get('tab');
      if (activeTab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        const tabBtn = document.querySelector('[data-tab="tab-' + activeTab + '"]');
        const tabContent = document.getElementById('tab-' + activeTab);
        
        if (tabBtn && tabContent) {
          tabBtn.classList.add('active');
          tabContent.classList.add('active');
        }
      }
    });
  `;
};

module.exports = {
    generateMainTemplate,
    generateOverviewTab,
    generateDomainsTab,
    generateLinksTab,
    generateErrorsTab,
    generateResourcesTab,
    generateCacheTab,
    generateDomainDetailTemplate,
    generateDomainsHTMLExport,
    generateJobTitlesHTMLExport,
    generateErrorsHTMLExport,
    getCSS,
    getJS
  };
  