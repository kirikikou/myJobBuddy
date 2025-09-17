(function() {
    let allJobs = [];
    let filteredJobs = [];
    let favorites = new Set();
    let currentPage = 1;
    let itemsPerPage = 50;
    let currentLetter = 'ALL';
    let sortColumn = 'date';
    let sortDirection = 'desc';
    let lastRefreshTime = null;
    let refreshInterval = null;
    let userPlan = 'free';

    async function init() {
        window.clientConfig.smartLog('buffer', 'Initializing Job Listing component');
        
        await loadUserPreferences();
        await loadJobsFromCache();
        setupEventListeners();
        startAutoRefresh();
        
        if (window.uiManager) {
            window.uiManager.translatePage();
        }
    }

    async function loadUserPreferences() {
        try {
            const response = await fetch('/api/get-user-preferences');
            if (response.ok) {
                const data = await response.json();
                userPlan = data.preferences?.subscription?.plan || 'free';
                favorites = new Set(data.preferences?.favoriteJobs || []);
                window.clientConfig.smartLog('buffer', `User plan: ${userPlan}`);
                updatePlanNotice();
            }
        } catch (error) {
            window.clientConfig.smartLog('fail', 'Failed to load user preferences:', error);
        }
    }

    function updatePlanNotice() {
        const notice = document.getElementById('plan-notice');
        const noticeText = document.getElementById('plan-notice-text');
        
        switch(userPlan) {
            case 'free':
                notice.style.display = 'flex';
                noticeText.textContent = 'Free plan: Showing jobs older than 7 days. Upgrade to see recent opportunities!';
                break;
            case 'standard':
                notice.style.display = 'flex';
                noticeText.textContent = 'Standard plan: Showing jobs older than 24 hours. Upgrade to Pro for real-time access!';
                break;
            case 'pro':
            case 'theSentinel':
                notice.style.display = 'none';
                break;
        }
    }

    async function loadJobsFromCache() {
        try {
            showLoadingState();
            
            const response = await fetch('/api/job-listing/all', {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success) {
                allJobs = data.jobs || [];
                lastRefreshTime = new Date();
                updateLastRefreshDisplay();
                applyFilters();
                updateStatistics();
                window.clientConfig.smartLog('win', `Loaded ${allJobs.length} jobs from cache (${data.totalBeforeFilter} total before plan filter)`);
            } else {
                showToast('error', data.message || 'Failed to load jobs');
            }
        } catch (error) {
            window.clientConfig.smartLog('fail', 'Error loading jobs:', error);
            showToast('error', 'Failed to load job listings');
        } finally {
            hideLoadingState();
        }
    }

    function applyFilters() {
        const companyFilter = document.getElementById('filter-company').value.toLowerCase();
        const jobFilter = document.getElementById('filter-job').value.toLowerCase();
        const dateFilter = document.getElementById('filter-date').value;
        const favoritesOnly = document.getElementById('filter-favorites').checked;
        
        filteredJobs = allJobs.filter(job => {
            if (currentLetter !== 'ALL') {
                const firstChar = (job.title || '').charAt(0).toUpperCase();
                if (currentLetter === '0-9') {
                    if (!/^[0-9]/.test(firstChar)) return false;
                } else {
                    if (firstChar !== currentLetter) return false;
                }
            }
            
            if (companyFilter && !(job.company || '').toLowerCase().includes(companyFilter)) {
                return false;
            }
            
            if (jobFilter && !(job.title || '').toLowerCase().includes(jobFilter)) {
                return false;
            }
            
            if (favoritesOnly && !favorites.has(job.id)) {
                return false;
            }
            
            if (dateFilter !== 'all') {
                const jobDate = new Date(job.scrapedAt || job.date);
                const now = new Date();
                const daysDiff = (now - jobDate) / (1000 * 60 * 60 * 24);
                
                switch(dateFilter) {
                    case 'today':
                        if (daysDiff > 1) return false;
                        break;
                    case 'week':
                        if (daysDiff > 7) return false;
                        break;
                    case 'month':
                        if (daysDiff > 30) return false;
                        break;
                }
            }
            
            return true;
        });
        
        sortJobs();
        currentPage = 1;
        renderJobsTable();
        updatePagination();
    }

    function sortJobs() {
        filteredJobs.sort((a, b) => {
            let aVal, bVal;
            
            switch(sortColumn) {
                case 'title':
                    aVal = (a.title || '').toLowerCase();
                    bVal = (b.title || '').toLowerCase();
                    break;
                case 'company':
                    aVal = (a.company || '').toLowerCase();
                    bVal = (b.company || '').toLowerCase();
                    break;
                case 'date':
                    aVal = new Date(a.scrapedAt || a.date).getTime();
                    bVal = new Date(b.scrapedAt || b.date).getTime();
                    break;
                case 'favorite':
                    aVal = favorites.has(a.id) ? 1 : 0;
                    bVal = favorites.has(b.id) ? 1 : 0;
                    break;
                default:
                    return 0;
            }
            
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }

    function renderJobsTable() {
        const tbody = document.getElementById('jobs-tbody');
        const noJobsMessage = document.getElementById('no-jobs-message');
        
        if (filteredJobs.length === 0) {
            tbody.innerHTML = '';
            noJobsMessage.style.display = 'block';
            return;
        }
        
        noJobsMessage.style.display = 'none';
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageJobs = filteredJobs.slice(startIndex, endIndex);
        
        tbody.innerHTML = pageJobs.map(job => {
            const isFavorite = favorites.has(job.id);
            const jobDate = new Date(job.scrapedAt || job.date);
            const ageInDays = (Date.now() - jobDate.getTime()) / (1000 * 60 * 60 * 24);
            
            let ageBadge = '';
            if (ageInDays < 1) {
                ageBadge = '<span class="cache-age-badge cache-age-fresh">Fresh</span>';
            } else if (ageInDays < 7) {
                ageBadge = '<span class="cache-age-badge cache-age-recent">Recent</span>';
            } else if (ageInDays < 30) {
                ageBadge = '<span class="cache-age-badge cache-age-old">Old</span>';
            } else {
                ageBadge = '<span class="cache-age-badge cache-age-stale">Stale</span>';
            }
            
            return `
                <tr data-job-id="${job.id}">
                    <td>
                        <button class="favorite-btn ${isFavorite ? 'active' : ''}" 
                                data-job-id="${job.id}">
                            <i class="fas fa-star"></i>
                        </button>
                    </td>
                    <td>
                        <a href="${job.url}" target="_blank" class="job-title-link">
                            ${job.title || 'Untitled'}
                        </a>
                        ${ageBadge}
                    </td>
                    <td>
                        <a href="${job.companyUrl || '#'}" class="company-link">
                            ${job.company || 'Unknown'}
                        </a>
                    </td>
                    <td>${formatDate(jobDate)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn view-btn" data-job-id="${job.id}">
                                <i class="fas fa-eye"></i> View
                            </button>
                            <button class="action-btn apply-btn" data-job-id="${job.id}">
                                <i class="fas fa-plus"></i> Apply
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        attachTableEventListeners();
    }

    function formatDate(date) {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString(undefined, options);
    }

    function updateStatistics() {
        document.getElementById('total-jobs-count').textContent = allJobs.length;
        
        const companies = new Set(allJobs.map(job => job.company));
        document.getElementById('total-companies-count').textContent = companies.size;
        
        document.getElementById('total-favorites-count').textContent = favorites.size;
    }

    function updateLastRefreshDisplay() {
        if (lastRefreshTime) {
            const timeStr = lastRefreshTime.toLocaleTimeString(undefined, { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            document.getElementById('last-refresh-time').textContent = timeStr;
        }
    }

    function updatePagination() {
        const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
        
        document.getElementById('page-info').textContent = 
            `Page ${currentPage} of ${totalPages} (${filteredJobs.length} jobs)`;
        
        document.getElementById('prev-page').disabled = currentPage === 1;
        document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
    }

    function setupEventListeners() {
        document.querySelectorAll('.alpha-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.alpha-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentLetter = this.dataset.letter;
                applyFilters();
            });
        });
        
        document.getElementById('apply-filters').addEventListener('click', applyFilters);
        
        document.getElementById('clear-filters').addEventListener('click', () => {
            document.getElementById('filter-company').value = '';
            document.getElementById('filter-job').value = '';
            document.getElementById('filter-date').value = 'all';
            document.getElementById('filter-favorites').checked = false;
            applyFilters();
        });
        
        document.getElementById('refresh-jobs').addEventListener('click', async () => {
            await refreshJobListings();
        });
        
        document.getElementById('items-per-page').addEventListener('change', (e) => {
            itemsPerPage = parseInt(e.target.value);
            currentPage = 1;
            renderJobsTable();
            updatePagination();
        });
        
        document.getElementById('prev-page').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderJobsTable();
                updatePagination();
            }
        });
        
        document.getElementById('next-page').addEventListener('click', () => {
            const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderJobsTable();
                updatePagination();
            }
        });
        
        document.querySelectorAll('.jobs-table th[data-sort]').forEach(th => {
            th.addEventListener('click', function() {
                const column = this.dataset.sort;
                if (sortColumn === column) {
                    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    sortColumn = column;
                    sortDirection = 'desc';
                }
                applyFilters();
            });
        });
    }

    function attachTableEventListeners() {
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', async function() {
                const jobId = this.dataset.jobId;
                await toggleFavorite(jobId);
            });
        });
        
        document.querySelectorAll('.apply-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const jobId = this.dataset.jobId;
                const job = allJobs.find(j => j.id === jobId);
                if (job) {
                    addToApplications(job);
                }
            });
        });
        
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const jobId = this.dataset.jobId;
                const job = allJobs.find(j => j.id === jobId);
                if (job) {
                    window.open(job.url, '_blank');
                }
            });
        });
    }

    async function toggleFavorite(jobId) {
        try {
            if (favorites.has(jobId)) {
                favorites.delete(jobId);
            } else {
                favorites.add(jobId);
            }
            
            const favoritesArray = Array.from(favorites);
            const response = await fetch('/api/save-user-preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    favoriteJobs: favoritesArray
                })
            });
            
            if (response.ok) {
                renderJobsTable();
                updateStatistics();
                showToast('success', favorites.has(jobId) ? 'Added to favorites' : 'Removed from favorites');
            }
        } catch (error) {
            window.clientConfig.smartLog('fail', 'Error toggling favorite:', error);
            showToast('error', 'Failed to update favorite');
        }
    }

    function addToApplications(job) {
        showToast('info', 'Feature coming soon: Add to Applications');
    }

    function startAutoRefresh() {
        refreshInterval = setInterval(async () => {
            const now = new Date();
            const hours = now.getHours();
            
            if (hours % 4 === 0 && now.getMinutes() === 0) {
                await refreshJobListings();
            }
        }, 60000);
    }

    async function refreshJobListings() {
        const refreshNotice = document.getElementById('refresh-notice');
        refreshNotice.style.display = 'flex';
        
        try {
            await loadJobsFromCache();
            showToast('success', 'Job listings refreshed successfully');
        } catch (error) {
            showToast('error', 'Failed to refresh job listings');
        } finally {
            refreshNotice.style.display = 'none';
        }
    }

    function showLoadingState() {
        const tbody = document.getElementById('jobs-tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner">
                        <div></div><div></div><div></div><div></div>
                    </div>
                    <p style="margin-top: 20px;">Loading job listings...</p>
                </td>
            </tr>
        `;
    }

    function hideLoadingState() {
    }

    window.addEventListener('beforeunload', () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    init();
})();