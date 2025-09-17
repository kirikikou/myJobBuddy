const express = require('express');
const ErrorLogger = require('../../utils/ErrorLogger');
const { createBaseLayout, createBreadcrumb } = require('./utils/htmlTemplates');
const { formatDate } = require('./utils/formatters');

const router = express.Router();

const loggingService = require('../../services/LoggingService');
router.get('/errors/dashboard', async (req, res) => {
  try {
    const {
      timeframe = '24h',
      domain = null,
      step = null,
      errorType = null,
      severity = null
    } = req.query;
    
    const filters = { domain, step, errorType, severity };
    if (timeframe === '24h') {
      filters.startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    } else if (timeframe === '7d') {
      filters.startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (timeframe === '30d') {
      filters.startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    
    const report = await ErrorLogger.generateErrorReport(filters);
    const currentStats = ErrorLogger.getCurrentStats();
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Error Analysis', url: '/debug/errors/dashboard' }
      ]);
      
      const timeframeOptions = [
        { value: '24h', label: '24 heures', selected: timeframe === '24h' },
        { value: '7d', label: '7 jours', selected: timeframe === '7d' },
        { value: '30d', label: '30 jours', selected: timeframe === '30d' }
      ].map(opt => `<option value="${opt.value}" ${opt.selected ? 'selected' : ''}>${opt.label}</option>`).join('');
      
      const errorTypeOptions = [
        '',
        'NoResult',
        'Timeout',
        'PlatformError',
        'NetworkError', 
        'ParsingError',
        'EmptyDomain',
        'AuthenticationError',
        'RateLimit',
        'Unknown'
      ].map(type => `<option value="${type}" ${errorType === type ? 'selected' : ''}>${type || 'Tous les types'}</option>`).join('');
      
      const severityOptions = [
        '',
        'info',
        'low',
        'medium', 
        'high'
      ].map(sev => `<option value="${sev}" ${severity === sev ? 'selected' : ''}>${sev || 'Toutes les sévérités'}</option>`).join('');
      
      const topDomainsChart = report.insights.mostProblematicDomains.slice(0, 10).map(item => `
        <div class="chart-bar">
          <div class="chart-label">${item.key}</div>
          <div class="chart-value-bar">
            <div class="chart-fill" style="width: ${(item.count / report.insights.mostProblematicDomains[0].count) * 100}%"></div>
            <span class="chart-value">${item.count}</span>
          </div>
        </div>
      `).join('');
      
      const topStepsChart = report.insights.mostFailedSteps.slice(0, 10).map(item => `
        <div class="chart-bar">
          <div class="chart-label">${item.key}</div>
          <div class="chart-value-bar">
            <div class="chart-fill" style="width: ${(item.count / report.insights.mostFailedSteps[0].count) * 100}%"></div>
            <span class="chart-value">${item.count}</span>
          </div>
        </div>
      `).join('');
      
      const errorTypeChart = report.insights.errorDistribution.map(item => `
        <div class="chart-bar">
          <div class="chart-label">${item.key}</div>
          <div class="chart-value-bar">
            <div class="chart-fill" style="width: ${(item.count / report.insights.errorDistribution[0].count) * 100}%"></div>
            <span class="chart-value">${item.count}</span>
          </div>
        </div>
      `).join('');
      
      const severityChart = report.insights.severityDistribution.map(item => {
        const color = item.key === 'high' ? '#dc3545' : 
                     item.key === 'medium' ? '#ffc107' : 
                     item.key === 'low' ? '#28a745' : '#6c757d';
        return `
          <div class="chart-bar">
            <div class="chart-label">${item.key}</div>
            <div class="chart-value-bar">
              <div class="chart-fill" style="width: ${(item.count / report.insights.severityDistribution[0].count) * 100}%; background-color: ${color};"></div>
              <span class="chart-value">${item.count}</span>
            </div>
          </div>
        `;
      }).join('');
      
      const emptyDomainsList = report.emptyDomains.slice(0, 20).map(domain => `
        <tr>
          <td><a href="/debug/errors/domain/${domain.domain}" style="color: #007bff;">${domain.domain}</a></td>
          <td>${domain.noResultCount}</td>
          <td>${domain.totalErrors}</td>
          <td>${Math.round(domain.ratio * 100)}%</td>
          <td style="color: ${domain.status === 'likely_empty' ? '#dc3545' : '#ffc107'};">${domain.status}</td>
          <td class="small">${formatDate(domain.lastError)}</td>
        </tr>
      `).join('');
      
      const recentErrorsList = report.errors.slice(0, 20).map(error => {
        const severityColor = error.severity === 'high' ? '#dc3545' : 
                             error.severity === 'medium' ? '#ffc107' : 
                             error.severity === 'low' ? '#28a745' : '#6c757d';
        return `
          <tr>
            <td class="small">${formatDate(error.timestamp)}</td>
            <td><a href="/debug/errors/domain/${error.domain}" style="color: #007bff;">${error.domain}</a></td>
            <td>${error.step}</td>
            <td><span style="background: ${severityColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">${error.severity}</span></td>
            <td>${error.errorType}</td>
            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${error.message}</td>
            <td>${error.executionTime}ms</td>
          </tr>
        `;
      }).join('');
      
      const content = `
        ${breadcrumb}
        
        <h1>🚨 Analyse des Erreurs</h1>
        
        <div class="actions">
          <a href="/debug/errors/live" class="button">🔴 Monitoring Live</a>
          <a href="/debug/errors/export" class="button secondary">📥 Export Données</a>
          <a href="/debug/errors/empty-domains" class="button secondary">🏷️ Domaines Vides</a>
          <a href="/debug" class="button secondary">🔙 Retour Debug</a>
        </div>
        
        <div class="filters">
          <form method="get" style="display: flex; gap: 10px; align-items: end; margin-bottom: 20px; flex-wrap: wrap;">
            <div>
              <label for="timeframe">Période:</label>
              <select name="timeframe" id="timeframe">${timeframeOptions}</select>
            </div>
            <div>
              <label for="domain">Domaine:</label>
              <input type="text" name="domain" id="domain" value="${domain || ''}" placeholder="Filtrer par domaine">
            </div>
            <div>
              <label for="step">Step:</label>
              <input type="text" name="step" id="step" value="${step || ''}" placeholder="Filtrer par step">
            </div>
            <div>
              <label for="errorType">Type d'erreur:</label>
              <select name="errorType" id="errorType">${errorTypeOptions}</select>
            </div>
            <div>
              <label for="severity">Sévérité:</label>
              <select name="severity" id="severity">${severityOptions}</select>
            </div>
            <button type="submit" class="button">🔍 Filtrer</button>
          </form>
        </div>
        
        <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;">
          <div class="metrics-card">
            <h3>📊 Statistiques Générales</h3>
            <table>
              <tr><th>Total Erreurs</th><td>${report.totalErrors}</td></tr>
              <tr><th>En Buffer</th><td>${currentStats.totalBuffered}</td></tr>
              <tr><th>Dernière Heure</th><td>${currentStats.recentHour}</td></tr>
              <tr><th>Domaines Vides</th><td>${report.emptyDomains.length}</td></tr>
            </table>
          </div>
          
          <div class="metrics-card">
            <h3>🎯 Top Sévérités</h3>
            <div class="chart-container">
              ${severityChart}
            </div>
          </div>
          
          <div class="metrics-card">
            <h3>🏷️ Types d'Erreurs</h3>
            <div class="chart-container">
              ${errorTypeChart.slice(0, 5)}
            </div>
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
          <div class="section">
            <h2>🌐 Domaines les Plus Problématiques</h2>
            <div class="chart-container">
              ${topDomainsChart}
            </div>
            <div style="margin-top: 15px;">
              <a href="/debug/errors/domains" class="button small">Voir Tous les Domaines</a>
            </div>
          </div>
          
          <div class="section">
            <h2>⚙️ Steps les Plus Échoués</h2>
            <div class="chart-container">
              ${topStepsChart}
            </div>
            <div style="margin-top: 15px;">
              <a href="/debug/errors/steps" class="button small">Voir Tous les Steps</a>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>🏷️ Domaines Probablement Vides (${report.emptyDomains.length})</h2>
          <p class="small">Domaines avec >80% d'erreurs "NoResult" et minimum 3 erreurs</p>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Domaine</th>
                  <th>NoResult</th>
                  <th>Total Erreurs</th>
                  <th>Ratio</th>
                  <th>Status</th>
                  <th>Dernière Erreur</th>
                </tr>
              </thead>
              <tbody>
                ${emptyDomainsList || '<tr><td colspan="6">Aucun domaine vide détecté</td></tr>'}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 15px;">
            <a href="/debug/errors/empty-domains" class="button small">Voir Liste Complète</a>
          </div>
        </div>
        
        <div class="section">
          <h2>🕒 Erreurs Récentes (${report.errors.length})</h2>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Domaine</th>
                  <th>Step</th>
                  <th>Sévérité</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Temps</th>
                </tr>
              </thead>
              <tbody>
                ${recentErrorsList || '<tr><td colspan="7">Aucune erreur trouvée</td></tr>'}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 15px;">
            <a href="/debug/errors/list" class="button small">Voir Liste Complète</a>
          </div>
        </div>
      `;
      
      const additionalCSS = `
        .chart-container { margin: 10px 0; }
        .chart-bar { display: flex; align-items: center; margin: 8px 0; }
        .chart-label { min-width: 120px; font-size: 12px; margin-right: 10px; }
        .chart-value-bar { flex: 1; position: relative; background: #e9ecef; height: 20px; border-radius: 3px; }
        .chart-fill { background: #007bff; height: 100%; border-radius: 3px; transition: width 0.3s; }
        .chart-value { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: bold; color: white; }
        .metrics-grid { display: grid; gap: 15px; margin-bottom: 20px; }
        .metrics-card { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; }
        .metrics-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #495057; }
        .metrics-card table th { text-align: left; padding: 3px 0; font-size: 12px; }
        .metrics-card table td { text-align: right; padding: 3px 0; font-size: 12px; font-weight: bold; }
      `;
      
      const html = createBaseLayout('Analyse des Erreurs - Debug Tools', content, additionalCSS);
      res.send(html);
    } else {
      res.json({
        success: true,
        report,
        currentStats,
        filters
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/errors/live', async (req, res) => {
  try {
    const breadcrumb = createBreadcrumb([
      { label: 'Debug', url: '/debug' },
      { label: 'Error Analysis', url: '/debug/errors/dashboard' },
      { label: 'Live Monitor', url: '/debug/errors/live' }
    ]);
    
    const content = `
      ${breadcrumb}
      
      <h1>🔴 Monitoring Live des Erreurs</h1>
      
      <div class="actions">
        <a href="/debug/errors/dashboard" class="button secondary">🔙 Dashboard</a>
        <button onclick="clearMonitor()" class="button secondary">🧹 Vider</button>
        <button onclick="toggleMonitoring()" class="button" id="toggleBtn">⏸️ Pause</button>
        <button onclick="exportErrors()" class="button secondary">📥 Export</button>
      </div>
      
      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div class="metrics-card">
          <h3>📊 Stats Session</h3>
          <table>
            <tr><th>Erreurs Captées</th><td id="error-count">0</td></tr>
            <tr><th>High Severity</th><td id="high-count">0</td></tr>
            <tr><th>Medium Severity</th><td id="medium-count">0</td></tr>
            <tr><th>Low Severity</th><td id="low-count">0</td></tr>
            <tr><th>Durée Session</th><td id="session-duration">0s</td></tr>
          </table>
        </div>
        
        <div class="metrics-card">
          <h3>🎯 Top Domaines</h3>
          <div id="top-domains">
            <div class="small">Aucune donnée</div>
          </div>
        </div>
        
        <div class="metrics-card">
          <h3>🏷️ Types d'Erreurs</h3>
          <div id="error-types">
            <div class="small">Aucune donnée</div>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h2>🚨 Flux d'Erreurs en Temps Réel</h2>
        <p class="small">Les erreurs s'affichent automatiquement ici. Les erreurs critiques sont surlignées.</p>
        
        <div class="filters" style="margin-bottom: 15px;">
          <label><input type="checkbox" id="filterHigh" checked> High Severity</label>
          <label><input type="checkbox" id="filterMedium" checked> Medium Severity</label>
          <label><input type="checkbox" id="filterLow" checked> Low Severity</label>
          <label><input type="checkbox" id="filterInfo" checked> Info</label>
        </div>
        
        <div id="error-stream" style="background: #1e1e1e; color: #fff; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; max-height: 600px; overflow-y: auto; border: 2px solid #343a40;">
          <div style="color: #28a745;">🔴 Monitoring d'erreurs initialisé. En attente d'activité...</div>
        </div>
      </div>
      
      <div class="section">
        <h2>📋 Historique Session</h2>
        <div id="session-errors" style="max-height: 300px; overflow-y: auto;">
          <div class="empty-state">Aucune erreur capturée dans cette session</div>
        </div>
      </div>
    `;
    
    const additionalJS = `
      let monitoring = true;
      let sessionErrors = [];
      let errorCounts = { total: 0, high: 0, medium: 0, low: 0, info: 0 };
      let domainCounts = {};
      let typeCounts = {};
      let sessionStart = Date.now();
      
      function updateSessionDuration() {
        const duration = Math.floor((Date.now() - sessionStart) / 1000);
        document.getElementById('session-duration').textContent = duration + 's';
      }
      
      setInterval(updateSessionDuration, 1000);
      setInterval(fetchLatestErrors, 3000);
      
      function addErrorToStream(error) {
        if (!monitoring) return;
        
        const stream = document.getElementById('error-stream');
        const time = new Date(error.timestamp).toLocaleTimeString();
        
        const severityColors = {
          high: '#dc3545',
          medium: '#ffc107', 
          low: '#28a745',
          info: '#17a2b8'
        };
        
        const color = severityColors[error.severity] || '#6c757d';
        const shouldShow = document.getElementById('filter' + error.severity.charAt(0).toUpperCase() + error.severity.slice(1)).checked;
        
        if (!shouldShow) return;
        
        const entry = document.createElement('div');
        entry.style.borderLeft = '3px solid ' + color;
        entry.style.paddingLeft = '10px';
        entry.style.marginBottom = '8px';
        entry.style.background = error.severity === 'high' ? 'rgba(220, 53, 69, 0.1)' : 'transparent';
        
        entry.innerHTML = 
          '[' + time + '] ' +
          '<span style="color: ' + color + '; font-weight: bold;">[' + error.severity.toUpperCase() + ']</span> ' +
          '<span style="color: #ffc107;">' + error.domain + '</span> ' +
          '<span style="color: #17a2b8;">' + error.step + '</span> ' +
          '<span style="color: #6c757d;">' + error.errorType + '</span><br>' +
          '<span style="color: #adb5bd; font-size: 11px;">' + error.message + '</span>' +
          (error.executionTime ? ' <span style="color: #6c757d;">(' + error.executionTime + 'ms)</span>' : '');
        
        stream.appendChild(entry);
        stream.scrollTop = stream.scrollHeight;
        
        if (stream.children.length > 200) {
          stream.removeChild(stream.children[1]);
        }
        
        updateCounts(error);
        updateStats();
      }
      
      function updateCounts(error) {
        errorCounts.total++;
        errorCounts[error.severity]++;
        
        domainCounts[error.domain] = (domainCounts[error.domain] || 0) + 1;
        typeCounts[error.errorType] = (typeCounts[error.errorType] || 0) + 1;
        
        sessionErrors.push(error);
        if (sessionErrors.length > 1000) {
          sessionErrors = sessionErrors.slice(-1000);
        }
      }
      
      function updateStats() {
        document.getElementById('error-count').textContent = errorCounts.total;
        document.getElementById('high-count').textContent = errorCounts.high;
        document.getElementById('medium-count').textContent = errorCounts.medium;
        document.getElementById('low-count').textContent = errorCounts.low;
        
        const topDomains = Object.entries(domainCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([domain, count]) => '<div style="font-size: 11px;">' + domain + ': ' + count + '</div>')
          .join('');
        document.getElementById('top-domains').innerHTML = topDomains || '<div class="small">Aucune donnée</div>';
        
        const topTypes = Object.entries(typeCounts)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([type, count]) => '<div style="font-size: 11px;">' + type + ': ' + count + '</div>')
          .join('');
        document.getElementById('error-types').innerHTML = topTypes || '<div class="small">Aucune donnée</div>';
        
        updateSessionHistory();
      }
      
      function updateSessionHistory() {
        const sessionDiv = document.getElementById('session-errors');
        const recentErrors = sessionErrors.slice(-20).reverse();
        
        if (recentErrors.length === 0) {
          sessionDiv.innerHTML = '<div class="empty-state">Aucune erreur capturée dans cette session</div>';
          return;
        }
        
        const html = recentErrors.map(error => {
          const severityColor = error.severity === 'high' ? '#dc3545' : 
                               error.severity === 'medium' ? '#ffc107' : 
                               error.severity === 'low' ? '#28a745' : '#6c757d';
          return 
            '<div style="border-left: 3px solid ' + severityColor + '; padding: 8px; margin: 5px 0; background: #f8f9fa;">' +
            '<div style="display: flex; justify-content: space-between; margin-bottom: 5px;">' +
            '<strong>' + error.domain + ' - ' + error.step + '</strong>' +
            '<span style="background: ' + severityColor + '; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">' + error.severity + '</span>' +
            '</div>' +
            '<div style="font-size: 12px; color: #6c757d;">' + error.errorType + ': ' + error.message + '</div>' +
            '<div style="font-size: 11px; color: #adb5bd;">' + new Date(error.timestamp).toLocaleString() + '</div>' +
            '</div>';
        }).join('');
        
        sessionDiv.innerHTML = html;
      }
      
      function fetchLatestErrors() {
        if (!monitoring) return;
        
        fetch('/debug/errors/api/recent?limit=10', {
          headers: { 'Accept': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success && data.errors.length > 0) {
            data.errors.forEach(error => {
              const errorExists = sessionErrors.some(e => e.id === error.id);
              if (!errorExists) {
                addErrorToStream(error);
              }
            });
          }
        })
        .catch(error => {
          loggingService.error('Failed to fetch errors:',{ error: error });
        });
      }
      
      function clearMonitor() {
        document.getElementById('error-stream').innerHTML = '<div style="color: #28a745;">🧹 Monitor vidé.</div>';
        sessionErrors = [];
        errorCounts = { total: 0, high: 0, medium: 0, low: 0, info: 0 };
        domainCounts = {};
        typeCounts = {};
        updateStats();
      }
      
      function toggleMonitoring() {
        monitoring = !monitoring;
        const btn = document.getElementById('toggleBtn');
        btn.textContent = monitoring ? '⏸️ Pause' : '▶️ Resume';
        btn.className = monitoring ? 'button' : 'button secondary';
      }
      
      function exportErrors() {
        const dataStr = JSON.stringify(sessionErrors, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'session-errors-' + new Date().toISOString().split('T')[0] + '.json';
        link.click();
      }
    `;
    
    const html = createBaseLayout('Live Error Monitor - Debug Tools', content, '', additionalJS);
    res.send(html);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/errors/api/recent', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const filters = { limit: parseInt(limit) };
    
    const summary = await ErrorLogger.getErrorSummary(filters);
    
    res.json({
      success: true,
      errors: summary.errors,
      totalErrors: summary.totalErrors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/errors/empty-domains', async (req, res) => {
  try {
    const emptyDomains = await ErrorLogger.detectEmptyDomains();
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Error Analysis', url: '/debug/errors/dashboard' },
        { label: 'Domaines Vides', url: '/debug/errors/empty-domains' }
      ]);
      
      const domainsList = emptyDomains.map(domain => `
        <tr>
          <td><a href="/debug/errors/domain/${domain.domain}" style="color: #007bff;">${domain.domain}</a></td>
          <td>${domain.noResultCount}</td>
          <td>${domain.totalErrors}</td>
          <td>
            <div style="background: #e9ecef; border-radius: 10px; height: 16px; position: relative;">
              <div style="background: #dc3545; height: 100%; border-radius: 10px; width: ${domain.ratio * 100}%;"></div>
              <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 11px; font-weight: bold;">${Math.round(domain.ratio * 100)}%</span>
            </div>
          </td>
          <td>
            <span style="background: ${domain.status === 'likely_empty' ? '#dc3545' : '#ffc107'}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px;">
              ${domain.status}
            </span>
          </td>
          <td class="small">${formatDate(domain.lastError)}</td>
          <td>
            <a href="/debug/errors/domain/${domain.domain}" class="button small">Analyser</a>
          </td>
        </tr>
      `).join('');
      
      const content = `
        ${breadcrumb}
        
        <h1>🏷️ Domaines Probablement Vides</h1>
        <p class="small">Domaines avec >80% d'erreurs "NoResult" et minimum 3 erreurs totales</p>
        
        <div class="actions">
          <a href="/debug/errors/dashboard" class="button secondary">🔙 Dashboard</a>
          <a href="/debug/errors/export?type=empty-domains" class="button">📥 Export Liste</a>
        </div>
        
        <div class="section">
          <h2>Domaines Détectés (${emptyDomains.length})</h2>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Domaine</th>
                  <th>NoResult</th>
                  <th>Total Erreurs</th>
                  <th>Ratio NoResult</th>
                  <th>Status</th>
                  <th>Dernière Erreur</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${domainsList || '<tr><td colspan="7">Aucun domaine vide détecté</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="section">
          <h2>💡 Recommandations</h2>
          <div style="background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 5px; padding: 15px;">
            <h4>Pour ces domaines "vides" :</h4>
            <ul>
              <li>Vérifier manuellement s'ils ont réellement des offres d'emploi</li>
              <li>Analyser la structure de leur page carrière</li>
              <li>Ajuster les selectors de détection si nécessaire</li>
              <li>Les marquer comme "pas de jobs" dans la configuration si confirmé</li>
              <li>Implémenter une logique de retry différente pour ces cas</li>
            </ul>
          </div>
        </div>
      `;
      
      const html = createBaseLayout('Domaines Vides - Debug Tools', content);
      res.send(html);
    } else {
      res.json({
        success: true,
        emptyDomains,
        totalEmpty: emptyDomains.length
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/errors/domain/:domain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const filters = { domain, limit: 200 };
    
    const summary = await ErrorLogger.getErrorSummary(filters);
    const domainErrors = summary.errors;
    
    const acceptHeader = req.headers.accept || '';
    
    if (acceptHeader.includes('text/html')) {
      const breadcrumb = createBreadcrumb([
        { label: 'Debug', url: '/debug' },
        { label: 'Error Analysis', url: '/debug/errors/dashboard' },
        { label: `Domaine: ${domain}`, url: '#' }
      ]);
      
      const errorsByStep = {};
      const errorsByType = {};
      let totalExecutionTime = 0;
      
      domainErrors.forEach(error => {
        if (!errorsByStep[error.step]) {
          errorsByStep[error.step] = [];
        }
        errorsByStep[error.step].push(error);
        
        errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;
        totalExecutionTime += error.executionTime || 0;
      });
      
      const stepAnalysis = Object.entries(errorsByStep).map(([step, errors]) => {
        const avgTime = errors.reduce((sum, e) => sum + (e.executionTime || 0), 0) / errors.length;
        const mostCommonType = errors.reduce((acc, e) => {
          acc[e.errorType] = (acc[e.errorType] || 0) + 1;
          return acc;
        }, {});
        const topType = Object.entries(mostCommonType).sort(([,a], [,b]) => b - a)[0];
        
        return `
          <tr>
            <td><strong>${step}</strong></td>
            <td>${errors.length}</td>
            <td>${Math.round(avgTime)}ms</td>
            <td>${topType ? topType[0] : 'N/A'}</td>
            <td class="small">${formatDate(errors[0].timestamp)}</td>
            <td><a href="#" onclick="showStepErrors('${step}')" class="button small">Voir Erreurs</a></td>
          </tr>
        `;
      }).join('');
      
      const typeChart = Object.entries(errorsByType).map(([type, count]) => `
        <div class="chart-bar">
          <div class="chart-label">${type}</div>
          <div class="chart-value-bar">
            <div class="chart-fill" style="width: ${(count / domainErrors.length) * 100}%"></div>
            <span class="chart-value">${count}</span>
          </div>
        </div>
      `).join('');
      
      const recentErrorsList = domainErrors.slice(0, 50).map(error => {
        const severityColor = error.severity === 'high' ? '#dc3545' : 
                             error.severity === 'medium' ? '#ffc107' : 
                             error.severity === 'low' ? '#28a745' : '#6c757d';
        return `
          <tr>
            <td class="small">${formatDate(error.timestamp)}</td>
            <td>${error.step}</td>
            <td><span style="background: ${severityColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">${error.severity}</span></td>
            <td>${error.errorType}</td>
            <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${error.message}</td>
            <td>${error.executionTime}ms</td>
          </tr>
        `;
      }).join('');
      
      const content = `
        ${breadcrumb}
        
        <h1>🌐 Analyse du Domaine: ${domain}</h1>
        
        <div class="actions">
          <a href="/debug/errors/dashboard" class="button secondary">🔙 Dashboard</a>
          <a href="/debug/errors/export?domain=${domain}" class="button">📥 Export Erreurs</a>
          <a href="https://${domain}" target="_blank" class="button secondary">🔗 Visiter Site</a>
        </div>
        
        <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
          <div class="metrics-card">
            <h3>📊 Statistiques</h3>
            <table>
              <tr><th>Total Erreurs</th><td>${domainErrors.length}</td></tr>
              <tr><th>Steps Affectés</th><td>${Object.keys(errorsByStep).length}</td></tr>
              <tr><th>Types d'Erreurs</th><td>${Object.keys(errorsByType).length}</td></tr>
              <tr><th>Temps Total</th><td>${Math.round(totalExecutionTime / 1000)}s</td></tr>
              <tr><th>Temps Moyen</th><td>${Math.round(totalExecutionTime / domainErrors.length)}ms</td></tr>
            </table>
          </div>
          
          <div class="metrics-card">
            <h3>🏷️ Distribution des Types</h3>
            <div class="chart-container">
              ${typeChart}
            </div>
          </div>
        </div>
        
        <div class="section">
          <h2>⚙️ Analyse par Step</h2>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Erreurs</th>
                  <th>Temps Moyen</th>
                  <th>Type Principal</th>
                  <th>Dernière Erreur</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${stepAnalysis}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="section">
          <h2>🕒 Historique des Erreurs (${domainErrors.length})</h2>
          <div class="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Step</th>
                  <th>Sévérité</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Temps</th>
                </tr>
              </thead>
              <tbody>
                ${recentErrorsList}
              </tbody>
            </table>
          </div>
        </div>
        
        <div id="step-errors-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; max-width: 80%; max-height: 80%; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <h3 id="modal-title">Erreurs du Step</h3>
              <button onclick="closeModal()" class="button secondary">✕ Fermer</button>
            </div>
            <div id="modal-content"></div>
          </div>
        </div>
      `;
      
      const additionalJS = `
        const errorsByStep = ${JSON.stringify(errorsByStep)};
        
        function showStepErrors(step) {
          const errors = errorsByStep[step];
          const modal = document.getElementById('step-errors-modal');
          const title = document.getElementById('modal-title');
          const content = document.getElementById('modal-content');
          
          title.textContent = 'Erreurs du Step: ' + step + ' (' + errors.length + ')';
          
          const html = errors.map(error => 
            '<div style="border-left: 3px solid #dc3545; padding: 10px; margin: 8px 0; background: #f8f9fa;">' +
            '<div><strong>' + new Date(error.timestamp).toLocaleString() + '</strong></div>' +
            '<div style="margin: 5px 0;">Type: ' + error.errorType + ' | Sévérité: ' + error.severity + '</div>' +
            '<div style="font-family: monospace; font-size: 12px; color: #6c757d;">' + error.message + '</div>' +
            '<div style="font-size: 11px; color: #adb5bd;">Temps: ' + (error.executionTime || 0) + 'ms</div>' +
            '</div>'
          ).join('');
          
          content.innerHTML = html;
          modal.style.display = 'block';
        }
        
        function closeModal() {
          document.getElementById('step-errors-modal').style.display = 'none';
        }
        
        window.onclick = function(event) {
          const modal = document.getElementById('step-errors-modal');
          if (event.target === modal) {
            closeModal();
          }
        }
      `;
      
      const additionalCSS = `
        .chart-container { margin: 10px 0; }
        .chart-bar { display: flex; align-items: center; margin: 5px 0; }
        .chart-label { min-width: 100px; font-size: 11px; margin-right: 8px; }
        .chart-value-bar { flex: 1; position: relative; background: #e9ecef; height: 16px; border-radius: 2px; }
        .chart-fill { background: #007bff; height: 100%; border-radius: 2px; }
        .chart-value { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); font-size: 10px; font-weight: bold; color: white; }
      `;
      
      const html = createBaseLayout(`Domaine ${domain} - Debug Tools`, content, additionalCSS, additionalJS);
      res.send(html);
    } else {
      res.json({
        success: true,
        domain,
        errors: domainErrors,
        totalErrors: domainErrors.length,
        summary: summary.aggregations
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