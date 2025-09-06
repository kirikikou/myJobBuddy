const config = require('../../config');
const express = require('express');
const { scrapeCareerPage } = require('../../scrapingService');
const { getCachedData, saveCache } = require('../../cacheManager');
const { createBaseLayout, createBreadcrumb } = require('./utils/htmlTemplates');
const { formatDate, formatFileSize, formatDuration, createUrlPreview } = require('./utils/formatters');
const { validateUrl, validateCacheParams } = require('./utils/validators');

const router = express.Router();

router.get('/test', async (req, res) => {
  if (!req.query.url) {
    const breadcrumb = createBreadcrumb([
      { label: 'Debug', url: '/debug' },
      { label: 'Scraping Test', url: '/debug/scraping/test' }
    ]);
    
    const content = `
      ${breadcrumb}
      
      <h1>Scraping Test</h1>
      
      <div class="section">
        <h2>Test URL Scraping</h2>
        <p>Enter a URL to test the scraping functionality. You can choose to use cached data if available or force a fresh scrape.</p>
        
        <form action="/debug/scraping/test" method="get">
          <div class="filter-group" style="margin-bottom: 15px;">
            <label for="url">URL to scrape:</label>
            <input type="text" id="url" name="url" placeholder="https://www.example.com/careers" required style="width: 100%; padding: 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 16px;">
          </div>
          
          <div class="filter-group" style="margin-bottom: 15px;">
            <label for="useCache">Cache Usage:</label>
            <select id="useCache" name="useCache" style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
              <option value="true">Use cache if available</option>
              <option value="false">Force fresh scrape</option>
            </select>
          </div>
          
          <div class="filter-group" style="margin-bottom: 15px;">
            <label for="timeout">Timeout (seconds):</label>
            <input type="number" id="timeout" name="timeout" value="60" min="10" max="300" style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
          </div>
          
          <div class="actions">
            <button type="submit" class="button">Start Scraping</button>
            <a href="/debug" class="button secondary">Back to Debug</a>
          </div>
        </form>
      </div>
      
      <div class="section">
        <h2>Recent Tests</h2>
        <p class="small">Quick access to recently tested URLs</p>
        <div id="recent-tests">
          <p class="small">No recent tests found. Test a URL to see it appear here.</p>
        </div>
      </div>
    `;
    
    const additionalJS = `
      const form = document.querySelector('form');
      const submitBtn = form.querySelector('button[type="submit"]');
      
      form.addEventListener('submit', function(e) {
        const url = document.getElementById('url').value.trim();
        if (!url) {
          e.preventDefault();
          alert('Please enter a URL');
          return;
        }
        
        try {
          new URL(url);
        } catch (error) {
          e.preventDefault();
          alert('Please enter a valid URL');
          return;
        }
        
        submitBtn.textContent = 'Scraping...';
        submitBtn.disabled = true;
        
        const recentTests = JSON.parse(localStorage.getItem('recentScrapingTests') || '[]');
        if (!recentTests.includes(url)) {
          recentTests.unshift(url);
          if (recentTests.length > 5) recentTests.pop();
          localStorage.setItem('recentScrapingTests', JSON.stringify(recentTests));
        }
      });
      
      function loadRecentTests() {
        const recentTests = JSON.parse(localStorage.getItem('recentScrapingTests') || '[]');
        const container = document.getElementById('recent-tests');
        
        if (recentTests.length > 0) {
          container.innerHTML = recentTests.map(url => 
            '<div style="margin: 5px 0;"><a href="/debug/scraping/test?url=' + encodeURIComponent(url) + '" class="button secondary" style="display: inline-block; margin-right: 10px; padding: 5px 10px; font-size: 12px;">' + url.substring(0, 60) + (url.length > 60 ? '...' : '') + '</a></div>'
          ).join('');
        }
      }
      
      loadRecentTests();
    `;
    
    const html = createBaseLayout('Scraping Test - Debug Tools', content, '', additionalJS);
    return res.send(html);
  }
  
  try {
    const urlValidation = validateUrl(req.query.url);
    if (!urlValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: urlValidation.error
      });
    }
    
    const cacheValidation = validateCacheParams(req.query);
    if (!cacheValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cache parameters',
        errors: cacheValidation.errors
      });
    }
    
    const url = req.query.url;
    const useCache = req.query.useCache !== 'false';
    const timeout = parseInt(req.query.timeout) || 60;
    
    config.smartLog('buffer',`[ScrapingTest] Testing scraping for ${url} (useCache: ${useCache}, timeout: ${timeout}s)`);
    
    const startTime = Date.now();
    let result;
    let source = 'fresh';
    
    if (useCache) {
      result = await getCachedData(url);
      if (result) {
        config.smartLog('buffer',`[ScrapingTest] Cache hit for ${url}`);
        source = 'cache';
      } else {
        config.smartLog('buffer',`[ScrapingTest] Cache miss for ${url}`);
      }
    }
    
    if (!result) {
      config.smartLog('buffer',`[ScrapingTest] Starting fresh scrape for ${url}`);
      
      const scrapingOptions = {
        timeout: timeout * 1000,
        maxRetries: 2,
        enableDebug: true
      };
      
      try {
        result = await scrapeCareerPage(url, scrapingOptions);
        source = 'fresh';
        
        if (result && useCache) {
          await saveCache(url, result);
          config.smartLog('buffer',`[ScrapingTest] Result cached for ${url}`);
        }
      } catch (scrapingError) {
        config.smartLog('fail',`[ScrapingTest] Scraping failed for ${url}:`, scrapingError.message);
        
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('text/html')) {
          const breadcrumb = createBreadcrumb([
            { label: 'Debug', url: '/debug' },
            { label: 'Scraping Test', url: '/debug/scraping/test' },
            { label: 'Error', url: '#' }
          ]);
          
          const content = `
            ${breadcrumb}
            
            <h1>Scraping Error</h1>
            
            <div class="section">
              <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 15px; margin: 20px 0;">
                <h3 style="color: #721c24; margin-top: 0;">Scraping Failed</h3>
                <p><strong>URL:</strong> ${url}</p>
                <p><strong>Error:</strong> ${scrapingError.message}</p>
                <p><strong>Duration:</strong> ${formatDuration(Date.now() - startTime)}</p>
              </div>
              
              <div class="actions">
                <a href="/debug/scraping/test?url=${encodeURIComponent(url)}&useCache=false" class="button">Retry without Cache</a>
                <a href="/debug/scraping/test" class="button secondary">Try Another URL</a>
                <a href="/debug/stats" class="button secondary">View Statistics</a>
              </div>
            </div>
          `;
          
          const html = createBaseLayout('Scraping Error - Debug Tools', content);
          return res.send(html);
        } else {
          return res.status(500).json({
            success: false,
            message: scrapingError.message,
            url: url,
            duration: Date.now() - startTime,
            source: 'error'
          });
        }
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    if (!result) {
      const acceptHeader = req.headers.accept || '';
      if (acceptHeader.includes('text/html')) {
        const breadcrumb = createBreadcrumb([
          { label: 'Debug', url: '/debug' },
          { label: 'Scraping Test', url: '/debug/scraping/test' },
          { label: 'No Result', url: '#' }
        ]);
        
        const content = `
          ${breadcrumb}
          
          <h1>No Scraping Result</h1>
          
          <div class="section">
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; padding: 15px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">No Data Retrieved</h3>
              <p>The scraping process completed but no usable data was extracted from the URL.</p>
              <p><strong>URL:</strong> ${url}</p>
              <p><strong>Duration:</strong> ${formatDuration(executionTime)}</p>
            </div>
            
            <div class="actions">
              <a href="/debug/scraping/test?url=${encodeURIComponent(url)}&useCache=false" class="button">Retry without Cache</a>
              <a href="/debug/scraping/test" class="button secondary">Try Another URL</a>
              <a href="/debug/stats" class="button secondary">View Statistics</a>
            </div>
          </div>
        `;
        
        const html = createBaseLayout('No Scraping Result - Debug Tools', content);
        return res.send(html);
      } else {
        return res.status(404).json({
          success: false,
          message: `No usable data extracted from ${url}`,
          url: url,
          duration: executionTime,
          source: source
        });
      }
    }
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Scraping Test', url: '/debug/scraping/test' },
        { label: 'Result', url: '#' }
      ]);
      
      const textPreview = result.text ? result.text.substring(0, 500) + (result.text.length > 500 ? '...' : '') : 'No text content';
      const linksPreview = result.links ? result.links.slice(0, 10) : [];
      
      const content = `
        ${breadcrumb}
        
        <h1>Scraping Result</h1>
        
        <div class="actions">
          <a href="/debug/scraping/test" class="button secondary">Test Another URL</a>
          <a href="/debug/stats" class="button secondary">View Statistics</a>
          <button onclick="downloadResult()" class="button secondary">Download JSON</button>
        </div>
        
        <div class="section">
          <h2>Summary</h2>
          <div class="metrics-grid">
            <div class="metrics-card">
              <h3>Basic Info</h3>
              <table>
                <tr>
                  <th>URL</th>
                  <td><a href="${url}" target="_blank">${createUrlPreview(url, 60)}</a></td>
                </tr>
                <tr>
                  <th>Source</th>
                  <td class="${source === 'cache' ? 'success' : ''}">${source === 'cache' ? 'Cache Hit' : 'Fresh Scrape'}</td>
                </tr>
                <tr>
                  <th>Duration</th>
                  <td>${formatDuration(executionTime)}</td>
                </tr>
                <tr>
                  <th>Method</th>
                  <td>${result.method || 'Unknown'}</td>
                </tr>
                <tr>
                  <th>Platform</th>
                  <td>${result.detectedPlatform || 'Generic'}</td>
                </tr>
                <tr>
                  <th>Language</th>
                  <td>${result.detectedLanguage || 'Unknown'}</td>
                </tr>
              </table>
            </div>
            
            <div class="metrics-card">
              <h3>Content Stats</h3>
              <table>
                <tr>
                  <th>Title</th>
                  <td>${result.title || 'No title'}</td>
                </tr>
                <tr>
                  <th>Text Length</th>
                  <td>${result.text ? result.text.length.toLocaleString() + ' characters' : '0 characters'}</td>
                </tr>
                <tr>
                  <th>Links Found</th>
                  <td>${result.links ? result.links.length : 0}</td>
                </tr>
                <tr>
                  <th>Job Links</th>
                  <td>${result.links ? result.links.filter(link => link.isJobPosting).length : 0}</td>
                </tr>
                <tr>
                  <th>Scraped At</th>
                  <td>${formatDate(result.scrapedAt)}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>Content Preview</h2>
          <h3>Text Content (first 500 characters)</h3>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 13px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;">${textPreview}</div>
        </div>
        
        ${linksPreview.length > 0 ? `
        <div class="section">
          <h2>Links Found (first 10)</h2>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Text</th>
                  <th>URL</th>
                  <th>Type</th>
                  <th>Job Related</th>
                </tr>
              </thead>
              <tbody>
                ${linksPreview.map(link => `
                  <tr>
                    <td>${link.text || 'No text'}</td>
                    <td><a href="${link.url}" target="_blank">${createUrlPreview(link.url, 50)}</a></td>
                    <td>${link.linkType || 'general'}</td>
                    <td class="${link.isJobPosting ? 'success' : ''}">${link.isJobPosting ? 'Yes' : 'No'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${result.links.length > 10 ? `<p class="small">Showing 10 of ${result.links.length} total links</p>` : ''}
        </div>
        ` : ''}
        
        <div class="section">
          <h2>Technical Details</h2>
          <details>
            <summary style="cursor: pointer; padding: 10px; background: #f8f9fa; border-radius: 4px;">View Full JSON Result</summary>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 4px; overflow: auto; max-height: 400px; margin-top: 10px;">${JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      `;
      
      const additionalJS = `
        function downloadResult() {
          const result = ${JSON.stringify(result)};
          const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'scraping-result-' + new Date().toISOString().split('T')[0] + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      `;
      
      const html = createBaseLayout('Scraping Result - Debug Tools', content, '', additionalJS);
      res.send(html);
    } else {
      res.json({
        success: true,
        source: source,
        url: url,
        duration: executionTime,
        result: result
      });
    }
  } catch (error) {
    config.smartLog('fail',`[ScrapingTest] Error:`, error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
});

router.get('/history', async (req, res) => {
  try {
    const breadcrumb = createBreadcrumb([
      { label: 'Debug', url: '/debug' },
      { label: 'Scraping History', url: '/debug/scraping/history' }
    ]);
    
    const content = `
      ${breadcrumb}
      
      <h1>Scraping Test History</h1>
      
      <div class="actions">
        <a href="/debug/scraping/test" class="button">New Test</a>
        <a href="/debug" class="button secondary">Back to Debug</a>
      </div>
      
      <div class="section">
        <h2>Recent Tests</h2>
        <p class="small">History is stored locally in your browser</p>
        
        <div id="history-container">
          <div class="loading">Loading history...</div>
        </div>
      </div>
    `;
    
    const additionalJS = `
      function loadHistory() {
        const recentTests = JSON.parse(localStorage.getItem('recentScrapingTests') || '[]');
        const container = document.getElementById('history-container');
        
        if (recentTests.length === 0) {
          container.innerHTML = '<div class="empty-state"><h3>No test history</h3><p>Run some scraping tests to see them appear here.</p></div>';
          return;
        }
        
        const historyHtml = recentTests.map((url, index) => 
          '<div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 10px 0; border: 1px solid #dee2e6;">' +
            '<div style="display: flex; justify-content: between; align-items: center;">' +
              '<div style="flex: 1;">' +
                '<strong>' + url.substring(0, 80) + (url.length > 80 ? '...' : '') + '</strong>' +
              '</div>' +
              '<div style="margin-left: 20px;">' +
                '<a href="/debug/scraping/test?url=' + encodeURIComponent(url) + '" class="button" style="margin-right: 10px;">Test Again</a>' +
                '<button onclick="removeFromHistory(' + index + ')" class="button danger" style="padding: 5px 10px; font-size: 12px;">Remove</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        ).join('');
        
        container.innerHTML = historyHtml + 
          '<div class="actions" style="margin-top: 20px;">' +
            '<button onclick="clearHistory()" class="button danger">Clear All History</button>' +
          '</div>';
      }
      
      function removeFromHistory(index) {
        const recentTests = JSON.parse(localStorage.getItem('recentScrapingTests') || '[]');
        recentTests.splice(index, 1);
        localStorage.setItem('recentScrapingTests', JSON.stringify(recentTests));
        loadHistory();
      }
      
      function clearHistory() {
        if (confirm('Are you sure you want to clear all test history?')) {
          localStorage.removeItem('recentScrapingTests');
          loadHistory();
        }
      }
      
      loadHistory();
    `;
    
    const html = createBaseLayout('Scraping History - Debug Tools', content, '', additionalJS);
    res.send(html);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;