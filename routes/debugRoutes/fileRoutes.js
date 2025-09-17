const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const { createBaseLayout, createBreadcrumb } = require('./utils/htmlTemplates');
const { formatDate, formatFileSize, formatDuration } = require('./utils/formatters');
const { validateFileOperationParams } = require('./utils/validators');

const router = express.Router();

const getDirectoryContents = async (dirPath, relativePath = '') => {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const contents = [];
    
const loggingService = require('../../services/LoggingService');
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const stats = await fs.stat(fullPath);
      
      contents.push({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        size: item.isFile() ? stats.size : null,
        modified: stats.mtime,
        relativePath: path.join(relativePath, item.name),
        fullPath
      });
    }
    
    return contents.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    throw new Error(`Unable to read directory: ${error.message}`);
  }
};

const getFilePreview = async (filePath, maxLines = 100) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    if (lines.length <= maxLines) {
      return { content, truncated: false, totalLines: lines.length };
    }
    
    return {
      content: lines.slice(0, maxLines).join('\n'),
      truncated: true,
      totalLines: lines.length
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw new Error(`Unable to read file: ${error.message}`);
  }
};

const analyzeCacheFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    const analysis = {
      isValid: true,
      timestamp: data.timestamp || data.data?.scrapedAt,
      url: data.data?.url || data.url,
      linksCount: data.data?.links?.length || 0,
      dataSize: JSON.stringify(data).length,
      hasResults: !!(data.data?.links?.length > 0),
      expiresAt: data.expiresAt,
      isExpired: data.expiresAt ? new Date(data.expiresAt) < new Date() : false,
      platform: data.data?.detectedPlatform || 'unknown',
      language: data.data?.detectedLanguage || 'unknown'
    };
    
    return analysis;
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    };
  }
};

const analyzeDebugFile = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    
    let analysis = {
      size: stats.size,
      modified: stats.mtime,
      lines: content.split('\n').length
    };
    
    if (filePath.endsWith('.json')) {
      try {
        const data = JSON.parse(content);
        analysis.isValidJson = true;
        analysis.jsonSize = Object.keys(data).length;
        analysis.structure = typeof data;
      } catch (e) {
        analysis.isValidJson = false;
        analysis.jsonError = e.message;
      }
    }
    
    if (filePath.includes('scraping_errors') || filePath.includes('errors')) {
      try {
        const data = JSON.parse(content);
        analysis.errorCount = Object.values(data).reduce((sum, domain) => 
          sum + (domain.totalErrors || 0), 0);
      } catch (e) {}
    }
    
    return analysis;
  } catch (error) {
    return { error: error.message };
  }
};

router.get('/', async (req, res) => {
  try {
    const { dir = '', action = 'browse' } = req.query;
    
    const validation = validateFileOperationParams({ dir, action });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid parameters',
        errors: validation.errors
      });
    }
    
    const allowedDirs = {
      'cache': config.CACHE_DIR,
      'debug': config.DEBUG_DIR,
      'user_preferences': path.join(__dirname, '../../user_preferences')
    };
    
    const baseDir = allowedDirs[dir] || config.DEBUG_DIR;
    const currentPath = baseDir;
    
    if (!await fs.access(currentPath).then(() => true).catch(() => false)) {
      return res.status(404).json({
        success: false,
        message: 'Directory not found'
      });
    }
    
    const contents = await getDirectoryContents(currentPath, dir);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'File Browser', url: '/debug/files' },
        ...(dir ? [{ label: dir, url: '#' }] : [])
      ]);
      
      const dirStats = {
        totalFiles: contents.filter(item => item.type === 'file').length,
        totalDirs: contents.filter(item => item.type === 'directory').length,
        totalSize: contents
          .filter(item => item.type === 'file')
          .reduce((sum, item) => sum + (item.size || 0), 0)
      };
      
      const content = `
        ${breadcrumb}
        
        <h1>File Browser - ${dir || 'Debug'}</h1>
        
        <div class="actions">
          <a href="/debug" class="button secondary">Back to Debug</a>
          <button onclick="refreshDirectory()" class="button">Refresh</button>
          <button onclick="cleanupOldFiles()" class="button danger">Cleanup Old Files</button>
        </div>
        
        <div class="section">
          <h2>Directory Navigation</h2>
          <div class="nav-buttons">
            <a href="/debug/files?dir=cache" class="button ${dir === 'cache' ? 'active' : ''}">Cache Files</a>
            <a href="/debug/files?dir=debug" class="button ${dir === 'debug' ? 'active' : ''}">Debug Files</a>
            <a href="/debug/files?dir=user_preferences" class="button ${dir === 'user_preferences' ? 'active' : ''}">User Preferences</a>
          </div>
        </div>
        
        <div class="section">
          <h2>Directory Statistics</h2>
          <div class="metrics-grid">
            <div class="metrics-card">
              <h3>Overview</h3>
              <table>
                <tr>
                  <th>Files</th>
                  <td>${dirStats.totalFiles}</td>
                </tr>
                <tr>
                  <th>Directories</th>
                  <td>${dirStats.totalDirs}</td>
                </tr>
                <tr>
                  <th>Total Size</th>
                  <td>${formatFileSize(dirStats.totalSize)}</td>
                </tr>
                <tr>
                  <th>Path</th>
                  <td style="font-family: monospace; font-size: 12px;">${currentPath}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>Contents</h2>
          <div class="responsive-table">
            <table>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Modified</th>
                <th>Actions</th>
              </tr>
              ${contents.map(item => {
                const isCache = dir === 'cache' && item.name.endsWith('.json');
                const isDebug = dir === 'debug' && item.name.endsWith('.json');
                
                return `
                  <tr>
                    <td>
                      <span class="${item.type === 'directory' ? 'directory-icon' : 'file-icon'}">
                        ${item.type === 'directory' ? '📁' : '📄'}
                      </span>
                      ${item.name}
                    </td>
                    <td>${item.type}</td>
                    <td>${item.size ? formatFileSize(item.size) : '-'}</td>
                    <td>${formatDate(item.modified)}</td>
                    <td>
                      ${item.type === 'file' ? `
                        <button onclick="viewFile('${item.relativePath}')" class="button" style="padding: 5px 10px; font-size: 12px;">View</button>
                        ${isCache ? `<button onclick="analyzeCache('${item.name}')" class="button secondary" style="padding: 5px 10px; font-size: 12px;">Analyze</button>` : ''}
                        ${isDebug ? `<button onclick="analyzeDebug('${item.name}')" class="button secondary" style="padding: 5px 10px; font-size: 12px;">Analyze</button>` : ''}
                        <button onclick="downloadFile('${item.relativePath}')" class="button secondary" style="padding: 5px 10px; font-size: 12px;">Download</button>
                        <button onclick="deleteFile('${item.relativePath}')" class="button danger" style="padding: 5px 10px; font-size: 12px;">Delete</button>
                      ` : `
                        <a href="/debug/files?dir=${item.relativePath}" class="button" style="padding: 5px 10px; font-size: 12px;">Open</a>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </table>
          </div>
        </div>
        
        <div id="file-viewer" style="display: none;">
          <div class="section">
            <h2>File Viewer</h2>
            <div class="actions">
              <button onclick="closeFileViewer()" class="button secondary">Close</button>
              <button onclick="downloadCurrentFile()" class="button">Download</button>
            </div>
            <div id="file-content" style="background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 13px; max-height: 500px; overflow: auto; white-space: pre-wrap;"></div>
          </div>
        </div>
        
        <div id="analysis-result" style="display: none;">
          <div class="section">
            <h2>File Analysis</h2>
            <div class="actions">
              <button onclick="closeAnalysis()" class="button secondary">Close</button>
            </div>
            <div id="analysis-content"></div>
          </div>
        </div>
      `;
      
      const additionalJS = `
        let currentFile = null;
        
        function refreshDirectory() {
          location.reload();
        }
        
        function viewFile(relativePath) {
          fetch('/debug/files/view?file=' + encodeURIComponent(relativePath))
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                currentFile = relativePath;
                document.getElementById('file-content').textContent = data.content;
                document.getElementById('file-viewer').style.display = 'block';
                
                if (data.truncated) {
                  document.getElementById('file-content').innerHTML += 
                    '\\n\\n--- File truncated. Showing first ' + data.displayedLines + ' lines of ' + data.totalLines + ' total ---';
                }
              } else {
                alert('Error: ' + data.message);
              }
            })
            .catch(error => {
              alert('Error loading file: ' + error.message);
            });
        }
        
        function closeFileViewer() {
          document.getElementById('file-viewer').style.display = 'none';
          currentFile = null;
        }
        
        function downloadCurrentFile() {
          if (currentFile) {
            downloadFile(currentFile);
          }
        }
        
        function downloadFile(relativePath) {
          window.open('/debug/files/download?file=' + encodeURIComponent(relativePath));
        }
        
        function deleteFile(relativePath) {
          if (confirm('Are you sure you want to delete this file?')) {
            fetch('/debug/files/delete?file=' + encodeURIComponent(relativePath), {
              method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                location.reload();
              } else {
                alert('Error: ' + data.message);
              }
            })
            .catch(error => {
              alert('Error deleting file: ' + error.message);
            });
          }
        }
        
        function analyzeCache(filename) {
          fetch('/debug/files/analyze-cache?file=' + encodeURIComponent(filename))
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                const analysis = data.analysis;
                let html = '<div class="metrics-card"><h3>Cache Analysis: ' + filename + '</h3><table>';
                
                if (analysis.isValid) {
                  html += '<tr><th>Valid Cache</th><td class="success">✓ Yes</td></tr>';
                  html += '<tr><th>URL</th><td>' + (analysis.url || 'Unknown') + '</td></tr>';
                  html += '<tr><th>Links Found</th><td>' + analysis.linksCount + '</td></tr>';
                  html += '<tr><th>Data Size</th><td>' + (analysis.dataSize / 1024).toFixed(2) + ' KB</td></tr>';
                  html += '<tr><th>Has Results</th><td class="' + (analysis.hasResults ? 'success' : 'warning') + '">' + (analysis.hasResults ? 'Yes' : 'No') + '</td></tr>';
                  html += '<tr><th>Platform</th><td>' + analysis.platform + '</td></tr>';
                  html += '<tr><th>Language</th><td>' + analysis.language + '</td></tr>';
                  if (analysis.timestamp) html += '<tr><th>Scraped At</th><td>' + new Date(analysis.timestamp).toLocaleString() + '</td></tr>';
                  if (analysis.expiresAt) {
                    html += '<tr><th>Expires At</th><td>' + new Date(analysis.expiresAt).toLocaleString() + '</td></tr>';
                    html += '<tr><th>Is Expired</th><td class="' + (analysis.isExpired ? 'danger' : 'success') + '">' + (analysis.isExpired ? 'Yes' : 'No') + '</td></tr>';
                  }
                } else {
                  html += '<tr><th>Valid Cache</th><td class="danger">✗ No</td></tr>';
                  html += '<tr><th>Error</th><td>' + analysis.error + '</td></tr>';
                }
                
                html += '</table></div>';
                document.getElementById('analysis-content').innerHTML = html;
                document.getElementById('analysis-result').style.display = 'block';
              } else {
                alert('Error analyzing cache: ' + data.message);
              }
            })
            .catch(error => {
              alert('Error: ' + error.message);
            });
        }
        
        function analyzeDebug(filename) {
          fetch('/debug/files/analyze-debug?file=' + encodeURIComponent(filename))
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                const analysis = data.analysis;
                let html = '<div class="metrics-card"><h3>Debug File Analysis: ' + filename + '</h3><table>';
                
                if (!analysis.error) {
                  html += '<tr><th>File Size</th><td>' + (analysis.size / 1024).toFixed(2) + ' KB</td></tr>';
                  html += '<tr><th>Lines</th><td>' + analysis.lines + '</td></tr>';
                  html += '<tr><th>Modified</th><td>' + new Date(analysis.modified).toLocaleString() + '</td></tr>';
                  
                  if (analysis.isValidJson !== undefined) {
                    html += '<tr><th>Valid JSON</th><td class="' + (analysis.isValidJson ? 'success' : 'danger') + '">' + (analysis.isValidJson ? 'Yes' : 'No') + '</td></tr>';
                    if (analysis.isValidJson && analysis.jsonSize) {
                      html += '<tr><th>JSON Keys</th><td>' + analysis.jsonSize + '</td></tr>';
                    }
                    if (analysis.jsonError) {
                      html += '<tr><th>JSON Error</th><td class="danger">' + analysis.jsonError + '</td></tr>';
                    }
                  }
                  
                  if (analysis.errorCount !== undefined) {
                    html += '<tr><th>Total Errors</th><td>' + analysis.errorCount + '</td></tr>';
                  }
                } else {
                  html += '<tr><th>Error</th><td class="danger">' + analysis.error + '</td></tr>';
                }
                
                html += '</table></div>';
                document.getElementById('analysis-content').innerHTML = html;
                document.getElementById('analysis-result').style.display = 'block';
              } else {
                alert('Error analyzing file: ' + data.message);
              }
            })
            .catch(error => {
              alert('Error: ' + error.message);
            });
        }
        
        function closeAnalysis() {
          document.getElementById('analysis-result').style.display = 'none';
        }
        
        function cleanupOldFiles() {
          if (confirm('This will delete files older than 7 days. Are you sure?')) {
            fetch('/debug/files/cleanup', { method: 'POST' })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  alert('Cleanup completed. ' + data.deletedCount + ' files deleted.');
                  location.reload();
                } else {
                  alert('Cleanup failed: ' + data.message);
                }
              })
              .catch(error => {
                alert('Error during cleanup: ' + error.message);
              });
          }
        }
      `;
      
      const additionalCSS = `
        .nav-buttons { display: flex; gap: 10px; margin-bottom: 20px; }
        .nav-buttons .button.active { background-color: #007bff; color: white; }
        .directory-icon, .file-icon { margin-right: 8px; }
        .empty-state { text-align: center; padding: 40px; background-color: #f8f9fa; border-radius: 8px; }
      `;
      
      const html = createBaseLayout('File Browser - Debug Tools', content, additionalCSS, additionalJS);
      res.send(html);
    } else {
      res.json({
        success: true,
        contents,
        stats: dirStats,
        currentPath
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/view', async (req, res) => {
  try {
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File parameter required'
      });
    }
    
    const allowedDirs = {
      'cache': config.CACHE_DIR,
      'debug': config.DEBUG_DIR,
      'user_preferences': path.join(__dirname, '../../user_preferences')
    };
    
    const basePath = Object.values(allowedDirs).find(dir => {
      const fullPath = path.join(dir, file);
      return fullPath.startsWith(dir);
    });
    
    if (!basePath) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const filePath = path.join(basePath, file.replace(/^[^/]+[/\\]/, ''));
    const preview = await getFilePreview(filePath);
    
    res.json({
      success: true,
      content: preview.content,
      truncated: preview.truncated,
      totalLines: preview.totalLines,
      displayedLines: preview.content.split('\n').length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/download', async (req, res) => {
  try {
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File parameter required'
      });
    }
    
    const allowedDirs = {
      'cache': config.CACHE_DIR,
      'debug': config.DEBUG_DIR,
      'user_preferences': path.join(__dirname, '../../user_preferences')
    };
    
    const basePath = Object.values(allowedDirs).find(dir => {
      const fullPath = path.join(dir, file);
      return fullPath.startsWith(dir);
    });
    
    if (!basePath) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const filePath = path.join(basePath, file.replace(/^[^/]+[/\\]/, ''));
    
    res.download(filePath, path.basename(filePath));
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.delete('/delete', async (req, res) => {
  try {
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File parameter required'
      });
    }
    
    const allowedDirs = {
      'cache': config.CACHE_DIR,
      'debug': config.DEBUG_DIR,
      'user_preferences': path.join(__dirname, '../../user_preferences')
    };
    
    const basePath = Object.values(allowedDirs).find(dir => {
      const fullPath = path.join(dir, file);
      return fullPath.startsWith(dir);
    });
    
    if (!basePath) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const filePath = path.join(basePath, file.replace(/^[^/]+[/\\]/, ''));
    await fs.unlink(filePath);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/analyze-cache', async (req, res) => {
  try {
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File parameter required'
      });
    }
    
    const filePath = path.join(config.CACHE_DIR, file);
    const analysis = await analyzeCacheFile(filePath);
    
    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/analyze-debug', async (req, res) => {
  try {
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File parameter required'
      });
    }
    
    const filePath = path.join(config.DEBUG_DIR, file);
    const analysis = await analyzeDebugFile(filePath);
    
    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.post('/cleanup', async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    
    const dirs = [config.CACHE_DIR, config.DEBUG_DIR];
    
    for (const dir of dirs) {
      try {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.isFile() && stats.mtime < sevenDaysAgo) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        }
      } catch (error) {
        loggingService.error('Error cleaning up directory', { dir, error: error.message });
      }
    }
    
    res.json({
      success: true,
      message: `Cleanup completed. ${deletedCount} files deleted.`,
      deletedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;