(function() {
    console.log('Dashboard component loading...');

    function initDashboard() {
        setupEventListeners();
        updateDashboard();
        populateDashboardReminders();
        loadPersonalReminder();
        updateUserName();
        cleanupOrphanedWidgets();
        updateDashboardResources();
        cleanupOldDashboardData();
    }

    function initializeComponentI18n() {
        if (window.uiManager) {
            window.uiManager.translatePage();
            window.uiManager.onLanguageChange(() => {
                setTimeout(initializeComponentI18n, 100);
                    });
        }
    }

    function showLocalizedToast(type, messageKey, params = {}) {
        const message = window.getTranslatedMessage ? 
            window.getTranslatedMessage(messageKey, params) : 
            messageKey;
        showToast(type, message);
    }

    window.getComponentData = function() {
        return {
            personalReminder: document.getElementById('personal-reminder-text')?.value || ''
        };
    };

    window.setComponentData = function(data) {
        if (data.personalReminder) {
            const reminderInput = document.getElementById('personal-reminder-text');
            if (reminderInput) {
                reminderInput.value = data.personalReminder;
            }
        }
        updateDashboard();
    };

    function setupEventListeners() {
        const quickSearchBtn = document.getElementById('quick-search-btn');
        const saveReminderBtn = document.getElementById('save-personal-reminder');
        
        if (quickSearchBtn) {
            quickSearchBtn.addEventListener('click', function() {
                document.querySelector('.nav-item[data-page="job-search"]').click();
            });
        }

        if (saveReminderBtn) {
            saveReminderBtn.addEventListener('click', savePersonalReminder);
        }

        document.querySelectorAll('.show-all').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const href = link.getAttribute('href');
                if (href && href.startsWith('#')) {
                    document.querySelector(`.nav-item[data-page="${href.substring(1)}"]`)?.click();
                }
            });
        });
    }

    function updateUserName() {
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            let firstName = '';
            
            if (userData?.linktrees) {
                for (let treeId in userData.linktrees) {
                    if (userData.linktrees[treeId]?.firstName) {
                        firstName = userData.linktrees[treeId].firstName;
                        break;
                    }
                }
            }
            
            if (!firstName && userData?.cvs) {
                for (let cvKey in userData.cvs) {
                    if (userData.cvs[cvKey]?.personalInfo?.firstName) {
                        firstName = userData.cvs[cvKey].personalInfo.firstName;
                        break;
                    }
                }
            }
            
            if (!firstName) {
                firstName = localStorage.getItem('jobbuddy_user_name') || 'User';
            }
            
            firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
            userNameElement.textContent = `${firstName}'s Career Journey`;
        }
    }

    function updateDashboard() {
        const companies = Object.values(userData.companies || {});
        
        let applicationsCount = 0;
        
        companies.forEach(company => {
            if (company.appliedDate) {
                applicationsCount++;
            }
        });

        initializeJobSearchDataStructure();
        const totalOffersScraped = userData.jobSearchData.totalOffersScraped || 0;
        
        const applicationsElement = document.getElementById('total-applications');
        const scrapedOffersElement = document.getElementById('scraped-offers');
        
        if (applicationsElement) {
            if (window.animateValue) {
                window.animateValue(applicationsElement, 0, applicationsCount, 800);
            } else {
                applicationsElement.textContent = applicationsCount;
            }
        }
        
        if (scrapedOffersElement) {
            if (window.animateValue) {
                window.animateValue(scrapedOffersElement, 0, totalOffersScraped, 800);
            } else {
                scrapedOffersElement.textContent = totalOffersScraped;
            }
        }
        
        updateUnexpectedOpportunities();
    }

    function initializeJobSearchDataStructure() {
        if (!userData.jobSearchData) {
            userData.jobSearchData = {};
        }
        
        if (!userData.jobSearchData.allHistoricalResults) {
            userData.jobSearchData.allHistoricalResults = [];
        }
        
        if (!userData.jobSearchData.totalOffersScraped) {
            userData.jobSearchData.totalOffersScraped = 0;
        }

        if (userData.jobSearchData.lastSearchResults && userData.jobSearchData.lastSearchResults.length > 0) {
            const existingUrls = new Set(userData.jobSearchData.allHistoricalResults.map(job => job.url));
            
            userData.jobSearchData.lastSearchResults.forEach(job => {
                if (!existingUrls.has(job.url)) {
                    userData.jobSearchData.allHistoricalResults.push({
                        ...job,
                        addedToHistoryDate: new Date().toISOString()
                    });
                    userData.jobSearchData.totalOffersScraped++;
                }
            });
            
            if (window.safeSaveUserPreferences) {
                window.safeSaveUserPreferences(userData);
            }
        }
    }

    function cleanupOldDashboardData() {
        if (userData.dashboardData && userData.dashboardData.dailyOpportunities) {
            console.log('Cleaning up old dashboardData system');
            delete userData.dashboardData.dailyOpportunities;
            if (Object.keys(userData.dashboardData).length === 0) {
                delete userData.dashboardData;
            }
            if (window.safeSaveUserPreferences) {
                window.safeSaveUserPreferences(userData);
            }
        }
    }

    function updateUnexpectedOpportunities() {
        const container = document.getElementById('unexpected-opportunities');
        if (!container) return;

        const profileJobTitle = userData.profile?.title?.toLowerCase()?.trim();
        
        if (!profileJobTitle) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-lightbulb" style="font-size: 3rem; opacity: 0.2; margin-bottom: 16px;"></i>
                    <p>Complete your profile to discover opportunities</p>
                    <div style="margin-top: 16px;">
                        <button class="btn btn-primary btn-sm" onclick="document.querySelector('.nav-item[data-page=\\"profile\\"]').click()">
                            <i class="fas fa-user"></i> Set Job Title in Profile
                        </button>
                    </div>
                </div>
            `;
            return;
        }

        if (!userData.profileBasedOpportunities) {
            userData.profileBasedOpportunities = {
                lastSearchDate: null,
                opportunities: []
            };
        }

        const today = new Date().toDateString();
        const shouldRefresh = !userData.profileBasedOpportunities.lastSearchDate || 
                            userData.profileBasedOpportunities.lastSearchDate !== today ||
                            userData.profileBasedOpportunities.opportunities.length === 0;

        if (shouldRefresh) {
            searchOpportunitiesFromSystemCache(profileJobTitle, today);
        }

        displayProfileOpportunities();
    }

    async function searchOpportunitiesFromSystemCache(jobTitle, today) {
        try {
            const response = await fetch('/api/search-cache-opportunities', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    jobTitle: jobTitle,
                    userId: userData.userId 
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                const allCacheResults = result.opportunities || [];
                
                console.log(`Found ${allCacheResults.length} total offers in system cache`);
                
                const relevantJobs = findRelevantJobs(allCacheResults, jobTitle);
                
                console.log(`Found ${relevantJobs.length} relevant jobs for "${jobTitle}"`);
                console.log('Relevant jobs:', relevantJobs.map(job => job.title));
                
                const maxOpportunities = getMaxOpportunitiesForPlan();
                const selectedOpportunities = shuffleArrayWithUserSeed(relevantJobs, userData.userId).slice(0, maxOpportunities);

                userData.profileBasedOpportunities = {
                    lastSearchDate: today,
                    opportunities: selectedOpportunities,
                    profileJobTitle: jobTitle,
                    totalCacheSize: allCacheResults.length,
                    relevantJobsFound: relevantJobs.length
                };

                if (window.safeSaveUserPreferences) {
                    window.safeSaveUserPreferences(userData);
                }
            } else {
                console.log('API not available, using fallback local search');
                fallbackToLocalSearch(jobTitle, today);
            }
        } catch (error) {
            console.error('Error searching system cache:', error);
            fallbackToLocalSearch(jobTitle, today);
        }
    }

    function findRelevantJobs(allJobs, jobTitle) {
        const titleLower = jobTitle.toLowerCase().trim();
        const titleWords = titleLower.split(/\s+/).filter(word => word.length > 2);
        
        console.log(`Searching for jobs matching "${titleLower}" (words: ${titleWords.join(', ')})`);
        
        function fuzzyMatch(text1, text2, threshold = 90) {
            const str1 = text1.toLowerCase();
            const str2 = text2.toLowerCase();
            
            if (str1.includes(str2) || str2.includes(str1)) {
                return 100;
            }
            
            return calculateSimilarity(str1, str2);
        }
        
        function calculateSimilarity(str1, str2) {
            if (str1 === str2) return 100;
            if (str1.length === 0 || str2.length === 0) return 0;
            
            const longer = str1.length > str2.length ? str1 : str2;
            const shorter = str1.length > str2.length ? str2 : str1;
            
            if (longer.length === 0) return 100;
            
            const editDistance = levenshteinDistance(longer, shorter);
            return Math.round(((longer.length - editDistance) / longer.length) * 100);
        }
        
        function levenshteinDistance(str1, str2) {
            const matrix = [];
            
            for (let i = 0; i <= str2.length; i++) {
                matrix[i] = [i];
            }
            
            for (let j = 0; j <= str1.length; j++) {
                matrix[0][j] = j;
            }
            
            for (let i = 1; i <= str2.length; i++) {
                for (let j = 1; j <= str1.length; j++) {
                    if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1,
                            matrix[i][j - 1] + 1,
                            matrix[i - 1][j] + 1
                        );
                    }
                }
            }
            
            return matrix[str2.length][str1.length];
        }
        
        const matchedJobs = allJobs.filter(job => {
            const jobTitleLower = (job.title || '').toLowerCase();
            const jobDescLower = (job.description || '').toLowerCase();
            const jobSnippetLower = (job.snippet || '').toLowerCase();
            
            const searchTexts = [jobTitleLower, jobDescLower, jobSnippetLower];
            
            for (const searchText of searchTexts) {
                if (searchText.includes(titleLower)) {
                    console.log(`Direct match found: "${job.title}" contains "${titleLower}"`);
                    return true;
                }
                
                if (fuzzyMatch(searchText, titleLower, 90) >= 90) {
                    console.log(`Fuzzy match found: "${job.title}" matches "${titleLower}" with high similarity`);
                    return true;
                }
                
                const searchWords = searchText.split(/\s+/);
                for (const word of searchWords) {
                    if (word.length > 2) {
                        if (fuzzyMatch(word, titleLower, 90) >= 90) {
                            console.log(`Word match found: "${word}" in "${job.title}" matches "${titleLower}"`);
                            return true;
                        }
                        
                        for (const titleWord of titleWords) {
                            if (fuzzyMatch(word, titleWord, 90) >= 90) {
                                console.log(`Cross-word match found: "${word}" in "${job.title}" matches "${titleWord}"`);
                                return true;
                            }
                        }
                    }
                }
            }
            
            return false;
        });
        
        console.log(`Found ${matchedJobs.length} matching jobs from ${allJobs.length} total jobs`);
        return matchedJobs;
    }

    function shuffleArrayWithUserSeed(array, userId) {
        const shuffled = [...array];
        const seed = hashCode(userId + new Date().toDateString());
        
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom(seed + i) * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    function fallbackToLocalSearch(jobTitle, today) {
        initializeJobSearchDataStructure();
        const allHistoricalResults = userData.jobSearchData?.allHistoricalResults || [];
        const lastSearchResults = userData.jobSearchData?.lastSearchResults || [];
        
        const allResults = [...allHistoricalResults, ...lastSearchResults];
        const uniqueResults = [];
        const seenUrls = new Set();
        
        allResults.forEach(job => {
            if (!seenUrls.has(job.url)) {
                seenUrls.add(job.url);
                uniqueResults.push(job);
            }
        });

        console.log('Fallback to local search with', uniqueResults.length, 'cached jobs');
        const relevantJobs = findRelevantJobs(uniqueResults, jobTitle);
        const maxOpportunities = getMaxOpportunitiesForPlan();
        const selectedOpportunities = shuffleArrayWithUserSeed(relevantJobs, userData.userId).slice(0, maxOpportunities);

        userData.profileBasedOpportunities = {
            lastSearchDate: today,
            opportunities: selectedOpportunities,
            profileJobTitle: jobTitle,
            totalCacheSize: uniqueResults.length,
            relevantJobsFound: relevantJobs.length,
            usingFallback: true
        };

        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(userData);
        }
    }

    function getMaxOpportunitiesForPlan() {
        const userPlan = userData.subscription?.plan || 'free';
        
        switch (userPlan) {
            case 'free':
                return 3;
            case 'standard':
                return 5;
            case 'pro':
                return 10;
            default:
                return 3;
        }
    }

    function displayProfileOpportunities() {
        const container = document.getElementById('unexpected-opportunities');
        const opportunities = userData.profileBasedOpportunities?.opportunities || [];
        const totalCacheSize = userData.profileBasedOpportunities?.totalCacheSize || 0;
        const relevantJobsFound = userData.profileBasedOpportunities?.relevantJobsFound || 0;
        const usingFallback = userData.profileBasedOpportunities?.usingFallback || false;
        
        console.log('Displaying opportunities:', opportunities.length, opportunities);

        if (opportunities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-lightbulb" style="font-size: 3rem; opacity: 0.2; margin-bottom: 16px;"></i>
                    <p>No opportunities found for "${userData.profile?.title}"</p>
                    <p style="font-size: 0.875rem; opacity: 0.6;">
                        Cache: ${totalCacheSize} total offers, ${relevantJobsFound} relevant for your profile
                        ${usingFallback ? ' (Local search)' : ' (System cache)'}
                    </p>
                    <p style="font-size: 0.875rem; opacity: 0.6;">Try running job searches to expand the cache.</p>
                </div>
            `;
            return;
        }

        const maxOpportunities = getMaxOpportunitiesForPlan();
        const userPlan = userData.subscription?.plan || 'free';

        let planBadge = '';
        if (userPlan === 'free') {
            planBadge = '<span style="font-size: 0.75rem; background: rgba(255,165,2,0.2); color: #ffa502; padding: 2px 6px; border-radius: 3px; margin-left: 8px;">Free Plan: Max 3</span>';
        } else if (userPlan === 'standard') {
            planBadge = '<span style="font-size: 0.75rem; background: rgba(79,109,245,0.2); color: #4f6df5; padding: 2px 6px; border-radius: 3px; margin-left: 8px;">Standard Plan: Max 5</span>';
        } else if (userPlan === 'pro') {
            planBadge = '<span style="font-size: 0.75rem; background: rgba(46,213,115,0.2); color: #2ed573; padding: 2px 6px; border-radius: 3px; margin-left: 8px;">Pro Plan: Max 10</span>';
        }

        container.innerHTML = `
            <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 0.875rem; opacity: 0.8;">
                    Found ${opportunities.length}/${relevantJobsFound} matches from ${totalCacheSize} cached offers ${planBadge}
                </span>
            </div>
        ` + opportunities.map((job, index) => {
            const domain = extractDomainFromUrl(job.url || '');
            return `
                <div class="job-card" style="animation-delay: ${index * 0.05}s">
                    <div class="job-card-header">
                        <div>
                            <h4 class="job-title">${job.title}</h4>
                            <p class="job-company">${domain}</p>
                        </div>
                        <span class="job-badge">Profile Match</span>
                    </div>
                    <div class="job-meta">
                        <span><i class="fas fa-calendar"></i> ${job.date || 'Recent'}</span>
                        <span><i class="fas fa-external-link-alt"></i> View</span>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.job-card').forEach((card, index) => {
            const job = opportunities[index];
            if (job && job.url) {
                card.addEventListener('click', () => {
                    card.style.transform = 'scale(0.98)';
                    setTimeout(() => {
                        card.style.transform = '';
                        window.open(job.url, '_blank');
                    }, 100);
                });
            }
        });
    }

    function extractDomainFromUrl(url) {
        try {
            const urlObj = new URL(url);
            let result = urlObj.hostname.replace('www.', '') + urlObj.pathname;
            
            if (urlObj.search) {
                result += urlObj.search;
            }
            
            return result;
        } catch (e) {
            return url.replace(/^https?:\/\//, '').replace(/^www\./, '') || 'Unknown';
        }
    }

    function populateDashboardReminders() {
        const dashboardContainer = document.getElementById('dashboard-reminders');
        if (!dashboardContainer) return;
        
        const appliedCompanies = Object.entries(userData.companies || {})
            .filter(([_, company]) => company.appliedDate)
            .map(([id, company]) => ({ id, ...company }))
            .sort((a, b) => {
                const diffA = getTimeDifference(a.appliedDate);
                const diffB = getTimeDifference(b.appliedDate);
                return diffB - diffA;
            });
        
        dashboardContainer.innerHTML = '';
        
        if (appliedCompanies.length === 0) {
            dashboardContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell" style="font-size: 3rem; opacity: 0.2; margin-bottom: 16px;"></i>
                    <p>No reminders yet</p>
                    <p style="font-size: 0.875rem; opacity: 0.6;">Add applications to generate reminders</p>
                </div>
            `;
            return;
        }
        
        const oldestApplications = appliedCompanies
            .filter(company => getTimeDifference(company.appliedDate) >= 7)
            .slice(0, 5);
            
        if (oldestApplications.length === 0) {
            dashboardContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle" style="font-size: 3rem; opacity: 0.2; margin-bottom: 16px;"></i>
                    <p>No follow-ups needed</p>
                    <p style="font-size: 0.875rem; opacity: 0.6;">All applications are recent</p>
                </div>
            `;
        } else {
            oldestApplications.forEach(company => {
                const diffDays = getTimeDifference(company.appliedDate);
                const urgency = diffDays >= 30 ? 'high' : diffDays >= 15 ? 'medium' : 'low';
                
                const reminderItem = document.createElement('div');
                reminderItem.className = 'recent-item';
                reminderItem.innerHTML = `
                    <div style="width: 40px; height: 40px; background-color: rgba(${urgency === 'high' ? '255, 71, 87' : urgency === 'medium' ? '241, 196, 15' : '79, 109, 245'}, 0.1); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: var(--space-sm);">
                        <i class="fas fa-bell" style="color: ${urgency === 'high' ? 'var(--danger)' : urgency === 'medium' ? 'var(--warning)' : 'var(--primary)'};"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 500; margin-bottom: 2px;">Follow-up with ${company.name}</div>
                        <div style="font-size: 0.8rem; color: rgba(255, 255, 255, 0.6);">Applied ${diffDays} days ago</div>
                    </div>
                `;
                
                dashboardContainer.appendChild(reminderItem);
            });
        }
    }

    function cleanupOrphanedWidgets() {
        if (!userData.dashboardWidgets) return;

        const validWidgets = {};
        
        Object.entries(userData.dashboardWidgets).forEach(([widgetId, widget]) => {
            if (widget.type === 'coverLetter') {
                if (userData.coverLetters && userData.coverLetters[widget.sourceId]) {
                    validWidgets[widgetId] = widget;
                }
            } else if (widget.type === 'link') {
                if (userData.links && userData.links[widget.sourceId]) {
                    validWidgets[widgetId] = widget;
                }
            }
        });

        userData.dashboardWidgets = validWidgets;
        
        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(userData);
        }
    }

    function updateDashboardResources() {
        const resourcesCard = document.getElementById('dashboard-resources-card');
        const resourcesContainer = document.getElementById('dashboard-resources');
        
        if (!resourcesContainer || !resourcesCard) return;
        
        const allWidgets = Object.values(userData.dashboardWidgets || {});
        
        if (allWidgets.length === 0) {
            resourcesCard.style.display = 'none';
            return;
        }
        
        const dashboardWidgets = allWidgets
            .sort((a, b) => a.type.localeCompare(b.type))
            .slice(0, 6);
        
        resourcesCard.style.display = 'block';
        
        resourcesContainer.innerHTML = dashboardWidgets.map(widget => {
            const isLink = widget.type === 'link';
            const content = isLink ? widget.url : widget.content;
            const title = widget.title || (isLink ? 'Link' : 'Document');
            const icon = widget.icon || (isLink ? 'fas fa-link' : 'fas fa-file-alt');
            
            return `
                <div class="dashboard-resource-item" data-content="${encodeURIComponent(content)}" data-type="${widget.type}">
                    <div class="dashboard-resource-icon">
                        <i class="${icon}"></i>
                    </div>
                    <div class="dashboard-resource-title" title="${title}">${title}</div>
                </div>
            `;
        }).join('');
        
        resourcesContainer.querySelectorAll('.dashboard-resource-item').forEach(item => {
            item.addEventListener('click', () => {
                const content = decodeURIComponent(item.getAttribute('data-content'));
                const type = item.getAttribute('data-type');
                
                item.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    item.style.transform = '';
                }, 150);
                
                navigator.clipboard.writeText(content).then(() => {
                    if (window.showToast) {
                        window.showToast('success', `${type === 'link' ? 'Link' : 'Content'} copied to clipboard`);
                    }
                }).catch(() => {
                    const textArea = document.createElement('textarea');
                    textArea.value = content;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    if (window.showToast) {
                        window.showToast('success', `${type === 'link' ? 'Link' : 'Content'} copied to clipboard`);
                    }
                });
            });
        });
    }

    function getTimeDifference(dateString) {
        const appliedDate = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - appliedDate);
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    function savePersonalReminder() {
        const reminderInput = document.getElementById('personal-reminder-text');
        if (!reminderInput) return;
        
        let reminderText = reminderInput.value || '';
        
        if (reminderText.length > 800) {
            reminderText = reminderText.substring(0, 800);
            reminderInput.value = reminderText;
            if (window.showToast) {
                window.showToast('warning', 'Text truncated to 800 characters maximum');
            }
        }
        
        if (!userData.personalReminder) {
            userData.personalReminder = {};
        }
        
        const currentTime = new Date().toISOString();
        
        userData.personalReminder.text = reminderText;
        userData.personalReminder.lastUpdated = currentTime;
        userData.personalReminder.saveCount = (userData.personalReminder.saveCount || 0) + 1;
        
        if (window.preferencesService && window.preferencesService.reset) {
            window.preferencesService.reset();
            console.log('Hash reset to force immediate save');
        }
        
        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(userData)
                .then(result => {
                    if (result && result.success) {
                        if (window.showToast) {
                            window.showToast('success', 'Personal reminder saved');
                        }
                        
                        try {
                            localStorage.setItem('personalReminder_' + (userData.userId || 'default'), JSON.stringify({
                                text: reminderText,
                                lastUpdated: currentTime
                            }));
                        } catch (e) {
                            console.error('Failed to save to localStorage:', e);
                        }
                    } else {
                        throw new Error(result?.message || 'Save failed');
                    }
                })
                .catch(error => {
                    console.error('Save failed:', error);
                    if (window.showToast) {
                        window.showToast('error', 'Failed to save personal reminder');
                    }
                });
        } else {
            if (window.showToast) {
                window.showToast('error', 'Save function not available');
            }
        }
    }
    
    function loadPersonalReminder() {
        const reminderInput = document.getElementById('personal-reminder-text');
        if (!reminderInput) return;
        
        let reminderText = '';
        
        try {
            const savedReminder = localStorage.getItem('personalReminder_' + (userData.userId || 'default'));
            if (savedReminder) {
                const parsed = JSON.parse(savedReminder);
                reminderText = parsed.text || '';
                
                if (!userData.personalReminder) {
                    userData.personalReminder = {};
                }
                userData.personalReminder.text = reminderText;
                userData.personalReminder.lastUpdated = parsed.lastUpdated || new Date().toISOString();
            } else if (userData.personalReminder?.text) {
                reminderText = userData.personalReminder.text;
            }
        } catch (e) {
            console.error('Failed to load reminder:', e);
            if (userData.personalReminder?.text) {
                reminderText = userData.personalReminder.text;
            }
        }
        
        if (reminderText) {
            reminderInput.value = reminderText;
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
        initDashboard();
    }
    
    window.dashboardModule = {
        updateDashboard,
        populateDashboardReminders,
        updateDashboardResources,
        refresh: initDashboard,
        incrementOffersCount: function(count = 1) {
            initializeJobSearchDataStructure();
            userData.jobSearchData.totalOffersScraped += count;
            if (window.safeSaveUserPreferences) {
                window.safeSaveUserPreferences(userData);
            }
            updateDashboard();
        },
        clearOpportunitiesCache: function() {
            if (userData.profileBasedOpportunities) {
                userData.profileBasedOpportunities.lastSearchDate = null;
                userData.profileBasedOpportunities.opportunities = [];
                if (window.safeSaveUserPreferences) {
                    window.safeSaveUserPreferences(userData);
                }
                updateUnexpectedOpportunities();
            }
        }
    };

    console.log('Dashboard component loaded successfully');
})();