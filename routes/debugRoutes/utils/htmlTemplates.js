const createBaseLayout = (title, content, additionalCSS = '', additionalJS = '') => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8f9fa;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 20px;
        }
        
        h1, h2, h3, h4, h5, h6 {
            margin-bottom: 15px;
            color: #2c3e50;
        }
        
        h1 { font-size: 2rem; }
        h2 { font-size: 1.5rem; }
        h3 { font-size: 1.25rem; }
        
        .breadcrumb {
            background: #e9ecef;
            padding: 10px 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        
        .breadcrumb a {
            color: #007bff;
            text-decoration: none;
        }
        
        .breadcrumb a:hover {
            text-decoration: underline;
        }
        
        .breadcrumb span {
            margin: 0 5px;
            color: #6c757d;
        }
        
        .actions {
            margin: 20px 0;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .button {
            display: inline-block;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        
        .button:hover {
            background: #0056b3;
        }
        
        .button.secondary {
            background: #6c757d;
        }
        
        .button.secondary:hover {
            background: #545b62;
        }
        
        .button.danger {
            background: #dc3545;
        }
        
        .button.danger:hover {
            background: #c82333;
        }
        
        .button.success {
            background: #28a745;
        }
        
        .button.success:hover {
            background: #218838;
        }
        
        .section {
            margin: 30px 0;
            padding: 20px;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            background: #fff;
        }
        
        .section h2 {
            margin-top: 0;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 10px;
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        
        .metrics-card {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 20px;
        }
        
        .metrics-card h3 {
            margin-bottom: 15px;
            color: #495057;
            border-bottom: 1px solid #dee2e6;
            padding-bottom: 8px;
        }
        
        .metrics-card table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .metrics-card th,
        .metrics-card td {
            padding: 8px 12px;
            text-align: left;
            border-bottom: 1px solid #dee2e6;
        }
        
        .metrics-card th {
            background: #e9ecef;
            font-weight: 600;
            color: #495057;
        }
        
        .responsive-table {
            overflow-x: auto;
            margin: 20px 0;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #dee2e6;
        }
        
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #495057;
            position: sticky;
            top: 0;
        }
        
        tr:hover {
            background: #f8f9fa;
        }
        
        .filter-panel {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
        }
        
        .filter-panel form {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: end;
        }
        
        .filter-group {
            display: flex;
            flex-direction: column;
            min-width: 120px;
        }
        
        .filter-group label {
            font-weight: 600;
            margin-bottom: 5px;
            color: #495057;
        }
        
        .filter-group input,
        .filter-group select {
            padding: 8px 12px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 14px;
        }
        
        .filter-group input:focus,
        .filter-group select:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
        }
        
        .tabs {
            display: flex;
            border-bottom: 2px solid #dee2e6;
            margin-bottom: 20px;
        }
        
        .tab {
            padding: 12px 20px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
            color: #6c757d;
        }
        
        .tab:hover {
            color: #007bff;
            background: #f8f9fa;
        }
        
        .tab.active {
            color: #007bff;
            border-bottom-color: #007bff;
            background: #f8f9fa;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .small {
            font-size: 12px;
            color: #6c757d;
        }
        
        .success {
            color: #28a745 !important;
        }
        
        .warning {
            color: #ffc107 !important;
        }
        
        .danger {
            color: #dc3545 !important;
        }
        
        .info {
            color: #17a2b8 !important;
        }
        
        .alert {
            padding: 15px;
            margin: 20px 0;
            border: 1px solid transparent;
            border-radius: 4px;
        }
        
        .alert-success {
            color: #155724;
            background-color: #d4edda;
            border-color: #c3e6cb;
        }
        
        .alert-warning {
            color: #856404;
            background-color: #fff3cd;
            border-color: #ffeaa7;
        }
        
        .alert-danger {
            color: #721c24;
            background-color: #f8d7da;
            border-color: #f5c6cb;
        }
        
        .alert-info {
            color: #0c5460;
            background-color: #d1ecf1;
            border-color: #bee5eb;
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #6c757d;
        }
        
        .empty-state h3 {
            margin-bottom: 10px;
            color: #495057;
        }
        
        .progress-bar {
            width: 100%;
            height: 20px;
            background-color: #e9ecef;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            height: 100%;
            background-color: #007bff;
            transition: width 0.3s ease;
        }
        
        .chart-container {
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        
        .bar-chart {
            display: flex;
            align-items: flex-end;
            height: 200px;
            margin: 20px 0;
            position: relative;
        }
        
        .bar {
            margin: 0 2px;
            min-width: 40px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            position: relative;
        }
        
        .bar-value {
            color: white;
            font-weight: bold;
            font-size: 11px;
            padding: 2px 4px;
        }
        
        .bar-label {
            position: absolute;
            bottom: -30px;
            font-size: 10px;
            text-align: center;
            width: 100%;
            transform: rotate(-45deg);
            transform-origin: center;
        }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #007bff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 15px;
                margin: 10px;
            }
            
            .actions {
                flex-direction: column;
            }
            
            .metrics-grid {
                grid-template-columns: 1fr;
            }
            
            .filter-panel form {
                flex-direction: column;
                align-items: stretch;
            }
            
            .tabs {
                flex-wrap: wrap;
            }
            
            .tab {
                min-width: 100px;
            }
        }
        
        ${additionalCSS}
    </style>
</head>
<body>
    <div class="container">
        ${content}
    </div>
    
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            
            tabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    const targetId = this.getAttribute('data-tab');
                    
                    tabs.forEach(t => t.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));
                    
                    this.classList.add('active');
                    const targetContent = document.getElementById(targetId);
                    if (targetContent) {
                        targetContent.classList.add('active');
                    }
                });
            });
            
            function updateTimestamps() {
                const timestamps = document.querySelectorAll('[data-timestamp]');
                timestamps.forEach(el => {
                    const timestamp = el.getAttribute('data-timestamp');
                    const date = new Date(timestamp);
                    const now = new Date();
                    const diffMs = now - date;
                    const diffMins = Math.floor(diffMs / 60000);
                    
                    if (diffMins < 1) {
                        el.textContent = 'Just now';
                    } else if (diffMins < 60) {
                        el.textContent = diffMins + 'm ago';
                    } else {
                        const diffHours = Math.floor(diffMins / 60);
                        if (diffHours < 24) {
                            el.textContent = diffHours + 'h ago';
                        } else {
                            el.textContent = date.toLocaleDateString();
                        }
                    }
                });
            }
            
            updateTimestamps();
            setInterval(updateTimestamps, 60000);
        });
        
        ${additionalJS}
    </script>
</body>
</html>
  `;
};

const createBreadcrumb = (items) => {
  if (!Array.isArray(items) || items.length === 0) return '';
  
  const breadcrumbItems = items.map((item, index) => {
    const isLast = index === items.length - 1;
    
    if (isLast || !item.url) {
      return `<span>${item.label}</span>`;
    }
    
    return `<a href="${item.url}">${item.label}</a>`;
  });
  
  return `
    <div class="breadcrumb">
      ${breadcrumbItems.join(' <span>></span> ')}
    </div>
  `;
};

const createStatusBadge = (status, text = null) => {
  const statusClasses = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'info',
    pending: 'secondary'
  };
  
  const badgeClass = statusClasses[status] || 'secondary';
  const badgeText = text || status;
  
  return `<span class="badge badge-${badgeClass}">${badgeText}</span>`;
};

const createProgressBar = (value, max = 100, showText = true) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  let colorClass = '';
  if (percentage >= 80) colorClass = 'progress-success';
  else if (percentage >= 60) colorClass = 'progress-warning';
  else if (percentage < 30) colorClass = 'progress-danger';
  
  return `
    <div class="progress-bar">
      <div class="progress-fill ${colorClass}" style="width: ${percentage}%">
        ${showText ? `<span class="progress-text">${percentage.toFixed(1)}%</span>` : ''}
      </div>
    </div>
  `;
};

const createAlert = (type, title, message, dismissible = false) => {
  const alertClass = `alert-${type}`;
  const dismissButton = dismissible ? '<button class="alert-dismiss" onclick="this.parentElement.remove()">×</button>' : '';
  
  return `
    <div class="alert ${alertClass}">
      ${dismissButton}
      ${title ? `<h4>${title}</h4>` : ''}
      <p>${message}</p>
    </div>
  `;
};

const createCard = (title, content, actions = []) => {
  const actionButtons = actions.length > 0 ? `
    <div class="card-actions">
      ${actions.map(action => `
        <a href="${action.url}" class="button ${action.class || ''}">${action.label}</a>
      `).join('')}
    </div>
  ` : '';
  
  return `
    <div class="card">
      <div class="card-header">
        <h3>${title}</h3>
      </div>
      <div class="card-body">
        ${content}
      </div>
      ${actionButtons}
    </div>
  `;
};

const createModal = (id, title, content, actions = []) => {
  const actionButtons = actions.length > 0 ? `
    <div class="modal-actions">
      ${actions.map(action => `
        <button class="button ${action.class || ''}" onclick="${action.onclick || ''}">${action.label}</button>
      `).join('')}
    </div>
  ` : '';
  
  return `
    <div id="${id}" class="modal" style="display: none;">
      <div class="modal-backdrop" onclick="closeModal('${id}')"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeModal('${id}')">&times;</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        ${actionButtons}
      </div>
    </div>
  `;
};

const createLoadingSpinner = (text = 'Loading...') => {
  return `
    <div class="loading-container">
      <div class="loading"></div>
      <span>${text}</span>
    </div>
  `;
};

const createEmptyState = (icon, title, message, actions = []) => {
  const actionButtons = actions.length > 0 ? `
    <div class="empty-state-actions">
      ${actions.map(action => `
        <a href="${action.url}" class="button ${action.class || ''}">${action.label}</a>
      `).join('')}
    </div>
  ` : '';
  
  return `
    <div class="empty-state">
      ${icon ? `<div class="empty-state-icon">${icon}</div>` : ''}
      <h3>${title}</h3>
      <p>${message}</p>
      ${actionButtons}
    </div>
  `;
};

const createDataTable = (headers, rows, options = {}) => {
  const { sortable = false, filterable = false, pagination = false } = options;
  
  const tableId = 'table-' + Math.random().toString(36).substr(2, 9);
  
  const headerRow = headers.map(header => {
    const sortIcon = sortable ? ' <span class="sort-icon">↕</span>' : '';
    return `<th data-column="${header.key || header}">${header.label || header}${sortIcon}</th>`;
  }).join('');
  
  const dataRows = rows.map(row => {
    const cells = headers.map(header => {
      const key = header.key || header;
      const value = row[key] || '';
      return `<td>${value}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  
  const filterInput = filterable ? `
    <div class="table-filter">
      <input type="text" placeholder="Filter..." onkeyup="filterTable('${tableId}', this.value)">
    </div>
  ` : '';
  
  return `
    ${filterInput}
    <div class="responsive-table">
      <table id="${tableId}">
        <thead>
          <tr>${headerRow}</tr>
        </thead>
        <tbody>
          ${dataRows}
        </tbody>
      </table>
    </div>
  `;
};

module.exports = {
  createBaseLayout,
  createBreadcrumb,
  createStatusBadge,
  createProgressBar,
  createAlert,
  createCard,
  createModal,
  createLoadingSpinner,
  createEmptyState,
  createDataTable
};