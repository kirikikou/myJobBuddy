const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../config');
const { createBaseLayout, createBreadcrumb } = require('./utils/htmlTemplates');
const { formatDate } = require('./utils/formatters');
const { router: consoleRoutes } = require('./consoleRoutes');
const scrapingRoutes = require('./scrapingRoutes');
const cacheRoutes = require('./cacheRoutes');
const fileRoutes = require('./fileRoutes');
const statsRoutes = require('./statsRoutes');
const { sessionManager } = require('../../sessionManager');

const router = express.Router();

const loggingService = require('../../services/LoggingService');
router.get('/', async (req, res) => {
  const content = `
    <h1>myJobBuddy Debug Tools</h1>
    <p class="lead">Interface complète de debugging et monitoring pour le système de scraping myJobBuddy.</p>
    
    <div class="section">
      <h2>🔧 User Debug Tools</h2>
      <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3>🕵️ User Session Debugger</h3>
        <p style="margin-bottom: 15px;">Rechercher et analyser un utilisateur spécifique pour diagnostiquer les problèmes de sessions.</p>
        <form id="debug-user-form" style="display: flex; gap: 10px; align-items: end; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 250px;">
            <label for="debug-user-email">User Email:</label>
            <input type="email" id="debug-user-email" placeholder="j.bacheter@gmail.com" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
          </div>
          <div style="flex: 1; min-width: 250px;">
            <label for="debug-user-id">Or User ID:</label>
            <input type="text" id="debug-user-id" placeholder="6856aa248499d30e76ff492e" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
          </div>
          <button type="submit" class="button">🔍 Debug User</button>
        </form>
      </div>
    </div>
    
    <div class="section">
      <h2>📊 Monitoring & Logs</h2>
      <div class="actions-grid">
        <a href="/debug/console/sessions" class="button">🗂️ Scraping Sessions</a>
        <a href="/debug/console/logs" class="button">📋 Console Logs</a>
        <a href="/debug/console/errors" class="button">❌ Errors & Warnings</a>
        <a href="/debug/console/monitor" class="button">📺 Live Monitor</a>
        <a href="/debug/console/domains" class="button">🌐 Session Logs by Domain</a>
      </div>
    </div>
    
    <div class="section">
      <h2>🔧 System Tools</h2>
      <div class="actions-grid">
        <a href="/debug/stats" class="button">📈 Scraping Statistics</a>
        <a href="/debug/cache" class="button">💾 Cache Management</a>
        <a href="/debug/files" class="button">📁 File Browser</a>
        <a href="/debug/scraping/test" class="button">🧪 Test Scraping</a>
        <a href="/debug/test-cache-keywords" class="button">🔍 Test Cache - Keywords</a>
        <a href="/debug/test-domain" class="button">🌍 Test Domain</a>
      </div>
    </div>
    
    <div class="section">
      <h2>⚡ Quick Actions</h2>
      <div class="actions-grid">
        <button onclick="clearAllCache()" class="button danger" style="color: black; font-weight: bold;">🗑️ Clear All Cache</button>
        <button onclick="clearConsoleLogs()" class="button danger" style="color: black; font-weight: bold;">🧹 Clear Console Logs</button>
        <button onclick="createTestSession()" class="button secondary">🔧 Create Test Session</button>
        <button onclick="exportDebugData()" class="button secondary">💾 Export Debug Data</button>
      </div>
    </div>
    
    <div class="section">
      <h2>ℹ️ System Status</h2>
      <div id="system-status">
        Chargement du statut système...
      </div>
    </div>
  `;

  const additionalJS = `
    document.getElementById('debug-user-form').addEventListener('submit', function(e) {
      e.preventDefault();
      
      const email = document.getElementById('debug-user-email').value.trim();
      const userId = document.getElementById('debug-user-id').value.trim();
      
      if (!email && !userId) {
        alert('Veuillez saisir un email ou un ID utilisateur');
        return;
      }
      
      const params = new URLSearchParams();
      if (email) params.set('email', email);
      if (userId) params.set('userId', userId);
      
      window.location.href = '/debug/user?' + params.toString();
    });
    
    function clearAllCache() {
      if (confirm('Êtes-vous sûr de vouloir vider tout le cache ? Cette action ne peut pas être annulée.')) {
        fetch('/debug/cache/clear-all', { method: 'POST' })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('✅ Cache vidé avec succès !');
              loadSystemStatus();
            } else {
              alert('❌ Échec du vidage du cache : ' + data.message);
            }
          })
          .catch(error => {
            alert('❌ Erreur : ' + error.message);
          });
      }
    }
    
    function clearConsoleLogs() {
      if (confirm('Êtes-vous sûr de vouloir vider tous les Console Logs ?')) {
        fetch('/debug/console/clear', { method: 'POST' })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('✅ Console Logs vidés avec succès !');
              loadSystemStatus();
            } else {
              alert('❌ Échec du vidage des logs : ' + data.message);
            }
          })
          .catch(error => {
            alert('❌ Erreur : ' + error.message);
          });
      }
    }
    
    function createTestSession() {
      const userId = prompt('Saisir User ID (ou laisser vide pour test_user):', 'test_user');
      const email = prompt('Saisir Email (ou laisser vide pour test@example.com):', 'test@example.com');
      
      if (userId === null) return;
      
      const testData = {
        userId: userId || 'test_user',
        userEmail: email || 'test@example.com',
        searchQuery: 'Test Session - Debug',
        urls: ['https://example.com/careers']
      };
      
      fetch('/api/scraping/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('✅ Session de test créée avec succès ! Vérifiez la page Sessions.');
          setTimeout(() => window.location.reload(), 2000);
        } else {
          alert('❌ Échec de la création de la session de test : ' + data.message);
        }
      })
      .catch(error => {
        alert('❌ Erreur : ' + error.message);
      });
    }
    
    function exportDebugData() {
      fetch('/debug/stats?format=json')
        .then(response => response.json())
        .then(data => {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'debug-data-' + new Date().toISOString().split('T')[0] + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        })
        .catch(error => {
          alert('❌ Échec de l\'export des données : ' + error.message);
        });
    }
    
    function loadSystemStatus() {
      fetch('/debug/health')
        .then(response => response.json())
        .then(data => {
          const statusDiv = document.getElementById('system-status');
          if (data.success) {
            statusDiv.innerHTML = \`
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div class="metrics-card">
                  <h4>System Health</h4>
                  <p style="color: #28a745; font-weight: bold;">\${data.status.toUpperCase()}</p>
                  <p class="small">Uptime: \${Math.floor(data.uptime / 3600)}h \${Math.floor((data.uptime % 3600) / 60)}m</p>
                </div>
                <div class="metrics-card">
                  <h4>Memory Usage</h4>
                  <p>\${data.memory.used}MB / \${data.memory.total}MB</p>
                  <p class="small">External: \${data.memory.external}MB</p>
                </div>
                <div class="metrics-card">
                  <h4>Platform</h4>
                  <p>\${data.system.platform} \${data.system.arch}</p>
                  <p class="small">\${data.system.nodeVersion}</p>
                </div>
                <div class="metrics-card">
                  <h4>Dernière Mise à Jour</h4>
                  <p class="small">\${new Date(data.timestamp).toLocaleString()}</p>
                </div>
              </div>
            \`;
          } else {
            statusDiv.innerHTML = '<p style="color: #dc3545;">Échec du chargement du statut système</p>';
          }
        })
        .catch(error => {
          document.getElementById('system-status').innerHTML = '<p style="color: #dc3545;">Erreur de chargement du statut système : ' + error.message + '</p>';
        });
    }
    
    loadSystemStatus();
    setInterval(loadSystemStatus, 30000);
  `;

  const html = createBaseLayout('Debug Tools - myJobBuddy', content, '', additionalJS);
  res.send(html);
});

router.get('/test-cache-keywords', async (req, res) => {
  try {
    const { keyword = '', limit = 50 } = req.query;
    
    let results = [];
    let searchPerformed = false;
    
    if (keyword && keyword.trim().length > 0) {
      searchPerformed = true;
      const cacheFiles = await fs.readdir(config.CACHE_DIR);
      const jsonFiles = cacheFiles.filter(file => file.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(config.CACHE_DIR, file);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const parsedData = JSON.parse(fileContent);
          
          if (parsedData.data && parsedData.data.links) {
            const matchingLinks = parsedData.data.links.filter(link => 
              link.text && link.text.toLowerCase().includes(keyword.toLowerCase())
            );
            
            if (matchingLinks.length > 0) {
              results.push({
                url: parsedData.data.url,
                domain: new URL(parsedData.data.url).hostname,
                scrapedAt: parsedData.timestamp || parsedData.data.scrapedAt,
                totalLinks: parsedData.data.links.length,
                matchingLinks: matchingLinks,
                cacheFile: file
              });
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      results = results.slice(0, parseInt(limit));
    }
    
    const breadcrumb = createBreadcrumb([
      { label: 'Debug', url: '/debug' },
      { label: 'Test Cache - Keywords', url: '/debug/test-cache-keywords' }
    ]);
    
    const content = `
      ${breadcrumb}
      
      <h1>Test Cache - Keywords</h1>
      <p class="lead">Rechercher des JobTitles spécifiques dans le cache de scraping</p>
      
      <div class="actions">
        <a href="/debug" class="button secondary">Retour au Debug</a>
        <a href="/debug/cache" class="button secondary">Cache Management</a>
      </div>
      
      <div class="section">
        <h2>Recherche par Keyword</h2>
        <form method="get" style="background: #f8f9fa; padding: 20px; border-radius: 6px;">
          <div style="display: flex; gap: 15px; align-items: end; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 300px;">
              <label for="keyword">JobTitle / Keyword:</label>
              <input type="text" name="keyword" id="keyword" value="${keyword}" placeholder="Ex: Developer, Manager, Designer..." style="width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 4px;">
            </div>
            <div>
              <label for="limit">Limite de résultats:</label>
              <select name="limit" id="limit" style="padding: 10px; border: 1px solid #ced4da; border-radius: 4px;">
                <option value="25" ${limit == 25 ? 'selected' : ''}>25</option>
                <option value="50" ${limit == 50 ? 'selected' : ''}>50</option>
                <option value="100" ${limit == 100 ? 'selected' : ''}>100</option>
                <option value="200" ${limit == 200 ? 'selected' : ''}>200</option>
              </select>
            </div>
            <button type="submit" class="button">🔍 Rechercher</button>
          </div>
        </form>
      </div>
      
      ${searchPerformed ? `
      <div class="section">
        <h2>Résultats de recherche pour "${keyword}"</h2>
        <p class="small">${results.length} résultat(s) trouvé(s)</p>
        
        ${results.length > 0 ? results.map(result => `
          <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin: 15px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h4 style="margin: 0; color: #333;">🌍 ${result.domain}</h4>
              <span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                ${result.matchingLinks.length} correspondance(s)
              </span>
            </div>
            
            <div style="margin-bottom: 10px;">
              <p><strong>URL:</strong> <a href="${result.url}" target="_blank">${result.url}</a></p>
              <p><strong>Scrapé le:</strong> ${formatDate(result.scrapedAt)}</p>
              <p><strong>Total links:</strong> ${result.totalLinks}</p>
            </div>
            
            <div style="max-height: 300px; overflow-y: auto;">
              <h5>JobTitles correspondants:</h5>
              ${result.matchingLinks.map(link => `
                <div style="background: white; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px; margin: 5px 0;">
                  <div style="font-weight: bold; color: #007bff;">${link.text}</div>
                  <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    <a href="${link.url}" target="_blank">${link.url}</a>
                  </div>
                  <div style="font-size: 11px; color: #666; margin-top: 3px;">
                    Type: ${link.isJobPosting ? 'Job Posting' : link.linkType || 'General'}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('') : `
          <div class="empty-state">
            <h3>Aucun résultat trouvé</h3>
            <p>Aucun JobTitle contenant "${keyword}" n'a été trouvé dans le cache.</p>
            <p class="small">Essayez avec un autre terme de recherche ou vérifiez que le cache contient des données.</p>
          </div>
        `}
      </div>
      ` : ''}
    `;
    
    const html = createBaseLayout('Test Cache - Keywords - Debug Tools', content);
    res.send(html);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/api/search-domains', async (req, res) => {
  try {
    const { q = '', limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        domains: []
      });
    }
    
    const searchTerm = q.toLowerCase().trim();
    let allDomains = new Set();
    
    const cacheFiles = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = cacheFiles.filter(file => file.endsWith('.json'));
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(config.CACHE_DIR, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        if (parsedData.data && parsedData.data.url) {
          try {
            const urlObj = new URL(parsedData.data.url);
            const domain = urlObj.hostname;
            
            if (domain.toLowerCase().includes(searchTerm)) {
              allDomains.add(domain);
            }
          } catch (urlError) {
            continue;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    const matchingDomains = Array.from(allDomains)
      .sort()
      .slice(0, parseInt(limit));
    
    res.json({
      success: true,
      domains: matchingDomains,
      totalFound: allDomains.size
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/test-domain', async (req, res) => {
  try {
    const { domain = '', page = 1, limit = 100 } = req.query;
    
    let selectedDomainData = null;
    let totalDomainsCount = 0;
    
    if (domain) {
      const cacheFiles = await fs.readdir(config.CACHE_DIR);
      const jsonFiles = cacheFiles.filter(file => file.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(config.CACHE_DIR, file);
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const parsedData = JSON.parse(fileContent);
          
          if (parsedData.data && parsedData.data.url) {
            try {
              const urlObj = new URL(parsedData.data.url);
              
              if (urlObj.hostname === domain) {
                selectedDomainData = {
                  domain: urlObj.hostname,
                  url: parsedData.data.url,
                  scrapedAt: parsedData.timestamp || parsedData.data.scrapedAt,
                  totalLinks: parsedData.data.links ? parsedData.data.links.length : 0,
                  links: parsedData.data.links || [],
                  platform: parsedData.data.detectedPlatform || 'Unknown',
                  language: parsedData.data.detectedLanguage || 'Unknown',
                  cacheFile: file
                };
                break;
              }
            } catch (urlError) {
              continue;
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    const cacheFiles = await fs.readdir(config.CACHE_DIR);
    const jsonFiles = cacheFiles.filter(file => file.endsWith('.json'));
    const allDomains = new Set();
    
    for (const file of jsonFiles) {
      try {
        const filePath = path.join(config.CACHE_DIR, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        if (parsedData.data && parsedData.data.url) {
          try {
            const urlObj = new URL(parsedData.data.url);
            allDomains.add(urlObj.hostname);
          } catch (urlError) {
            continue;
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    totalDomainsCount = allDomains.size;
    
    let paginatedLinks = [];
    let totalPages = 0;
    
    if (selectedDomainData) {
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + parseInt(limit);
      paginatedLinks = selectedDomainData.links.slice(startIndex, endIndex);
      totalPages = Math.ceil(selectedDomainData.links.length / limit);
    }
    
    const breadcrumb = createBreadcrumb([
      { label: 'Debug', url: '/debug' },
      { label: 'Test Domain', url: '/debug/test-domain' }
    ]);
    
    const content = `
      ${breadcrumb}
      
      <h1>Test Domain</h1>
      <p class="lead">Explorer tous les domaines scrapés et leurs liens</p>
      
      <div class="actions">
        <a href="/debug" class="button secondary">Retour au Debug</a>
        <a href="/debug/stats" class="button secondary">Scraping Statistics</a>
      </div>
      
      <div class="section">
        <h2>Recherche de Domain</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 6px;">
          <div style="display: flex; gap: 15px; align-items: end; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 400px; position: relative;">
              <label for="domain-search">Rechercher un domain:</label>
              <input type="text" id="domain-search" placeholder="Tapez pour rechercher (ex: ani, anibrain.com)..." 
                     style="width: 100%; padding: 10px; border: 1px solid #ced4da; border-radius: 4px;"
                     value="${domain}">
              <div id="domain-suggestions" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ced4da; border-top: none; border-radius: 0 0 4px 4px; max-height: 300px; overflow-y: auto; display: none; z-index: 1000;">
              </div>
            </div>
            <div>
              <label for="limit">Links par page:</label>
              <select id="limit" style="padding: 10px; border: 1px solid #ced4da; border-radius: 4px;">
                <option value="100" ${limit == 100 ? 'selected' : ''}>100</option>
                <option value="500" ${limit == 500 ? 'selected' : ''}>500</option>
                <option value="1000" ${limit == 1000 ? 'selected' : ''}>1000</option>
              </select>
            </div>
            <button id="explore-btn" class="button" disabled>🔍 Explorer</button>
          </div>
          
          <div style="margin-top: 15px;">
            <p class="small">Total des domaines disponibles: <strong>${totalDomainsCount}</strong></p>
            <p class="small">Tapez au moins 2 caractères pour rechercher des domaines (recherche inclusive, insensible à la casse)</p>
          </div>
        </div>
      </div>
      
      ${selectedDomainData ? `
      <div class="section">
        <h2>Détails du Domain: ${selectedDomainData.domain}</h2>
        
        <div class="metrics-grid">
          <div class="metrics-card">
            <h3>Informations générales</h3>
            <table>
              <tr>
                <th>Domain</th>
                <td>${selectedDomainData.domain}</td>
              </tr>
              <tr>
                <th>URL</th>
                <td><a href="${selectedDomainData.url}" target="_blank">${selectedDomainData.url}</a></td>
              </tr>
              <tr>
                <th>Platform détectée</th>
                <td>${selectedDomainData.platform}</td>
              </tr>
              <tr>
                <th>Langue détectée</th>
                <td>${selectedDomainData.language}</td>
              </tr>
              <tr>
                <th>Scrapé le</th>
                <td>${formatDate(selectedDomainData.scrapedAt)}</td>
              </tr>
              <tr>
                <th>Total des links</th>
                <td>${selectedDomainData.totalLinks}</td>
              </tr>
            </table>
          </div>
        </div>
        
        <div style="margin: 20px 0;">
          <h3>Links scrapés (${paginatedLinks.length} sur ${selectedDomainData.totalLinks})</h3>
          
          ${totalPages > 1 ? `
          <div class="actions" style="margin-bottom: 15px;">
            ${page > 1 ? `<a href="?domain=${encodeURIComponent(domain)}&limit=${limit}&page=${page - 1}" class="button secondary">← Précédent</a>` : ''}
            <span>Page ${page} sur ${totalPages}</span>
            ${page < totalPages ? `<a href="?domain=${encodeURIComponent(domain)}&limit=${limit}&page=${parseInt(page) + 1}" class="button secondary">Suivant →</a>` : ''}
          </div>
          ` : ''}
          
          <div class="responsive-table">
            <table>
              <tr>
                <th>Titre du lien</th>
                <th>URL</th>
                <th>Type</th>
                <th>Job Posting</th>
                <th>Actions</th>
              </tr>
              ${paginatedLinks.map(link => `
                <tr>
                  <td style="max-width: 300px; word-wrap: break-word;">${link.text || 'Pas de titre'}</td>
                  <td style="max-width: 400px; word-wrap: break-word;">
                    <a href="${link.url}" target="_blank" style="font-size: 12px;">${link.url}</a>
                  </td>
                  <td>${link.linkType || 'General'}</td>
                  <td>
                    <span style="background: ${link.isJobPosting ? '#28a745' : '#6c757d'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">
                      ${link.isJobPosting ? 'Oui' : 'Non'}
                    </span>
                  </td>
                  <td>
                    <a href="${link.url}" target="_blank" class="button" style="padding: 5px 10px; font-size: 12px;">Ouvrir</a>
                  </td>
                </tr>
              `).join('')}
            </table>
          </div>
          
          ${totalPages > 1 ? `
          <div class="actions" style="margin-top: 15px;">
            ${page > 1 ? `<a href="?domain=${encodeURIComponent(domain)}&limit=${limit}&page=${page - 1}" class="button secondary">← Précédent</a>` : ''}
            <span>Page ${page} sur ${totalPages}</span>
            ${page < totalPages ? `<a href="?domain=${encodeURIComponent(domain)}&limit=${limit}&page=${parseInt(page) + 1}" class="button secondary">Suivant →</a>` : ''}
          </div>
          ` : ''}
        </div>
      </div>
      ` : domain ? `
      <div class="section">
        <div class="empty-state">
          <h3>Domain non trouvé</h3>
          <p>Le domain "${domain}" n'a pas été trouvé dans le cache ou ne contient pas de données.</p>
        </div>
      </div>
      ` : `
      <div class="section">
        <div class="empty-state">
          <h3>Recherchez un domain</h3>
          <p>Tapez dans le champ de recherche ci-dessus pour trouver un domain et voir ses links scrapés.</p>
          <p class="small">Exemples de recherche: "ani", "brain", "anibrain.com", "framestore"</p>
        </div>
      </div>
      `}
    `;
    
    const additionalJS = `
      let searchTimeout;
      let selectedDomain = '${domain}';
      
      const domainSearch = document.getElementById('domain-search');
      const domainSuggestions = document.getElementById('domain-suggestions');
      const exploreBtn = document.getElementById('explore-btn');
      const limitSelect = document.getElementById('limit');
      
      domainSearch.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const query = this.value.trim();
        
        if (query.length < 2) {
          domainSuggestions.style.display = 'none';
          exploreBtn.disabled = true;
          selectedDomain = '';
          return;
        }
        
        searchTimeout = setTimeout(() => {
          searchDomains(query);
        }, 300);
      });
      
      domainSearch.addEventListener('blur', function() {
        setTimeout(() => {
          domainSuggestions.style.display = 'none';
        }, 200);
      });
      
      domainSearch.addEventListener('focus', function() {
        if (this.value.trim().length >= 2) {
          searchDomains(this.value.trim());
        }
      });
      
      exploreBtn.addEventListener('click', function() {
        if (selectedDomain) {
          const limit = limitSelect.value;
          window.location.href = '/debug/test-domain?domain=' + encodeURIComponent(selectedDomain) + '&limit=' + limit;
        }
      });
      
      function searchDomains(query) {
        fetch('/debug/api/search-domains?q=' + encodeURIComponent(query) + '&limit=20')
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              displayDomainSuggestions(data.domains, data.totalFound);
            }
          })
          .catch(error => {
            loggingService.error('Erreur de recherche:',{ error: error });
          });
      }
      
      function displayDomainSuggestions(domains, totalFound) {
        if (domains.length === 0) {
          domainSuggestions.innerHTML = '<div style="padding: 10px; color: #666;">Aucun domain trouvé</div>';
          domainSuggestions.style.display = 'block';
          exploreBtn.disabled = true;
          selectedDomain = '';
          return;
        }
        
        let html = '';
        if (totalFound > domains.length) {
          html += '<div style="padding: 8px; background: #e9ecef; color: #495057; font-size: 12px; border-bottom: 1px solid #dee2e6;">' + 
                  totalFound + ' domaines trouvés, affichage des ' + domains.length + ' premiers</div>';
        }
        
        domains.forEach(domain => {
          html += '<div class="domain-suggestion" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #dee2e6;" ' +
                  'onmouseover="this.style.backgroundColor=\\'#f8f9fa\\'" ' +
                  'onmouseout="this.style.backgroundColor=\\'white\\'" ' +
                  'onclick="selectDomain(\\''+domain+'\\')">🌍 ' + domain + '</div>';
        });
        
        domainSuggestions.innerHTML = html;
        domainSuggestions.style.display = 'block';
      }
      
      function selectDomain(domain) {
        selectedDomain = domain;
        domainSearch.value = domain;
        domainSuggestions.style.display = 'none';
        exploreBtn.disabled = false;
        exploreBtn.textContent = '🔍 Explorer ' + domain;
      }
      
      if (selectedDomain) {
        exploreBtn.disabled = false;
        exploreBtn.textContent = '🔍 Explorer ' + selectedDomain;
      }
    `;
    
    const html = createBaseLayout('Test Domain - Debug Tools', content, '', additionalJS);
    res.send(html);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/user', async (req, res) => {
  try {
    const { email, userId } = req.query;
    
    if (!email && !userId) {
      return res.status(400).json({
        success: false,
        message: 'Email ou userId requis'
      });
    }
    
    loggingService.service('UserDebug', 'debugging-user', { email, userId });    
    const debugInfo = await sessionManager.getDebugInfo(userId, email);
    
    const breadcrumb = createBreadcrumb([
      { label: 'Debug', url: '/debug' },
      { label: 'User Debug', url: '#' }
    ]);
    
    const content = `
      ${breadcrumb}
      
      <h1>🕵️ Rapport de Debug Utilisateur</h1>
      
      <div class="actions">
        <a href="/debug" class="button secondary">Retour au Debug</a>
        <a href="/debug/console/sessions" class="button secondary">Voir toutes les Sessions</a>
        <button onclick="refreshDebug()" class="button">Actualiser les données</button>
      </div>
      
      <div class="section">
        <h2>Informations Utilisateur</h2>
        <div class="metrics-grid">
          <div class="metrics-card">
            <h3>Données MongoDB Utilisateur</h3>
            ${debugInfo.userInfo ? `
              <table>
                <tr>
                  <th>MongoDB ID</th>
                  <td style="font-family: monospace;">${debugInfo.userInfo._id}</td>
                </tr>
                <tr>
                  <th>Email</th>
                  <td>${debugInfo.userInfo.email}</td>
                </tr>
                <tr>
                  <th>Nom</th>
                  <td>${debugInfo.userInfo.firstName} ${debugInfo.userInfo.lastName}</td>
                </tr>
                <tr>
                  <th>Plan</th>
                  <td>${debugInfo.userInfo.subscription.plan}</td>
                </tr>
                <tr>
                  <th>Dernière Connexion</th>
                  <td>${formatDate(debugInfo.userInfo.lastLogin)}</td>
                </tr>
              </table>
            ` : `
              <div class="alert alert-danger">
                <h4>❌ Utilisateur non trouvé dans MongoDB</h4>
                <p>Aucun utilisateur trouvé avec ${email ? `email: ${email}` : `ID: ${userId}`}</p>
              </div>
            `}
          </div>
          
          <div class="metrics-card">
            <h3>Statistiques de Session</h3>
            <table>
              <tr>
                <th>Total Sessions trouvées</th>
                <td>${debugInfo.sessionCount}</td>
              </tr>
              <tr>
                <th>Sessions en mémoire</th>
                <td>${debugInfo.totalSessionsInMemory}</td>
              </tr>
              <tr>
                <th>Paramètres de recherche</th>
                <td>${email ? `Email: ${email}` : ''}${userId ? `ID: ${userId}` : ''}</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h2>Cache Email Utilisateur</h2>
        <div class="metrics-card">
          <h3>Emails Utilisateur en Cache</h3>
          ${debugInfo.userEmailCache.length > 0 ? `
            <table>
              <tr>
                <th>User ID</th>
                <th>Email en Cache</th>
              </tr>
              ${debugInfo.userEmailCache.map(([id, email]) => `
                <tr>
                  <td style="font-family: monospace;">${id}</td>
                  <td>${email}</td>
                </tr>
              `).join('')}
            </table>
          ` : '<p>Aucun email en cache pour le moment</p>'}
        </div>
      </div>
      
      <div class="section">
        <h2>Sessions trouvées</h2>
        ${debugInfo.sessions.length > 0 ? `
          <div class="responsive-table">
            <table>
              <tr>
                <th>Session ID</th>
                <th>User ID</th>
                <th>User Email</th>
                <th>Requête de recherche</th>
                <th>Statut</th>
                <th>Démarré</th>
                <th>URLs</th>
                <th>Actions</th>
              </tr>
              ${debugInfo.sessions.map(session => `
                <tr>
                  <td style="font-family: monospace; font-size: 11px;">${session.id.substring(0, 20)}...</td>
                  <td style="font-family: monospace; font-size: 11px;">${session.userId}</td>
                  <td>${session.userEmail || 'N/A'}</td>
                  <td>${session.searchQuery}</td>
                  <td>
                    <span style="background: ${session.status === 'completed' ? '#28a745' : session.status === 'running' ? '#007bff' : '#dc3545'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">
                      ${session.status.toUpperCase()}
                    </span>
                  </td>
                  <td>${formatDate(session.startTime)}</td>
                  <td>${session.totalUrls}</td>
                  <td>
                    <a href="/debug/console/sessions/${session.id}" class="button" style="padding: 3px 8px; font-size: 11px;">Voir</a>
                  </td>
                </tr>
              `).join('')}
            </table>
          </div>
        ` : `
          <div class="alert alert-warning">
            <h4>⚠️ Aucune Session trouvée</h4>
            <p>Aucune session de scraping trouvée pour cet utilisateur.</p>
            <p><strong>Raisons possibles :</strong></p>
            <ul>
              <li>L'utilisateur n'a jamais démarré de session de scraping</li>
              <li>Les sessions ont été créées avec un userId/email incorrect</li>
              <li>Les sessions sont plus anciennes que la période de rétention des fichiers</li>
              <li>L'API crée des sessions avec un userId "anonymous" au lieu du vrai ID MongoDB</li>
            </ul>
          </div>
        `}
      </div>
      
      <div class="section">
        <h2>Actions de Diagnostic</h2>
        <div class="actions">
          <button onclick="testUserSession()" class="button">🧪 Tester Création Session</button>
          <button onclick="checkUserPreferences()" class="button secondary">📄 Vérifier Préférences Utilisateur</button>
          <a href="/debug/console/sessions?userEmail=${email || ''}" class="button secondary">🔍 Rechercher Sessions par Email</a>
          <a href="/debug/console/sessions?userId=${userId || ''}" class="button secondary">🔍 Rechercher Sessions par ID</a>
        </div>
      </div>
      
      <div class="section">
        <h2>Données de Debug brutes</h2>
        <details>
          <summary style="cursor: pointer; padding: 10px; background: #f8f9fa; border-radius: 4px;">Voir les informations complètes de Debug</summary>
          <pre style="background: #f8f9fa; padding: 15px; border-radius: 4px; overflow: auto; max-height: 400px; margin-top: 10px; font-size: 11px;">${JSON.stringify(debugInfo, null, 2)}</pre>
        </details>
      </div>
    `;
    
    const additionalJS = `
      function refreshDebug() {
        window.location.reload();
      }
      
      function testUserSession() {
        const userId = '${debugInfo.userInfo ? debugInfo.userInfo._id : userId || 'test_user'}';
        const userEmail = '${debugInfo.userInfo ? debugInfo.userInfo.email : email || 'test@example.com'}';
        
        const testData = {
          userId: userId,
          userEmail: userEmail,
          searchQuery: 'Test Session - Debug',
          urls: ['https://example.com/careers']
        };
        
        fetch('/api/scraping/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(testData)
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('✅ Session de test créée avec succès ! Vérifiez la page Sessions.');
            setTimeout(() => window.location.reload(), 2000);
          } else {
            alert('❌ Échec de la création de la session de test : ' + data.message);
          }
        })
        .catch(error => {
          alert('❌ Erreur : ' + error.message);
        });
      }
      
      function checkUserPreferences() {
        const userId = '${debugInfo.userInfo ? debugInfo.userInfo._id : userId || ''}';
        if (!userId) {
          alert('Aucun ID utilisateur disponible');
          return;
        }
        
        window.open('/debug/files?dir=user_preferences&file=user_' + userId + '.json', '_blank');
      }
    `;
    
    const html = createBaseLayout(`User Debug: ${email || userId} - Debug Tools`, content, '', additionalJS);
    res.send(html);
    
  } catch (error) {
    loggingService.error('User debug error:',{ error: error });
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
});

router.use('/scraping', scrapingRoutes);
router.use('/cache', cacheRoutes);
router.use('/files', fileRoutes);
router.use('/stats', statsRoutes);
router.use('/console', consoleRoutes);

router.get('/scrape', (req, res) => {
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  res.redirect('/debug/scraping/test' + (queryString ? `?${queryString}` : ''));
});

router.get('/scraping-stats', (req, res) => {
  const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
  res.redirect('/debug/stats' + queryString);
});

router.get('/search', (req, res) => {
  res.json({
    success: false,
    message: 'Fonction de recherche non disponible depuis les routes de debug. Utilisez l\'interface principale.',
    redirect: '/debug/scraping/test'
  });
});

router.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round(uptime),
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    }
  });
});

router.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Points de terminaison API Debug',
    endpoints: {
      main: '/debug',
      scraping: '/debug/scraping/*',
      sessions: '/debug/console/sessions/*',
      cache: '/debug/cache/*',
      files: '/debug/files/*',
      stats: '/debug/stats/*',
      console: '/debug/console/*',
      user: '/debug/user',
      health: '/debug/health',
      testCacheKeywords: '/debug/test-cache-keywords',
      testDomain: '/debug/test-domain',
      searchDomains: '/debug/api/search-domains'
    },
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

router.get('/console/domains', async (req, res) => {
  try {
    const { loadAllSessionsFromFiles, scrapingSessions } = require('./consoleRoutes');
    
    const allSessionsFromFiles = await loadAllSessionsFromFiles();
    const memorySessions = Array.from(scrapingSessions.values());
    
    const sessionMap = new Map();
    allSessionsFromFiles.forEach((session, id) => sessionMap.set(id, session));
    memorySessions.forEach(session => sessionMap.set(session.id, session));
    
    const sessions = Array.from(sessionMap.values())
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .slice(0, 20);
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Session Logs by Domain', url: '/debug/console/domains' }
      ]);
      
      const sessionsList = sessions.map(session => `
        <div class="session-card" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin: 10px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0; color: #333;">
              ${session.searchQuery || 'Requête inconnue'}
            </h4>
            <span style="background: ${session.status === 'running' ? '#28a745' : session.status === 'completed' ? '#007bff' : '#6c757d'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
              ${session.status || 'inconnu'}
            </span>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 10px; font-size: 13px;">
            <div><strong>Utilisateur:</strong> ${session.userEmail || session.userId || 'Inconnu'}</div>
            <div><strong>URLs:</strong> ${session.totalUrls || 0}</div>
            <div><strong>Démarré:</strong> ${formatDate(session.startTime)}</div>
            <div><strong>Durée:</strong> ${session.duration ? Math.round(session.duration / 1000) + 's' : 'N/A'}</div>
          </div>
          
          <div style="margin-top: 10px;">
            <a href="/debug/console/sessions/${session.id}/domains" class="button" style="padding: 8px 12px; font-size: 13px;">🌐 Voir les Logs par Domain</a>
            <a href="/debug/console/sessions/${session.id}" class="button secondary" style="padding: 8px 12px; font-size: 13px;">📋 Détails de Session</a>
          </div>
        </div>
      `).join('');
      
      const content = `
        ${breadcrumb}
        
        <h1>Session Logs by Domain</h1>
        <p class="lead">Analyser les logs par domain pour chaque session de scraping</p>
        
        <div class="actions">
          <a href="/debug" class="button secondary">Retour au Debug</a>
          <a href="/debug/console/sessions" class="button secondary">Toutes les Sessions</a>
          <a href="/debug/console/logs" class="button secondary">Tous les Logs</a>
        </div>
        
        <div class="section">
          <h2>Sessions récentes (${sessions.length})</h2>
          <p class="small">Sélectionnez une session pour voir les logs organisés par domain</p>
          
          ${sessions.length > 0 ? sessionsList : `
            <div class="empty-state">
              <h3>Aucune session trouvée</h3>
              <p>Aucune session récente disponible. Démarrez une session de scraping pour voir les logs organisés par domain.</p>
              <a href="/debug/scraping/test" class="button">Démarrer une Session de Test</a>
            </div>
          `}
        </div>
      `;
      
      const html = createBaseLayout('Session Logs by Domain - Debug Tools', content);
      res.send(html);
    } else {
      res.json({
        success: true,
        sessions: sessions
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