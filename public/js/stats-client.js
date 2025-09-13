class StatsManager {
    constructor() {
      this.init();
    }
  
    init() {
      this.bindEvents();
      this.handleInitialTab();
      this.setupExportHandlers();
    }
  
    bindEvents() {
      this.setupDomainToggles();
      this.setupTabNavigation();
      this.setupFormHandlers();
    }
  
    setupDomainToggles() {
      document.querySelectorAll('.domain-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const domainId = e.target.getAttribute('data-domain');
          const detailsRow = document.getElementById(`domain-details-${domainId}`);
          
          if (detailsRow.style.display === 'none' || !detailsRow.style.display) {
            detailsRow.style.display = 'table-row';
            e.target.textContent = '▼ Details';
            e.target.classList.add('expanded');
          } else {
            detailsRow.style.display = 'none';
            e.target.textContent = '► Details';
            e.target.classList.remove('expanded');
          }
        });
      });
    }
  
    setupTabNavigation() {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          const targetTab = e.target.getAttribute('data-tab');
          this.switchTab(targetTab);
          
          const url = new URL(window.location);
          url.searchParams.set('tab', targetTab.replace('tab-', ''));
          window.history.pushState({}, '', url);
        });
      });
    }
  
    switchTab(targetTab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      const tabBtn = document.querySelector(`[data-tab="${targetTab}"]`);
      const tabContent = document.getElementById(targetTab);
      
      if (tabBtn && tabContent) {
        tabBtn.classList.add('active');
        tabContent.classList.add('active');
      }
    }
  
    handleInitialTab() {
      const urlParams = new URLSearchParams(window.location.search);
      const activeTab = urlParams.get('tab');
      if (activeTab) {
        this.switchTab(`tab-${activeTab}`);
      }
    }
  
    setupFormHandlers() {
      document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => {
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) {
            submitBtn.textContent = 'Loading...';
            submitBtn.disabled = true;
            
            setTimeout(() => {
              submitBtn.textContent = 'Filter';
              submitBtn.disabled = false;
            }, 2000);
          }
        });
      });
    }
  
    setupExportHandlers() {
      window.exportSynthesis = this.exportSynthesis.bind(this);
      window.exportSynthesisHTML = this.exportSynthesisHTML.bind(this);
    }
  
    exportSynthesis(type) {
      const limit = document.getElementById('export-limit')?.value || 20;
      const url = `/debug/stats/export/synthesis/${type}?limit=${limit}`;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-synthesis-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.showExportNotification(`${type} JSON`, limit);
    }
  
    exportSynthesisHTML(type) {
      const limit = document.getElementById('export-limit')?.value || 20;
      const url = `/debug/stats/export/synthesis/${type}/html?limit=${limit}`;
      
      window.open(url, '_blank');
      this.showExportNotification(`${type} HTML Report`, limit);
    }
  
    showExportNotification(type, limit) {
      const notification = document.createElement('div');
      notification.className = 'export-notification';
      notification.innerHTML = `
        <div class="notification-content">
          <i class="notification-icon">📊</i>
          <div class="notification-text">
            <strong>Export Started</strong><br>
            ${type} (${limit} items)
          </div>
          <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
      `;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.classList.add('show');
      }, 100);
      
      setTimeout(() => {
        if (document.body.contains(notification)) {
          notification.classList.remove('show');
          setTimeout(() => {
            if (document.body.contains(notification)) {
              document.body.removeChild(notification);
            }
          }, 300);
        }
      }, 4000);
    }
  
    refreshData() {
      window.location.reload();
    }
  
    filterDomains(criteria) {
      const domains = document.querySelectorAll('.domain-row');
      let visibleCount = 0;
  
      domains.forEach(domain => {
        let visible = true;
        
        if (criteria.minScore) {
          const score = parseInt(domain.getAttribute('data-score')) || 0;
          if (score < criteria.minScore) visible = false;
        }
        
        if (criteria.maxScore) {
          const score = parseInt(domain.getAttribute('data-score')) || 0;
          if (score > criteria.maxScore) visible = false;
        }
        
        if (criteria.language) {
          const language = domain.getAttribute('data-language') || '';
          if (!language.toLowerCase().includes(criteria.language.toLowerCase())) visible = false;
        }
        
        if (criteria.step) {
          const step = domain.getAttribute('data-step') || '';
          if (step !== criteria.step) visible = false;
        }
        
        domain.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
      });
  
      this.updateFilterResults(visibleCount, domains.length);
    }
  
    updateFilterResults(visible, total) {
      const resultsEl = document.getElementById('filter-results');
      if (resultsEl) {
        resultsEl.textContent = `Showing ${visible} of ${total} domains`;
      }
    }
  
    sortTable(tableId, columnIndex, direction = 'asc') {
      const table = document.getElementById(tableId);
      if (!table) return;
  
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      rows.sort((a, b) => {
        const aVal = a.children[columnIndex]?.textContent?.trim() || '';
        const bVal = b.children[columnIndex]?.textContent?.trim() || '';
        
        const aNum = parseFloat(aVal.replace(/[^\d.-]/g, ''));
        const bNum = parseFloat(bVal.replace(/[^\d.-]/g, ''));
        
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return direction === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
      
      tbody.innerHTML = '';
      rows.forEach(row => tbody.appendChild(row));
    }
  
    highlightRow(element) {
      element.style.backgroundColor = '#fff3cd';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 2000);
    }
  
    copyToClipboard(text) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          this.showToast('Copied to clipboard!', 'success');
        });
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        this.showToast('Copied to clipboard!', 'success');
      }
    }
  
    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.classList.add('show');
      }, 100);
      
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
          if (document.body.contains(toast)) {
            document.body.removeChild(toast);
          }
        }, 300);
      }, 3000);
    }
  
    expandAllDetails() {
      document.querySelectorAll('.domain-toggle').forEach(btn => {
        const domainId = btn.getAttribute('data-domain');
        const detailsRow = document.getElementById(`domain-details-${domainId}`);
        
        if (detailsRow && detailsRow.style.display === 'none') {
          btn.click();
        }
      });
    }
  
    collapseAllDetails() {
      document.querySelectorAll('.domain-toggle').forEach(btn => {
        const domainId = btn.getAttribute('data-domain');
        const detailsRow = document.getElementById(`domain-details-${domainId}`);
        
        if (detailsRow && detailsRow.style.display === 'table-row') {
          btn.click();
        }
      });
    }
  
    searchInTable(tableId, searchTerm) {
      const table = document.getElementById(tableId);
      if (!table) return;
  
      const rows = table.querySelectorAll('tbody tr');
      let visibleCount = 0;
  
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const visible = text.includes(searchTerm.toLowerCase());
        row.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
      });
  
      this.showToast(`Found ${visibleCount} matching rows`, 'info');
    }
  
    exportTableToCSV(tableId, filename) {
      const table = document.getElementById(tableId);
      if (!table) return;
  
      const rows = table.querySelectorAll('tr:not([style*="display: none"])');
      const csvContent = Array.from(rows).map(row => {
        return Array.from(row.querySelectorAll('th, td')).map(cell => {
          return `"${cell.textContent.replace(/"/g, '""')}"`;
        }).join(',');
      }).join('\n');
  
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  
      this.showToast('CSV exported successfully!', 'success');
    }
  
    addKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
          switch (e.key.toLowerCase()) {
            case 'r':
              e.preventDefault();
              this.refreshData();
              break;
            case 'e':
              e.preventDefault();
              const exportBtn = document.querySelector('.export-buttons button');
              if (exportBtn) exportBtn.click();
              break;
            case 'f':
              e.preventDefault();
              const searchInput = document.querySelector('input[type="search"]');
              if (searchInput) searchInput.focus();
              break;
          }
        }
      });
    }
  
    setupProgressIndicators() {
      const links = document.querySelectorAll('a[href*="/debug/scraping/test"]');
      links.forEach(link => {
        link.addEventListener('click', () => {
          const spinner = document.createElement('span');
          spinner.className = 'loading-spinner';
          spinner.innerHTML = '⏳';
          link.appendChild(spinner);
        });
      });
    }
  
    initializeTooltips() {
      document.querySelectorAll('[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
          const tooltip = document.createElement('div');
          tooltip.className = 'tooltip';
          tooltip.textContent = e.target.getAttribute('data-tooltip');
          document.body.appendChild(tooltip);
  
          const rect = e.target.getBoundingClientRect();
          tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
          tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
          
          setTimeout(() => tooltip.classList.add('show'), 100);
        });
  
        element.addEventListener('mouseleave', () => {
          document.querySelectorAll('.tooltip').forEach(tooltip => {
            tooltip.remove();
          });
        });
      });
    }
  }
  
  document.addEventListener('DOMContentLoaded', () => {
    const statsManager = new StatsManager();
    window.statsManager = statsManager;
    
    statsManager.addKeyboardShortcuts();
    statsManager.setupProgressIndicators();
    statsManager.initializeTooltips();
  });
  
  window.addEventListener('beforeunload', () => {
    const loadingElements = document.querySelectorAll('.loading-spinner');
    loadingElements.forEach(el => el.remove());
  });