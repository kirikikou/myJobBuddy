(function() {
  const MODULE_LOAD_TIMEOUT = 10000;
  const RETRY_DELAY = 500;
  const MAX_RETRIES = 20;

  let moduleLoadPromise = null;
  let jobSearchController = null;

  async function loadModules() {
    if (moduleLoadPromise) return moduleLoadPromise;

    moduleLoadPromise = loadModulesImpl();
    return moduleLoadPromise;
  }

  async function loadModulesImpl() {
    const startTime = Date.now();
    
    if (window.clientConfig?.smartLog) {
      window.clientConfig.smartLog('buffer', 'Loading JobSearch modules...');
    }

    const modules = [
      'js/components/JobSearchState.js',
      'js/components/JobSearchValidation.js', 
      'js/components/JobSearchAPI.js',
      'js/components/JobSearchUI.js',
      'js/components/JobSearchController.js'
    ];

    try {
      for (const modulePath of modules) {
        await loadScript(modulePath);
      }

      await waitForModulesReady();

      const loadTime = Date.now() - startTime;
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('win', `All JobSearch modules loaded in ${loadTime}ms`);
      }

    } catch (error) {
      const loadTime = Date.now() - startTime;
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', `Module loading failed after ${loadTime}ms: ${error.message}`);
      }
      throw error;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${src}?v=${Date.now()}`;
      script.type = 'text/javascript';
      script.defer = true;

      const timeoutId = setTimeout(() => {
        reject(new Error(`Script load timeout: ${src}`));
      }, MODULE_LOAD_TIMEOUT);

      script.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to load script: ${src}`));
      };

      document.head.appendChild(script);
    });
  }

  async function waitForModulesReady() {
    const requiredModules = [
      'JobSearchState',
      'JobSearchValidation', 
      'JobSearchAPI',
      'JobSearchUI',
      'JobSearchController'
    ];

    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      const missingModules = requiredModules.filter(module => !window[module]);
      
      if (missingModules.length === 0) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('win', `All modules ready after ${attempts} attempts`);
        }
        return;
      }

      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', `Waiting for modules: ${missingModules.join(', ')} (attempt ${attempts + 1})`);
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }

    const stillMissing = requiredModules.filter(module => !window[module]);
    throw new Error(`Modules not ready after ${MAX_RETRIES} attempts: ${stillMissing.join(', ')}`);
  }

  async function initializeJobSearch() {
    if (window.jobSearchModule && window.jobSearchModule.controller) {
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', 'JobSearch already initialized - returning existing instance');
      }
      return window.jobSearchModule.controller;
    }
  
    if (window._jobSearchInitializing) {
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', 'JobSearch initialization already in progress - waiting');
      }
      return await window._jobSearchInitializationPromise;
    }
  
    window._jobSearchInitializing = true;
    window._jobSearchInitializationPromise = initializeJobSearchImpl();
  
    try {
      const controller = await window._jobSearchInitializationPromise;
      return controller;
    } finally {
      window._jobSearchInitializing = false;
      delete window._jobSearchInitializationPromise;
    }
  }
  
  async function initializeJobSearchImpl() {
    try {
      if (jobSearchController) {
        if (window.clientConfig?.smartLog) {
          window.clientConfig.smartLog('buffer', 'JobSearch already initialized');
        }
        return jobSearchController;
      }
  
      await loadModules();
  
      if (!window.JobSearchController) {
        throw new Error('JobSearchController not available after module loading');
      }
  
      jobSearchController = new window.JobSearchController();
      await jobSearchController.initialize();
  
      window.jobSearchModule = {
        controller: jobSearchController,
        getComponentData: () => jobSearchController.getComponentData(),
        setComponentData: (data) => jobSearchController.setComponentData(data),
        exportCareerUrls: () => jobSearchController.exportCareerUrls(),
        performJobSearch: () => jobSearchController.handleSearch({ preventDefault: () => {}, stopPropagation: () => {} }),
        performCacheOnlySearch: () => jobSearchController.handleCacheSearch({ preventDefault: () => {}, stopPropagation: () => {} }),
        populateJobTitles: () => jobSearchController.ui?.populateJobTitles(),
        populateCareerPages: () => jobSearchController.ui?.populateCareerPages(),
        updateFavoritesButton: () => updateFavoritesButton(),
        updateSelectionButtons: () => updateSelectionButtons(),
        getCurrentActiveList: () => window.userData?.currentActiveList || 'listA',
        toggleFavoritesVisibility: () => toggleFavoritesVisibility(),
        toggleSelectionVisibility: (selection) => toggleSelectionVisibility(selection),
        showElegantConfirm: (title, message, onConfirm, confirmText) => showElegantConfirm(title, message, onConfirm, confirmText),
        showLimitExceededModal: (limitType, needed, available, currentPlan) => showLimitExceededModal(limitType, needed, available, currentPlan),
        checkUserPlan: () => jobSearchController.checkUserPlan(),
        updateExportButtonVisibility: () => updateExportButtonVisibility(),
        cleanupJobSearchModule: () => cleanupJobSearchModule(),
        toggleCompanyFavorite: (companyName, isFavorite) => toggleCompanyFavorite(companyName, isFavorite),
        toggleCompanySelection: (companyName, selection) => toggleCompanySelection(companyName, selection),
        addApplicationDirectly: (jobTitle, companyName, location, website, career) => addApplicationDirectly(jobTitle, companyName, location, website, career),
        exportJobResultsToHTML: () => exportJobResultsToHTML(),
        openFavoritesManager: () => openFavoritesManager(),
        openSelectionManager: (selection) => openSelectionManager(selection)
      };
  
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('win', 'JobSearch module fully initialized and exposed');
      }
  
      return jobSearchController;
  
    } catch (error) {
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', `JobSearch initialization failed: ${error.message}`);
      }
      throw error;
    }
  }

  function updateFavoritesButton() {
    const manageFavorites = document.getElementById('manageFavorites');
    if (!manageFavorites) return;
    
    const companies = Object.values(window.userData?.companies || {});
    const favoriteCount = companies.filter(company => company.favorite).length;
    const isShowingFavorites = window.userData?.showFavoritesInCareerList;
    
    const icon = manageFavorites.querySelector('i');
    if (favoriteCount > 0 && isShowingFavorites) {
      icon.className = 'fas fa-star';
      manageFavorites.classList.add('has-favorites');
    } else if (favoriteCount > 0 && !isShowingFavorites) {
      icon.className = 'far fa-star';
      manageFavorites.classList.remove('has-favorites');
    } else {
      icon.className = 'far fa-star';
      manageFavorites.classList.remove('has-favorites');
    }
    
    manageFavorites.title = favoriteCount > 0 ? 
      `${isShowingFavorites ? 'Hide' : 'Show'} favorite companies (${favoriteCount})` :
      'Manage favorite companies (0)';
    
    manageFavorites.onclick = (e) => {
      e.preventDefault();
      toggleFavoritesVisibility();
    };
  }

  function updateSelectionButtons() {
    const companies = Object.values(window.userData?.companies || {});
    
    ['A', 'B', 'C'].forEach(selection => {
      const button = document.getElementById(`manageSelection${selection}`);
      if (!button) return;
      
      const selectionCount = companies.filter(company => company.selection === selection).length;
      const isShowingSelection = window.userData?.[`showSelection${selection}InCareerList`];
      
      const icon = button.querySelector('i');
      const label = button.querySelector('.selection-label');
      
      if (selectionCount > 0 && isShowingSelection) {
        icon.className = 'fas fa-tag';
        button.classList.add('has-selection');
        if (label) label.style.color = '#4f6df5';
      } else if (selectionCount > 0 && !isShowingSelection) {
        icon.className = 'far fa-tag';
        button.classList.remove('has-selection');
        if (label) label.style.color = 'rgba(255, 255, 255, 0.7)';
      } else {
        icon.className = 'far fa-tag';
        button.classList.remove('has-selection');
        if (label) label.style.color = 'rgba(255, 255, 255, 0.5)';
      }
      
      button.title = selectionCount > 0 ? 
        `${isShowingSelection ? 'Hide' : 'Show'} selection ${selection} companies (${selectionCount})` :
        `Manage selection ${selection} companies (0)`;
    });
  }

  function toggleFavoritesVisibility() {
    const companies = Object.values(window.userData?.companies || {});
    const favoriteCount = companies.filter(company => company.favorite).length;
    
    if (favoriteCount === 0) {
      openFavoritesManager();
      return;
    }
    
    window.userData.showFavoritesInCareerList = !window.userData.showFavoritesInCareerList;
    if (window.safeSaveUserPreferences) {
      window.safeSaveUserPreferences(window.userData);
    }
    
    if (jobSearchController?.ui) {
      jobSearchController.ui.populateCareerPages();
    }
    updateFavoritesButton();
    
    const action = window.userData.showFavoritesInCareerList ? 'shown' : 'hidden';
    if (window.showToast) {
      window.showToast('info', `Favorites ${action} in career URLs list`);
    }
  }

  function toggleSelectionVisibility(selection) {
    const companies = Object.values(window.userData?.companies || {});
    const selectionCount = companies.filter(company => company.selection === selection).length;
    
    if (selectionCount === 0) {
      openSelectionManager(selection);
      return;
    }
    
    const showKey = `showSelection${selection}InCareerList`;
    window.userData[showKey] = !window.userData[showKey];
    if (window.safeSaveUserPreferences) {
      window.safeSaveUserPreferences(window.userData);
    }
    
    if (jobSearchController?.ui) {
      jobSearchController.ui.populateCareerPages();
    }
    updateSelectionButtons();
    
    const action = window.userData[showKey] ? 'shown' : 'hidden';
    if (window.showToast) {
      window.showToast('info', `Selection ${selection} ${action} in career URLs list`);
    }
  }

  function generateId(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '').substring(0, 50);
  }

  function toggleCompanyFavorite(companyName, isFavorite) {
    const companyId = generateId(companyName);
    if (window.userData?.companies?.[companyId]) {
      window.userData.companies[companyId].favorite = isFavorite;
      if (window.safeSaveUserPreferences) {
        window.safeSaveUserPreferences(window.userData);
      }
      
      if (jobSearchController?.ui) {
        jobSearchController.ui.populateCareerPages();
      }
      updateFavoritesButton();
      
      if (window.showToast) {
        window.showToast('success', `${companyName} ${isFavorite ? 'added to' : 'removed from'} favorites`);
      }
      
      openFavoritesManager();
      
      if (window.applicationsModule?.populateCompaniesTable) {
        window.applicationsModule.populateCompaniesTable();
      }
    }
  }

  function toggleCompanySelection(companyName, selection) {
    const companyId = generateId(companyName);
    if (window.userData?.companies?.[companyId]) {
      window.userData.companies[companyId].selection = selection;
      if (window.safeSaveUserPreferences) {
        window.safeSaveUserPreferences(window.userData);
      }
      
      if (jobSearchController?.ui) {
        jobSearchController.ui.populateCareerPages();
      }
      updateSelectionButtons();
      
      if (selection) {
        if (window.showToast) {
          window.showToast('success', `${companyName} added to selection ${selection}`);
        }
      } else {
        if (window.showToast) {
          window.showToast('success', `${companyName} removed from selection`);
        }
      }
      
      const currentModalSelection = selection || 'A';
      openSelectionManager(currentModalSelection);
      
      if (window.applicationsModule?.populateCompaniesTable) {
        window.applicationsModule.populateCompaniesTable();
      }
    }
  }

  function addApplicationDirectly(jobTitle, companyName, location, website, career) {
    if (!companyName) {
      if (window.showToast) {
        window.showToast('error', 'Company name is required');
      }
      return;
    }
    
    const companyId = generateId(companyName);
    
    if (!window.userData.companies) window.userData.companies = {};
    if (!window.userData.companies[companyId]) window.userData.companies[companyId] = {};
    
    window.userData.companies[companyId].name = companyName;
    window.userData.companies[companyId].location = location;
    window.userData.companies[companyId].website = website;
    window.userData.companies[companyId].career = career;
    window.userData.companies[companyId].type = 'VFX';
    window.userData.companies[companyId].appliedDate = new Date().toISOString().split('T')[0];
    
    if (window.safeSaveUserPreferences) {
      window.safeSaveUserPreferences(window.userData);
    }
    
    if (window.applicationsModule?.populateCompaniesTable) {
      window.applicationsModule.populateCompaniesTable();
    }
    
    if (window.dashboardModule?.updateDashboard) {
      window.dashboardModule.updateDashboard();
    }
    
    if (window.showToast) {
      window.showToast('success', 'Company added to applications');
    }
    
    setTimeout(() => {
      const applicationTab = document.querySelector('.nav-item[data-page="applications"]');
      if (applicationTab) applicationTab.click();
    }, 500);
  }

  function exportJobResultsToHTML() {
    const userPlan = jobSearchController?.state?.getStateValue('userPlan') || 'free';
    if (userPlan !== 'theSentinel') {
      if (window.showToast) {
        window.showToast('error', 'Export feature requires TheSentinel plan');
      }
      return;
    }

    const { filteredResults } = jobSearchController?.state?.getState() || { filteredResults: [] };
    if (filteredResults.length === 0) {
      if (window.showToast) {
        window.showToast('warning', 'No results to export');
      }
      return;
    }

    const jobsData = filteredResults.map(result => ({
      id: Date.now() + Math.random(),
      title: result.title || 'Unknown Position',
      company: extractCleanDomain(result.url),
      url: result.url || result.applyUrl || '#',
      description: null,
      location: null,
      postedDate: null,
      tags: null,
      favorite: false,
      applied: false,
      status: 'not-applied',
      comments: [],
      applicationDate: null
    }));

    const csvContent = jobsData.map(job => `${job.title},${job.company},${job.url}`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `myJobBuddy-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    if (window.showToast) {
      window.showToast('success', `Exported ${filteredResults.length} job results to CSV file`);
    }
  }

  function extractCleanDomain(url) {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname;
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      return domain;
    } catch (e) {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  }

  function updateExportButtonVisibility() {
    const exportButton = document.getElementById('exportJobResults');
    const userPlan = jobSearchController?.state?.getStateValue('userPlan') || 'free';
    
    if (exportButton) {
      exportButton.style.display = userPlan === 'theSentinel' ? 'block' : 'none';
    }
  }

  function showElegantConfirm(title, message, onConfirm, confirmText = 'Delete') {
    if (window.modalsModule?.showElegantConfirm) {
      window.modalsModule.showElegantConfirm(title, message, onConfirm, confirmText);
    } else {
      if (confirm(message)) {
        onConfirm();
      }
    }
  }

  function showLimitExceededModal(limitType, needed, available, currentPlan) {
    if (window.modalsModule?.showLimitExceededModal) {
      window.modalsModule.showLimitExceededModal(limitType, needed, available, currentPlan);
    } else {
      alert(`Limit exceeded: ${limitType}. Needed: ${needed}, Available: ${available}. Plan: ${currentPlan}`);
    }
  }

  function openFavoritesManager() {
    if (!window.modalsModule) {
      if (window.showToast) {
        window.showToast('error', 'Modal system not available');
      }
      return;
    }
    
    const companies = Object.values(window.userData?.companies || {});
    const favoriteCompanies = companies.filter(company => company.favorite);
    const nonFavoriteCompanies = companies.filter(company => !company.favorite);
    
    let modalContent = '<div class="favorites-manager"><div class="section">';
    modalContent += `<h4><i class="fas fa-star" style="color: var(--warning);"></i> Current Favorites (${favoriteCompanies.length})</h4>`;
    modalContent += '<div class="company-list">';
    
    if (favoriteCompanies.length === 0) {
      modalContent += '<div style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.5);"><i class="far fa-star" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i><p>No favorite companies yet</p></div>';
    } else {
      favoriteCompanies.forEach(company => {
        const careerUrl = company.career || company.website || company.linkedin || '';
        modalContent += `<div class="company-item favorite"><div class="company-info"><span class="company-name">${company.name}</span>${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}</div><button class="btn-small btn-danger" onclick="window.jobSearchModule.toggleCompanyFavorite('${company.name}', false)"><i class="fas fa-star-slash"></i> Remove</button></div>`;
      });
    }
    
    modalContent += '</div></div>';
    
    if (nonFavoriteCompanies.length > 0) {
      modalContent += '<div class="section">';
      modalContent += `<h4><i class="far fa-star" style="color: rgba(255, 255, 255, 0.5);"></i> Add to Favorites (${nonFavoriteCompanies.length})</h4>`;
      modalContent += '<div class="company-list">';
      
      nonFavoriteCompanies.forEach(company => {
        const careerUrl = company.career || company.website || company.linkedin || '';
        modalContent += `<div class="company-item"><div class="company-info"><span class="company-name">${company.name}</span>${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}</div><button class="btn-small btn-success" onclick="window.jobSearchModule.toggleCompanyFavorite('${company.name}', true)"><i class="fas fa-star"></i> Add</button></div>`;
      });
      
      modalContent += '</div></div>';
    }
    
    modalContent += '</div>';
    
    window.modalsModule.openCustomModal('Manage Favorite Companies', modalContent);
  }

  function openSelectionManager(selection) {
    if (!window.modalsModule) {
      if (window.showToast) {
        window.showToast('error', 'Modal system not available');
      }
      return;
    }
    
    const companies = Object.values(window.userData?.companies || {});
    const selectionCompanies = companies.filter(company => company.selection === selection);
    const otherCompanies = companies.filter(company => company.selection !== selection);
    
    let modalContent = '<div class="selection-manager"><div class="section">';
    modalContent += `<h4><i class="fas fa-tag" style="color: var(--primary);"></i> Current Selection ${selection} (${selectionCompanies.length})</h4>`;
    modalContent += '<div class="company-list">';
    
    if (selectionCompanies.length === 0) {
      modalContent += `<div style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.5);"><i class="fas fa-tag" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i><p>No companies in selection ${selection} yet</p></div>`;
    } else {
      selectionCompanies.forEach(company => {
        const careerUrl = company.career || company.website || company.linkedin || '';
        modalContent += `<div class="company-item selection"><div class="company-info"><span class="company-name">${company.name}</span><span class="selection-badge" style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">${selection}</span>${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}</div><button class="btn-small btn-danger" onclick="window.jobSearchModule.toggleCompanySelection('${company.name}', '')"><i class="fas fa-times"></i> Remove</button></div>`;
      });
    }
    
    modalContent += '</div></div>';
    
    if (otherCompanies.length > 0) {
      modalContent += '<div class="section">';
      modalContent += `<h4><i class="fas fa-plus" style="color: rgba(255, 255, 255, 0.5);"></i> Add to Selection ${selection} (${otherCompanies.length})</h4>`;
      modalContent += '<div class="company-list">';
      
      otherCompanies.forEach(company => {
        const careerUrl = company.career || company.website || company.linkedin || '';
        const currentSelection = company.selection || 'None';
        modalContent += `<div class="company-item"><div class="company-info"><span class="company-name">${company.name}</span>${company.selection ? `<span class="selection-badge" style="background: var(--secondary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; margin-left: 8px;">${company.selection}</span>` : ''}${careerUrl ? `<small style="opacity: 0.7; display: block;">${careerUrl}</small>` : ''}</div><button class="btn-small btn-success" onclick="window.jobSearchModule.toggleCompanySelection('${company.name}', '${selection}')"><i class="fas fa-tag"></i> Add to ${selection}</button></div>`;
      });
      
      modalContent += '</div></div>';
    }
    
    modalContent += '</div>';
    
    window.modalsModule.openCustomModal(`Manage Selection ${selection} Companies`, modalContent);
  }

  function cleanupJobSearchModule() {
    try {
      if (jobSearchController) {
        jobSearchController.destroy();
        jobSearchController = null;
      }

      delete window.jobSearchModule;
      moduleLoadPromise = null;

      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('buffer', 'JobSearch module cleaned up completely');
      }
    } catch (error) {
      if (window.clientConfig?.smartLog) {
        window.clientConfig.smartLog('fail', `Cleanup error: ${error.message}`);
      }
    }
  }

  window.toggleCompanyFavorite = (companyName, isFavorite) => toggleCompanyFavorite(companyName, isFavorite);
  window.toggleCompanySelection = (companyName, selection) => toggleCompanySelection(companyName, selection);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeJobSearch);
  } else {
    initializeJobSearch();
  }

  window.initJobSearch = initializeJobSearch;
  window.cleanupJobSearchModule = cleanupJobSearchModule;

})();