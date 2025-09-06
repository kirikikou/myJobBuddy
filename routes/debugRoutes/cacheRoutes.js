const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const { 
  getCacheStats, 
  getCachedData, 
  saveCache, 
  clearExpiredCache,
  getCacheFilename
} = require('../../cacheManager');
const { createBaseLayout, createBreadcrumb, createStatsTable } = require('./utils/htmlTemplates');
const { formatDate, formatFileSize, formatDuration, createUrlPreview } = require('./utils/formatters');
const { validateFileName, isSecurePath } = require('./utils/validators');

const router = express.Router();

router.get('/stats', async (req, res) => {
  try {
    const stats = await getCacheStats();
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Cache Statistics', url: '/debug/cache/stats' }
      ]);
      
      const content = `
        ${breadcrumb}
        
        <h1>Cache Statistics</h1>
        
        <div class="actions">
          <a href="/debug/cache/list" class="button">View Cache Content</a>
          <a href="/debug/cache/clean" class="button secondary">Clean Expired</a>
          <a href="/debug/cache/test-write" class="button secondary">Test Write</a>
          <a href="/debug" class="button secondary">Back to Debug</a>
        </div>
        
        <div class="section">
          <h2>Overview</h2>
          <div class="metrics-grid">
            <div class="metrics-card">
              <h3>Storage</h3>
              <table>
                <tr>
                  <th>Total Files</th>
                  <td>${stats.totalFiles}</td>
                </tr>
                <tr>
                  <th>Total Size</th>
                  <td>${formatFileSize(stats.totalSize)}</td>
                </tr>
                <tr>
                  <th>Average File Size</th>
                  <td>${formatFileSize(stats.averageSize)}</td>
                </tr>
                <tr>
                  <th>Cache Directory</th>
                  <td><code>${stats.cacheDir}</code></td>
                </tr>
              </table>
            </div>
            
            <div class="metrics-card">
              <h3>Age Distribution</h3>
              <table>
                <tr>
                  <th>Oldest Entry</th>
                  <td>${stats.oldestEntry ? formatDate(stats.oldestEntry) : 'None'}</td>
                </tr>
                <tr>
                  <th>Newest Entry</th>
                  <td>${stats.newestEntry ? formatDate(stats.newestEntry) : 'None'}</td>
                </tr>
                <tr>
                  <th>Cache Duration</th>
                  <td>${Math.round(config.CACHE_DURATION / (60 * 60 * 1000))} hours</td>
                </tr>
                <tr>
                  <th>Expired Entries</th>
                  <td class="${stats.expiredEntries > 0 ? 'warning' : 'success'}">${stats.expiredEntries || 0}</td>
                </tr>
              </table>
            </div>
            
            <div class="metrics-card">
              <h3>Performance</h3>
              <table>
                <tr>
                  <th>Disk Space Used</th>
                  <td class="${stats.totalSize > 100 * 1024 * 1024 ? 'warning' : 'success'}">${formatFileSize(stats.totalSize)}</td>
                </tr>
                <tr>
                  <th>Fragmentation</th>
                  <td>${stats.totalFiles > 0 ? ((stats.totalFiles - stats.validFiles) / stats.totalFiles * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <th>Valid Entries</th>
                  <td class="success">${stats.validFiles || stats.totalFiles}</td>
                </tr>
                <tr>
                  <th>Efficiency</th>
                  <td class="success">${stats.totalFiles > 0 ? (stats.validFiles / stats.totalFiles * 100).toFixed(1) : 100}%</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>Cache Health</h2>
          <div style="background: ${stats.expiredEntries > 10 ? '#fff3cd' : '#d4edda'}; border: 1px solid ${stats.expiredEntries > 10 ? '#ffeaa7' : '#c3e6cb'}; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: ${stats.expiredEntries > 10 ? '#856404' : '#155724'};">
              ${stats.expiredEntries > 10 ? 'Cache Cleanup Recommended' : 'Cache is Healthy'}
            </h3>
            ${stats.expiredEntries > 10 ? `
              <p>You have ${stats.expiredEntries} expired cache entries that should be cleaned up to improve performance.</p>
              <a href="/debug/cache/clean" class="button">Clean Now</a>
            ` : `
              <p>Your cache is well maintained with minimal expired entries.</p>
            `}
          </div>
        </div>
        
        <div class="section">
          <h2>Storage Analysis</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <span>Cache Usage</span>
              <span>${formatFileSize(stats.totalSize)} / ${formatFileSize(500 * 1024 * 1024)} (500MB limit)</span>
            </div>
            <div style="width: 100%; background: #e9ecef; border-radius: 10px; height: 20px;">
              <div style="width: ${Math.min((stats.totalSize / (500 * 1024 * 1024)) * 100, 100)}%; background: ${stats.totalSize > 400 * 1024 * 1024 ? '#dc3545' : stats.totalSize > 200 * 1024 * 1024 ? '#ffc107' : '#28a745'}; height: 100%; border-radius: 10px; transition: width 0.3s ease;"></div>
            </div>
            <p class="small" style="margin-top: 10px; color: #6c757d;">
              ${stats.totalSize > 400 * 1024 * 1024 ? 'Warning: Cache approaching size limit' : 
                stats.totalSize > 200 * 1024 * 1024 ? 'Cache size is moderate' : 'Cache size is optimal'}
            </p>
          </div>
        </div>
      `;
      
      const html = createBaseLayout('Cache Statistics - Debug Tools', content);
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

router.get('/list', async (req, res) => {
  try {
    const { sortBy = 'modified', sortDir = 'desc', filter = '', page = 1, limit = 50 } = req.query;
    
    const files = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    const cacheEntries = [];
    
    for (const file of jsonFiles) {
      const filePath = path.join(config.CACHE_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        const entry = {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          timestamp: parsedData.timestamp ? new Date(parsedData.timestamp) : null,
          url: parsedData.data && parsedData.data.url ? parsedData.data.url : 'Unknown',
          method: parsedData.data && parsedData.data.method ? parsedData.data.method : 'Unknown',
          platform: parsedData.data && parsedData.data.detectedPlatform ? parsedData.data.detectedPlatform : 'Unknown',
          language: parsedData.data && parsedData.data.detectedLanguage ? parsedData.data.detectedLanguage : 'Unknown',
          textLength: parsedData.data && parsedData.data.text ? parsedData.data.text.length : 0,
          linksCount: parsedData.data && parsedData.data.links ? parsedData.data.links.length : 0,
          isExpired: parsedData.timestamp ? (Date.now() - new Date(parsedData.timestamp).getTime()) > config.CACHE_DURATION : false
        };
        
        if (filter) {
          const filterLower = filter.toLowerCase();
          if (!entry.url.toLowerCase().includes(filterLower) && 
              !entry.method.toLowerCase().includes(filterLower) &&
              !entry.platform.toLowerCase().includes(filterLower)) {
            continue;
          }
        }
        
        cacheEntries.push(entry);
      } catch (error) {
        cacheEntries.push({
          filename: file,
          error: error.message,
          size: 0,
          created: null,
          modified: null,
          url: 'Error',
          method: 'Error',
          platform: 'Error',
          language: 'Error'
        });
      }
    }
    
    cacheEntries.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDir === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedEntries = cacheEntries.slice(startIndex, endIndex);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Cache Content', url: '/debug/cache/list' }
      ]);
      
      const sortOptions = [
        { value: 'modified', label: 'Modified Date' },
        { value: 'created', label: 'Created Date' },
        { value: 'size', label: 'File Size' },
        { value: 'url', label: 'URL' },
        { value: 'method', label: 'Method' },
        { value: 'platform', label: 'Platform' }
      ].map(opt => `<option value="${opt.value}" ${sortBy === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('');
      
      const pagination = cacheEntries.length > limit ? `
        <div class="actions">
          ${page > 1 ? `<a href="?sortBy=${sortBy}&sortDir=${sortDir}&filter=${encodeURIComponent(filter)}&page=${page - 1}&limit=${limit}" class="button secondary">Previous</a>` : ''}
          <span style="margin: 0 15px;">Page ${page} of ${Math.ceil(cacheEntries.length / limit)} (${cacheEntries.length} total entries)</span>
          ${endIndex < cacheEntries.length ? `<a href="?sortBy=${sortBy}&sortDir=${sortDir}&filter=${encodeURIComponent(filter)}&page=${parseInt(page) + 1}&limit=${limit}" class="button secondary">Next</a>` : ''}
        </div>
      ` : '';
      
      const content = `
        ${breadcrumb}
        
        <h1>Cache Content (${cacheEntries.length} entries)</h1>
        
        <div class="actions">
          <a href="/debug/cache/clean" class="button">Clean Expired</a>
          <a href="/debug/cache/stats" class="button secondary">View Statistics</a>
          <a href="/debug" class="button secondary">Back to Debug</a>
          <button onclick="bulkDeleteSelected()" class="button danger">Delete Selected</button>
        </div>
        
        <div class="filter-panel">
          <form method="get">
            <input type="hidden" name="page" value="1">
            <div class="filter-group">
              <label for="filter">Filter:</label>
              <input type="text" name="filter" id="filter" value="${filter}" placeholder="Filter by URL, method, or platform">
            </div>
            <div class="filter-group">
              <label for="sortBy">Sort by:</label>
              <select name="sortBy" id="sortBy">${sortOptions}</select>
            </div>
            <div class="filter-group">
              <label for="sortDir">Direction:</label>
              <select name="sortDir" id="sortDir">
                <option value="desc" ${sortDir === 'desc' ? 'selected' : ''}>Descending</option>
                <option value="asc" ${sortDir === 'asc' ? 'selected' : ''}>Ascending</option>
              </select>
            </div>
            <div class="filter-group">
              <label for="limit">Per page:</label>
              <select name="limit" id="limit">
                <option value="25" ${limit == 25 ? 'selected' : ''}>25</option>
                <option value="50" ${limit == 50 ? 'selected' : ''}>50</option>
                <option value="100" ${limit == 100 ? 'selected' : ''}>100</option>
                <option value="200" ${limit == 200 ? 'selected' : ''}>200</option>
              </select>
            </div>
            <div class="filter-group">
              <label>&nbsp;</label>
              <button type="submit" class="button">Apply</button>
              <a href="/debug/cache/list" class="button secondary">Reset</a>
            </div>
          </form>
        </div>
        
        ${pagination}
        
        <div class="responsive-table">
          <table style="min-width: 1200px;">
            <thead>
              <tr>
                <th><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
                <th data-sort="filename">Filename</th>
                <th data-sort="url">URL</th>
                <th data-sort="size">Size</th>
                <th data-sort="method">Method</th>
                <th data-sort="platform">Platform</th>
                <th data-sort="language">Language</th>
                <th data-sort="timestamp">Cached</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${paginatedEntries.map(entry => `
                <tr ${entry.isExpired ? 'style="background-color: #fff3cd;"' : ''}>
                  <td><input type="checkbox" name="selectedFiles" value="${entry.filename}"></td>
                  <td style="font-family: monospace; font-size: 12px;">${entry.filename}</td>
                  <td class="url" title="${entry.url}">
                    ${entry.url !== 'Unknown' && entry.url !== 'Error' ? 
                      `<a href="${entry.url}" target="_blank">${createUrlPreview(entry.url, 40)}</a>` : 
                      entry.url}
                  </td>
                  <td>${entry.error ? '<span class="danger">Error</span>' : formatFileSize(entry.size)}</td>
                  <td>${entry.method}</td>
                  <td>${entry.platform}</td>
                  <td>${entry.language !== 'Unknown' ? `<span class="language-badge">${entry.language.toUpperCase()}</span>` : entry.language}</td>
                  <td>${entry.timestamp ? formatDate(entry.timestamp) : 'Unknown'}</td>
                  <td>
                    ${entry.error ? '<span class="danger">Error</span>' : 
                      entry.isExpired ? '<span class="warning">Expired</span>' : 
                      '<span class="success">Valid</span>'}
                  </td>
                  <td>
                    <a href="/debug/cache/view/${entry.filename}" target="_blank" class="button" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;">View</a>
                    <a href="/debug/cache/delete/${entry.filename}" onclick="return confirm('Delete this cache entry?')" class="button danger" style="padding: 5px 10px; font-size: 12px;">Delete</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        ${pagination}
        
        <div class="section">
          <h2>Bulk Actions</h2>
          <div class="actions">
            <button onclick="selectExpired()" class="button secondary">Select All Expired</button>
            <button onclick="selectByPlatform()" class="button secondary">Select by Platform</button>
            <button onclick="exportSelected()" class="button secondary">Export Selected</button>
          </div>
        </div>
      `;
      
      const additionalJS = `
        function toggleSelectAll() {
          const selectAll = document.getElementById('selectAll');
          const checkboxes = document.querySelectorAll('input[name="selectedFiles"]');
          checkboxes.forEach(cb => cb.checked = selectAll.checked);
        }
        
        function selectExpired() {
          const checkboxes = document.querySelectorAll('input[name="selectedFiles"]');
          checkboxes.forEach(cb => {
            const row = cb.closest('tr');
            if (row.style.backgroundColor === 'rgb(255, 243, 205)') {
              cb.checked = true;
            }
          });
        }
        
        function selectByPlatform() {
          const platform = prompt('Enter platform name:');
          if (!platform) return;
          
          const checkboxes = document.querySelectorAll('input[name="selectedFiles"]');
          checkboxes.forEach(cb => {
            const row = cb.closest('tr');
            const platformCell = row.cells[5].textContent.toLowerCase();
            if (platformCell.includes(platform.toLowerCase())) {
              cb.checked = true;
            }
          });
        }
        
        function bulkDeleteSelected() {
          const selected = Array.from(document.querySelectorAll('input[name="selectedFiles"]:checked'))
            .map(cb => cb.value);
          
          if (selected.length === 0) {
            alert('Please select files to delete');
            return;
          }
          
          if (!confirm('Delete ' + selected.length + ' selected cache entries?')) {
            return;
          }
          
          Promise.all(selected.map(filename => 
            fetch('/debug/cache/delete/' + encodeURIComponent(filename), { method: 'DELETE' })
          )).then(() => {
            location.reload();
          }).catch(error => {
            alert('Error deleting files: ' + error.message);
          });
        }
        
        function exportSelected() {
          const selected = Array.from(document.querySelectorAll('input[name="selectedFiles"]:checked'))
            .map(cb => cb.value);
          
          if (selected.length === 0) {
            alert('Please select files to export');
            return;
          }
          
          window.open('/debug/cache/export?files=' + encodeURIComponent(JSON.stringify(selected)));
        }
      `;
      
      const html = createBaseLayout('Cache Content - Debug Tools', content, '', additionalJS);
      res.send(html);
    } else {
      res.json({
        success: true,
        count: cacheEntries.length,
        entries: paginatedEntries,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: cacheEntries.length,
          pages: Math.ceil(cacheEntries.length / limit)
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/view/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    const validation = validateFileName(filename);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }
    
    if (!isSecurePath(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file path'
      });
    }
    
    const filePath = path.join(config.CACHE_DIR, filename);
    
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Cache file not found'
      });
    }
    
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const parsedData = JSON.parse(fileContent);
    const stats = await fs.stat(filePath);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Cache Content', url: '/debug/cache/list' },
        { label: filename, url: '#' }
      ]);
      
      const isExpired = parsedData.timestamp ? 
        (Date.now() - new Date(parsedData.timestamp).getTime()) > config.CACHE_DURATION : false;
      
      const content = `
        ${breadcrumb}
        
        <h1>Cache Entry: ${filename}</h1>
        
        <div class="actions">
          <a href="/debug/cache/list" class="button secondary">Back to List</a>
          <a href="/debug/cache/delete/${filename}" class="button danger" onclick="return confirm('Delete this cache entry?')">Delete Entry</a>
          ${parsedData.data && parsedData.data.url ? 
            `<a href="/debug/scraping/test?url=${encodeURIComponent(parsedData.data.url)}&useCache=false" class="button">Re-scrape URL</a>` : ''}
          <button onclick="downloadEntry()" class="button secondary">Download JSON</button>
        </div>
        
        <div class="section">
          <h2>File Information</h2>
          <div class="metrics-grid">
            <div class="metrics-card">
              <h3>Basic Info</h3>
              <table>
                <tr>
                  <th>Filename</th>
                  <td style="font-family: monospace;">${filename}</td>
                </tr>
                <tr>
                  <th>File Size</th>
                  <td>${formatFileSize(stats.size)}</td>
                </tr>
                <tr>
                  <th>Created</th>
                  <td>${formatDate(stats.birthtime)}</td>
                </tr>
                <tr>
                  <th>Modified</th>
                  <td>${formatDate(stats.mtime)}</td>
                </tr>
                <tr>
                  <th>Status</th>
                  <td class="${isExpired ? 'warning' : 'success'}">${isExpired ? 'Expired' : 'Valid'}</td>
                </tr>
              </table>
            </div>
            
            <div class="metrics-card">
              <h3>Cache Data</h3>
              <table>
                <tr>
                  <th>Cached At</th>
                  <td>${parsedData.timestamp ? formatDate(parsedData.timestamp) : 'Unknown'}</td>
                </tr>
                <tr>
                  <th>URL</th>
                  <td>${parsedData.data && parsedData.data.url ? 
                    `<a href="${parsedData.data.url}" target="_blank">${createUrlPreview(parsedData.data.url, 50)}</a>` : 
                    'Unknown'}</td>
                </tr>
                <tr>
                  <th>Scraping Method</th>
                  <td>${parsedData.data && parsedData.data.method ? parsedData.data.method : 'Unknown'}</td>
                </tr>
                <tr>
                  <th>Platform Detected</th>
                  <td>${parsedData.data && parsedData.data.detectedPlatform ? parsedData.data.detectedPlatform : 'Unknown'}</td>
                </tr>
                <tr>
                  <th>Language Detected</th>
                  <td>${parsedData.data && parsedData.data.detectedLanguage ? 
                    `<span class="language-badge">${parsedData.data.detectedLanguage.toUpperCase()}</span>` : 'Unknown'}</td>
                </tr>
              </table>
            </div>
            
            ${parsedData.data ? `
            <div class="metrics-card">
              <h3>Content Stats</h3>
              <table>
                <tr>
                  <th>Title</th>
                  <td>${parsedData.data.title || 'No title'}</td>
                </tr>
                <tr>
                  <th>Text Length</th>
                  <td>${parsedData.data.text ? parsedData.data.text.length.toLocaleString() + ' characters' : '0'}</td>
                </tr>
                <tr>
                  <th>Links Found</th>
                  <td>${parsedData.data.links ? parsedData.data.links.length : 0}</td>
                </tr>
                <tr>
                  <th>Job Links</th>
                  <td>${parsedData.data.links ? parsedData.data.links.filter(link => link.isJobPosting).length : 0}</td>
                </tr>
                <tr>
                  <th>Has Iframe Content</th>
                  <td class="${parsedData.data.hasIframeContent ? 'success' : ''}">${parsedData.data.hasIframeContent ? 'Yes' : 'No'}</td>
                </tr>
              </table>
            </div>
            ` : ''}
          </div>
        </div>
        
        <div class="section">
          <h2>Raw JSON Data</h2>
          <details>
            <summary style="cursor: pointer; padding: 10px; background: #f8f9fa; border-radius: 4px;">View Complete JSON (${formatFileSize(stats.size)})</summary>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 4px; overflow: auto; max-height: 600px; margin-top: 10px; font-size: 12px;">${JSON.stringify(parsedData, null, 2)}</pre>
          </details>
        </div>
      `;
      
      const additionalJS = `
        function downloadEntry() {
          const data = ${JSON.stringify(parsedData)};
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = '${filename}';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      `;
      
      const html = createBaseLayout(`Cache Entry: ${filename} - Debug Tools`, content, '', additionalJS);
      res.send(html);
    } else {
      res.json({
        success: true,
        filename: filename,
        fileSize: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        data: parsedData
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/delete/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    const validation = validateFileName(filename);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }
    
    if (!isSecurePath(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file path'
      });
    }
    
    const filePath = path.join(config.CACHE_DIR, filename);
    
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Cache file not found'
      });
    }
    
    await fs.unlink(filePath);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      res.redirect('/debug/cache/list');
    } else {
      res.json({
        success: true,
        message: `Cache entry ${filename} deleted successfully`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.delete('/delete/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    
    const validation = validateFileName(filename);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }
    
    if (!isSecurePath(filename)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file path'
      });
    }
    
    const filePath = path.join(config.CACHE_DIR, filename);
    
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Cache file not found'
      });
    }
    
    await fs.unlink(filePath);
    
    res.json({
      success: true,
      message: `Cache entry ${filename} deleted successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/clean', async (req, res) => {
  try {
    const clearedCount = await clearExpiredCache();
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Cache Cleanup', url: '/debug/cache/clean' }
      ]);
      
      const content = `
        ${breadcrumb}
        
        <h1>Cache Cleanup Complete</h1>
        
        <div class="section">
          <div style="background: ${clearedCount > 0 ? '#d4edda' : '#d1ecf1'}; border: 1px solid ${clearedCount > 0 ? '#c3e6cb' : '#bee5eb'}; border-radius: 4px; padding: 20px; margin: 20px 0; text-align: center;">
            <h2 style="margin-top: 0; color: ${clearedCount > 0 ? '#155724' : '#0c5460'};">
              ${clearedCount > 0 ? '✓ Cleanup Successful' : 'ℹ No Action Needed'}
            </h2>
            <p style="font-size: 18px; margin: 15px 0;">
              ${clearedCount > 0 ? 
                `${clearedCount} expired cache ${clearedCount === 1 ? 'file was' : 'files were'} removed.` :
                'No expired cache files were found.'}
            </p>
            ${clearedCount > 0 ? `
              <p style="color: #495057;">
                Your cache is now optimized and expired entries have been removed.
              </p>
            ` : `
              <p style="color: #495057;">
                Your cache is already clean and well-maintained.
              </p>
            `}
          </div>
        </div>
        
        <div class="actions">
          <a href="/debug/cache/list" class="button">View Cache Content</a>
          <a href="/debug/cache/stats" class="button secondary">View Statistics</a>
          <a href="/debug" class="button secondary">Back to Debug</a>
        </div>
        
        <div class="section">
          <h2>Cleanup Summary</h2>
          <div class="metrics-card">
            <table>
              <tr>
                <th>Files Removed</th>
                <td class="${clearedCount > 0 ? 'success' : ''}">${clearedCount}</td>
              </tr>
              <tr>
                <th>Cache Duration</th>
                <td>${Math.round(config.CACHE_DURATION / (60 * 60 * 1000))} hours</td>
              </tr>
              <tr>
                <th>Cleanup Date</th>
                <td>${formatDate(new Date().toISOString())}</td>
              </tr>
              <tr>
                <th>Next Recommended Cleanup</th>
                <td>${formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())}</td>
              </tr>
            </table>
          </div>
        </div>
      `;
      
      const html = createBaseLayout('Cache Cleanup - Debug Tools', content);
      res.send(html);
    } else {
      res.json({
        success: true,
        clearedCount,
        message: `${clearedCount} expired cache entries removed`
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/test-write', async (req, res) => {
  try {
    const testUrl = req.query.url || `https://test.example.com/cache-test-${Date.now()}`;
    
    const testData = {
      url: testUrl,
      title: 'Test Cache Entry - Debug Tools',
      text: 'This is a test entry to verify cache writing functionality. Generated at ' + new Date().toISOString(),
      links: [
        { url: 'https://example.com/test1', text: 'Test Link 1', isJobPosting: false },
        { url: 'https://example.com/test2', text: 'Test Link 2', isJobPosting: true }
      ],
      scrapedAt: new Date().toISOString(),
      method: 'test-cache-write',
      detectedPlatform: 'TestPlatform',
      detectedLanguage: 'en',
      hasIframeContent: false,
      isEmpty: false
    };
    
    const startTime = Date.now();
    let saved = false;
    let cacheFile = '';
    let fileExists = false;
    let fileContent = null;
    let error = null;
    
    try {
      saved = await saveCache(testUrl, testData);
      cacheFile = getCacheFilename(testUrl);
      
      try {
        await fs.access(cacheFile);
        fileExists = true;
        const fileContentRaw = await fs.readFile(cacheFile, 'utf-8');
        fileContent = JSON.parse(fileContentRaw);
      } catch (accessError) {
        fileExists = false;
      }
    } catch (saveError) {
      error = saveError.message;
    }
    
    const executionTime = Date.now() - startTime;
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Cache Test Write', url: '/debug/cache/test-write' }
      ]);
      
      const content = `
        ${breadcrumb}
        
        <h1>Cache Write Test</h1>
        
        <div class="section">
          <div style="background: ${saved && fileExists ? '#d4edda' : '#f8d7da'}; border: 1px solid ${saved && fileExists ? '#c3e6cb' : '#f5c6cb'}; border-radius: 4px; padding: 20px; margin: 20px 0;">
            <h2 style="margin-top: 0; color: ${saved && fileExists ? '#155724' : '#721c24'};">
              ${saved && fileExists ? '✓ Test Successful' : '✗ Test Failed'}
            </h2>
            <p>
              ${saved && fileExists ? 
                'The test cache entry was written successfully and can be read back.' :
                'Failed to write or verify the test cache entry.' + (error ? ` Error: ${error}` : '')}
            </p>
          </div>
        </div>
        
        <div class="section">
          <h2>Test Results</h2>
          <div class="metrics-grid">
            <div class="metrics-card">
              <h3>Test Parameters</h3>
              <table>
                <tr>
                  <th>Test URL</th>
                  <td style="font-family: monospace; font-size: 12px; word-break: break-all;">${testUrl}</td>
                </tr>
                <tr>
                  <th>Cache File</th>
                  <td style="font-family: monospace; font-size: 12px; word-break: break-all;">${cacheFile}</td>
                </tr>
                <tr>
                  <th>Execution Time</th>
                  <td>${formatDuration(executionTime)}</td>
                </tr>
                <tr>
                  <th>Timestamp</th>
                  <td>${formatDate(new Date().toISOString())}</td>
                </tr>
              </table>
            </div>
            
            <div class="metrics-card">
              <h3>Test Results</h3>
              <table>
                <tr>
                  <th>Save Operation</th>
                  <td class="${saved ? 'success' : 'danger'}">${saved ? 'Success' : 'Failed'}</td>
                </tr>
                <tr>
                  <th>File Created</th>
                  <td class="${fileExists ? 'success' : 'danger'}">${fileExists ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>File Readable</th>
                  <td class="${fileContent ? 'success' : 'danger'}">${fileContent ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Data Integrity</th>
                  <td class="${fileContent && fileContent.data && fileContent.data.url === testUrl ? 'success' : 'danger'}">
                    ${fileContent && fileContent.data && fileContent.data.url === testUrl ? 'Valid' : 'Invalid'}
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </div>
        
        ${fileContent ? `
        <div class="section">
          <h2>Cache File Content</h2>
          <details>
            <summary style="cursor: pointer; padding: 10px; background: #f8f9fa; border-radius: 4px;">View Cached Data</summary>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 4px; overflow: auto; max-height: 400px; margin-top: 10px; font-size: 12px;">${JSON.stringify(fileContent, null, 2)}</pre>
          </details>
        </div>
        ` : ''}
        
        <div class="actions">
          <a href="/debug/cache/test-write?url=${encodeURIComponent('https://test.example.com/cache-test-' + Date.now())}" class="button">Run Another Test</a>
          <a href="/debug/cache/list" class="button secondary">View Cache Content</a>
          <a href="/debug/cache/stats" class="button secondary">View Statistics</a>
          <a href="/debug" class="button secondary">Back to Debug</a>
          ${fileExists ? `<a href="/debug/cache/delete/${path.basename(cacheFile)}" class="button danger" onclick="return confirm('Delete test cache entry?')">Delete Test Entry</a>` : ''}
        </div>
      `;
      
      const html = createBaseLayout('Cache Write Test - Debug Tools', content);
      res.send(html);
    } else {
      res.json({
        success: saved && fileExists,
        testUrl,
        cacheFile,
        executionTime,
        results: {
          saved,
          fileExists,
          fileReadable: !!fileContent,
          dataIntegrity: fileContent && fileContent.data && fileContent.data.url === testUrl
        },
        fileContent: fileExists ? fileContent : null,
        error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/export', async (req, res) => {
  try {
    const files = req.query.files ? JSON.parse(req.query.files) : [];
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files specified for export'
      });
    }
    
    const exportData = {
      exportDate: new Date().toISOString(),
      totalFiles: files.length,
      entries: []
    };
    
    for (const filename of files) {
      try {
        const filePath = path.join(config.CACHE_DIR, filename);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        exportData.entries.push({
          filename,
          data: parsedData
        });
      } catch (error) {
        exportData.entries.push({
          filename,
          error: error.message
        });
      }
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cache-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;