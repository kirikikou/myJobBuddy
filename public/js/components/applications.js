(function() {
    let currentSort = { field: null, direction: 'asc' };
    let currentFilter = 'all';
    let currentSelection = 'all';
    let currentPage = 1;
    let itemsPerPage = 50;
    let filteredCompanies = [];
    let isNewRowActive = false;
    let selectedCompanies = new Set();
    let isEditMode = false;

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

    function initApplications() {
        setupEventListeners();
        populateCompaniesTable();
        setupNewRowInput();
        setupPagination();
        setupBulkActions();
        setupEditMode();
    }

    window.getComponentData = function() {
        return {
            currentSort: currentSort,
            currentFilter: currentFilter,
            currentSelection: currentSelection,
            currentPage: currentPage,
            itemsPerPage: itemsPerPage,
            selectedCompanies: Array.from(selectedCompanies),
            isEditMode: isEditMode
        };
    };

    window.setComponentData = function(data) {
        if (data.currentSort) currentSort = data.currentSort;
        if (data.currentFilter) currentFilter = data.currentFilter;
        if (data.currentSelection) currentSelection = data.currentSelection;
        if (data.currentPage) currentPage = data.currentPage;
        if (data.itemsPerPage) itemsPerPage = data.itemsPerPage;
        if (data.selectedCompanies) selectedCompanies = new Set(data.selectedCompanies);
        if (data.isEditMode !== undefined) isEditMode = data.isEditMode;
        populateCompaniesTable();
        updateBulkActionButtons();
        updateEditModeDisplay();
    };

    function setupEditMode() {
        const toggleEditBtn = document.getElementById('toggle-edit-mode');
        if (toggleEditBtn) {
            toggleEditBtn.addEventListener('click', function() {
                isEditMode = !isEditMode;
                updateEditModeDisplay();
                if (!isEditMode) {
                    deselectAllCompanies();
                }
            });
        }
    }

    function updateEditModeDisplay() {
        const selectionControls = document.getElementById('selection-controls');
        const bulkActionButtons = document.getElementById('bulk-action-buttons');
        const selectHeader = document.getElementById('select-header');
        const selectCells = document.querySelectorAll('.select-cell, .select-cell-new');
        const toggleEditBtn = document.getElementById('toggle-edit-mode');

        if (isEditMode) {
            if (selectionControls) selectionControls.style.display = 'flex';
            if (bulkActionButtons) bulkActionButtons.style.display = 'flex';
            if (selectHeader) selectHeader.style.display = 'table-cell';
            selectCells.forEach(cell => cell.style.display = 'table-cell');
            if (toggleEditBtn) {
                toggleEditBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';
                toggleEditBtn.classList.add('active');
            }
        } else {
            if (selectionControls) selectionControls.style.display = 'none';
            if (bulkActionButtons) bulkActionButtons.style.display = 'none';
            if (selectHeader) selectHeader.style.display = 'none';
            selectCells.forEach(cell => cell.style.display = 'none');
            if (toggleEditBtn) {
                toggleEditBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
                toggleEditBtn.classList.remove('active');
            }
        }
    }

    function setupEventListeners() {
        const exportDataBtn = document.getElementById('export-data-btn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', function() {
                openExportModal();
            });
        }
        
        const importDataBtn = document.getElementById('import-data-btn');
        if (importDataBtn) {
            importDataBtn.addEventListener('click', function() {
                openImportModal();
            });
        }
        
        const companySearch = document.getElementById('company-search');
        if (companySearch) {
            companySearch.addEventListener('input', function() {
                filterCompanies(this.value.toLowerCase());
            });
        }
        
        const filterButtons = document.querySelectorAll('.filter-buttons .site-button');
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                document.querySelectorAll('.filter-buttons .site-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                currentFilter = this.getAttribute('data-filter');
                currentPage = 1;
                applyCompanyFilter(currentFilter);
            });
        });

        const selectionButtons = document.querySelectorAll('.selection-button');
        selectionButtons.forEach(button => {
            button.addEventListener('click', function() {
                document.querySelectorAll('.selection-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                currentSelection = this.getAttribute('data-selection');
                currentPage = 1;
                populateCompaniesTable();
            });
        });

        const sortButtons = document.querySelectorAll('.sort-button');
        sortButtons.forEach(button => {
            button.addEventListener('click', function() {
                const field = this.getAttribute('data-sort');
                const direction = this.getAttribute('data-direction');
                applySorting(field, direction);
            });
        });

        const itemsPerPageSelect = document.getElementById('items-per-page');
        if (itemsPerPageSelect) {
            itemsPerPageSelect.addEventListener('change', function() {
                itemsPerPage = parseInt(this.value);
                currentPage = 1;
                populateCompaniesTable();
            });
        }

        setupQuickEditModal();
        setupCommentsModal();
        setupDeleteConfirmationModal();
        setupBulkActionModals();
    }

    function getDateCategory(appliedDate) {
        if (!appliedDate) return null;
        
        const today = new Date();
        const applied = new Date(appliedDate);
        const diffTime = Math.abs(today - applied);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 30) return 'hot';
        if (diffDays >= 15) return 'medium';
        return 'cold';
    }

    function setupBulkActions() {
        const selectAllBtn = document.getElementById('select-all-btn');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', function() {
                selectAllCompanies();  
            });
        }
    
        const deselectAllBtn = document.getElementById('deselect-all-btn');
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', function() {
                deselectAllCompanies();
            });
        }
    
        const selectAllHeader = document.getElementById('select-all-header');
        if (selectAllHeader) {
            selectAllHeader.addEventListener('change', function() {
                if (this.checked) {
                    selectAllCompanies();
                } else {
                    deselectAllCompanies();
                }
            });
        }
    
        const clearAllDatesBtn = document.getElementById('clear-all-dates-btn');
        if (clearAllDatesBtn) {
            clearAllDatesBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Clear All Dates clicked');
                openClearAllDatesModal();
            });
        }
    
        const clearSelectedDatesBtn = document.getElementById('clear-selected-dates-btn');
        if (clearSelectedDatesBtn) {
            clearSelectedDatesBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Clear Selected Dates clicked');
                if (selectedCompanies.size > 0) {
                    openClearSelectedDatesModal();
                }
            });
        }
    
        const clearAllFavoritesBtn = document.getElementById('clear-all-favorites-btn');
        if (clearAllFavoritesBtn) {
            clearAllFavoritesBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Clear All Favorites clicked');
                openClearAllFavoritesModal();
            });
        }
    
        const clearSelectedFavoritesBtn = document.getElementById('clear-selected-favorites-btn');
        if (clearSelectedFavoritesBtn) {
            clearSelectedFavoritesBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Clear Selected Favorites clicked');
                if (selectedCompanies.size > 0) {
                    openClearSelectedFavoritesModal();
                }
            });
        }
    
        const deleteSelectedBtn = document.getElementById('delete-selected-btn');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Delete Selected clicked');
                if (selectedCompanies.size > 0) {
                    openDeleteSelectedModal();
                }
            });
        }
    
        const clearAllBtn = document.getElementById('clear-all-companies-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Clear All Companies clicked');
                openClearAllCompaniesModal();
            });
        }
    }

    function selectAllCompanies() {
        const visibleRows = document.querySelectorAll('#companies-table tbody tr:not(.new-row):not([style*="display: none"])');
        visibleRows.forEach(row => {
            const companyId = row.getAttribute('data-id');
            if (companyId) {
                selectedCompanies.add(companyId);
                const checkbox = row.querySelector('.company-checkbox');
                if (checkbox) checkbox.checked = true;
            }
        });
        updateBulkActionButtons();
    }

    function deselectAllCompanies() {
        selectedCompanies.clear();
        const checkboxes = document.querySelectorAll('.company-checkbox');
        checkboxes.forEach(checkbox => checkbox.checked = false);
        const headerCheckbox = document.getElementById('select-all-header');
        if (headerCheckbox) headerCheckbox.checked = false;
        updateBulkActionButtons();
    }

    function updateBulkActionButtons() {
        const selectedCount = selectedCompanies.size;
        const selectedCountElement = document.getElementById('selected-count');
        const selectAllBtn = document.getElementById('select-all-btn');
        const deselectAllBtn = document.getElementById('deselect-all-btn');
        const deleteSelectedBtn = document.getElementById('delete-selected-btn');
        const clearSelectedDatesBtn = document.getElementById('clear-selected-dates-btn');
        const clearSelectedFavoritesBtn = document.getElementById('clear-selected-favorites-btn');

        if (selectedCountElement) {
            selectedCountElement.textContent = `${selectedCount} selected`;
        }

        if (selectedCount > 0) {
            if (selectAllBtn) selectAllBtn.style.display = 'none';
            if (deselectAllBtn) deselectAllBtn.style.display = 'inline-flex';
            if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'inline-flex';
            if (clearSelectedDatesBtn) clearSelectedDatesBtn.style.display = 'inline-flex';
            if (clearSelectedFavoritesBtn) clearSelectedFavoritesBtn.style.display = 'inline-flex';
        } else {
            if (selectAllBtn) selectAllBtn.style.display = 'inline-flex';
            if (deselectAllBtn) deselectAllBtn.style.display = 'none';
            if (deleteSelectedBtn) deleteSelectedBtn.style.display = 'none';
            if (clearSelectedDatesBtn) clearSelectedDatesBtn.style.display = 'none';
            if (clearSelectedFavoritesBtn) clearSelectedFavoritesBtn.style.display = 'none';
        }
    }

    function setupNewRowInput() {
        const newRow = document.getElementById('new-company-row');
        if (!newRow) return;

        const inputs = newRow.querySelectorAll('.inline-input');
        const companyNameInput = newRow.querySelector('.company-name');
        const dateInput = newRow.querySelector('.date-input');
        const favoriteIcon = newRow.querySelector('.favorite-star');
        const saveBtn = newRow.querySelector('.save-row-btn');
        const commentPlaceholder = newRow.querySelector('.comment-placeholder');

        if (dateInput) {
            dateInput.value = getTodayDate();
        }

        inputs.forEach(input => {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (this.classList.contains('company-name') && this.value.trim()) {
                        saveNewCompany();
                    } else {
                        const nextInput = getNextInput(this);
                        if (nextInput) {
                            nextInput.focus();
                        } else if (companyNameInput && companyNameInput.value.trim()) {
                            saveNewCompany();
                        }
                    }
                }
            });

            input.addEventListener('input', function() {
                const hasContent = Array.from(inputs).some(inp => inp.value.trim());
                if (hasContent) {
                    saveBtn.style.opacity = '1';
                    isNewRowActive = true;
                } else {
                    saveBtn.style.opacity = '0.3';
                    isNewRowActive = false;
                }
            });
        });

        if (favoriteIcon) {
            favoriteIcon.addEventListener('click', function() {
                this.classList.toggle('active');
            });
        }

        if (commentPlaceholder) {
            commentPlaceholder.addEventListener('click', function() {
                showToast('info', 'Please save the company first to add comments');
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                if (companyNameInput && companyNameInput.value.trim()) {
                    saveNewCompany();
                }
            });
        }
    }

    function getNextInput(currentInput) {
        const inputs = Array.from(document.querySelectorAll('#new-company-row .inline-input'));
        const currentIndex = inputs.indexOf(currentInput);
        return inputs[currentIndex + 1] || null;
    }

    function saveNewCompany(companyId, field, value) {
        if (!window.userData) {
            window.userData = {};
        }
        
        if (!window.userData.companies) {
            window.userData.companies = {};
        }
        
        if (!window.userData.companies[companyId]) {
            window.userData.companies[companyId] = {
                name: '',
                location: '',
                status: 'interested',
                appliedDate: '',
                website: '',
                linkedin: '',
                email: '',
                comments: ''
            };
        }
        
        window.userData.companies[companyId][field] = value;
        
        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(window.userData);
        }
    }

    function clearNewRow() {
        const newRow = document.getElementById('new-company-row');
        if (!newRow) return;

        const inputs = newRow.querySelectorAll('.inline-input');
        inputs.forEach(input => {
            if (input.classList.contains('date-input')) {
                input.value = getTodayDate();
            } else {
                input.value = '';
            }
        });

        const favoriteIcon = newRow.querySelector('.favorite-star');
        if (favoriteIcon) {
            favoriteIcon.classList.remove('active');
        }

        const saveBtn = newRow.querySelector('.save-row-btn');
        if (saveBtn) {
            saveBtn.style.opacity = '0.3';
        }

        isNewRowActive = false;
    }

    function populateCompaniesTable() {
        const tbody = document.querySelector('#companies-table tbody');
        if (!tbody) return;
    
        const companies = Object.entries(userData.companies || {});
        
        filteredCompanies = companies.filter(([id, company]) => {
            let passesFilter = false;
            const dateCategory = getDateCategory(company.appliedDate);
            
            switch (currentFilter) {
                case 'applied':
                    passesFilter = company.appliedDate;
                    break;
                case 'favorite':
                    passesFilter = company.favorite;
                    break;
                case 'not-applied':
                    passesFilter = !company.appliedDate;
                    break;
                case 'hot':
                    passesFilter = dateCategory === 'hot';
                    break;
                case 'medium':
                    passesFilter = dateCategory === 'medium';
                    break;
                case 'cold':
                    passesFilter = dateCategory === 'cold';
                    break;
                default:
                    passesFilter = true;
            }
            
            if (passesFilter && currentSelection !== 'all') {
                passesFilter = company.selection === currentSelection;
            }
            
            return passesFilter;
        });
    
        if (currentSort.field) {
            filteredCompanies.sort(([idA, companyA], [idB, companyB]) => {
                let valueA = companyA[currentSort.field] || '';
                let valueB = companyB[currentSort.field] || '';
                
                if (currentSort.field === 'name') {
                    valueA = valueA.toLowerCase();
                    valueB = valueB.toLowerCase();
                } else if (currentSort.field === 'appliedDate') {
                    valueA = valueA ? new Date(valueA) : new Date(0);
                    valueB = valueB ? new Date(valueB) : new Date(0);
                }
    
                if (currentSort.direction === 'asc') {
                    if (currentSort.field === 'appliedDate') {
                        return valueA - valueB;
                    }
                    return valueA.toString().localeCompare(valueB.toString());
                } else {
                    if (currentSort.field === 'appliedDate') {
                        return valueB - valueA;
                    }
                    return valueB.toString().localeCompare(valueA.toString());
                }
            });
        }
    
        const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages;
        }
    
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedCompanies = filteredCompanies.slice(startIndex, endIndex);
    
        const existingRows = tbody.querySelectorAll('tr:not(.new-row)');
        existingRows.forEach(row => row.remove());
    
        paginatedCompanies.forEach(([companyId, company]) => {
            const row = createCompanyRow(companyId, company);
            tbody.appendChild(row);
        });
    
        updatePaginationInfo();
        updateSortButtonStates();
        updateBulkActionButtons();
        updateEditModeDisplay();
        
        window.clientConfig&&window.clientConfig.smartLog('buffer',`Showing ${paginatedCompanies.length} companies out of ${filteredCompanies.length} total filtered companies`);
    }

    function getCommentsDisplay(comments) {
        if (!comments) return { display: 'Add comments...', hasComments: false };
        
        if (typeof comments === 'string') {
            return { 
                display: comments || 'Add comments...', 
                hasComments: !!comments.trim() 
            };
        }
        
        if (typeof comments === 'object' && comments.title) {
            return { 
                display: comments.title, 
                hasComments: true 
            };
        }
        
        return { display: 'Add comments...', hasComments: false };
    }

    function createCompanyRow(companyId, company) {
        const row = document.createElement('tr');
        row.setAttribute('data-id', companyId);
        
        if (company.appliedDate) {
            row.classList.add('applied');
        }
        
        if (company.favorite) {
            row.classList.add('favorite');
        }

        const dateCategory = getDateCategory(company.appliedDate);
        if (dateCategory) {
            row.classList.add(`row-${dateCategory}`);
        }

        const commentsDisplay = getCommentsDisplay(company.comments);
        const isSelected = selectedCompanies.has(companyId);

        row.innerHTML = `
            <td class="select-cell" style="display: ${isEditMode ? 'table-cell' : 'none'};">
                <input type="checkbox" class="company-checkbox" data-company-id="${companyId}" ${isSelected ? 'checked' : ''} style="width: 18px; height: 18px;">
            </td>
            <td>
                <input type="text" class="inline-input company-name-edit" value="${company.name || ''}" data-company-id="${companyId}" data-field="name">
            </td>
            <td>
                <input type="text" class="inline-input" value="${company.location || ''}" data-company-id="${companyId}" data-field="location">
            </td>
            <td>
                <select class="inline-input selection-select" data-company-id="${companyId}" data-field="selection">
                    <option value="" ${!company.selection ? 'selected' : ''}>-</option>
                    <option value="A" ${company.selection === 'A' ? 'selected' : ''}>A</option>
                    <option value="B" ${company.selection === 'B' ? 'selected' : ''}>B</option>
                    <option value="C" ${company.selection === 'C' ? 'selected' : ''}>C</option>
                </select>
            </td>
            <td class="icon-cell">
                ${company.website ? 
                    `<a href="${company.website}" target="_blank" class="link-icon active" title="${company.website}"><i class="fas fa-globe"></i></a>` : 
                    `<span class="link-icon inactive" data-company-id="${companyId}" data-field="website" title="Click to add website"><i class="fas fa-globe"></i></span>`
                }
            </td>
            <td class="icon-cell">
                ${company.linkedin ? 
                    `<a href="${company.linkedin}" target="_blank" class="link-icon active" title="${company.linkedin}"><i class="fab fa-linkedin"></i></a>` : 
                    `<span class="link-icon inactive" data-company-id="${companyId}" data-field="linkedin" title="Click to add LinkedIn"><i class="fab fa-linkedin"></i></span>`
                }
            </td>
            <td class="icon-cell">
                ${company.email ? 
                    `<a href="mailto:${company.email}" class="link-icon active" title="${company.email}"><i class="fas fa-envelope"></i></a>` : 
                    `<span class="link-icon inactive" data-company-id="${companyId}" data-field="email" title="Click to add email"><i class="fas fa-envelope"></i></span>`
                }
            </td>
            <td>
                <input type="date" class="inline-input date-input" value="${formatDate(company.appliedDate)}" data-company-id="${companyId}" data-field="appliedDate">
            </td>
            <td>
                <div class="comment-cell">
                    <span class="comment-title ${commentsDisplay.hasComments ? 'has-comments' : ''}" 
                          data-company-id="${companyId}" 
                          title="Click to ${commentsDisplay.hasComments ? 'edit' : 'add'} comments"
                          style="cursor: pointer; color: ${commentsDisplay.hasComments ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)'};">
                        <i class="fas fa-comment-dots" style="margin-right: 6px;"></i>
                        ${commentsDisplay.display}
                    </span>
                </div>
            </td>
            <td class="favorite-cell">
                <i class="fas fa-star favorite-star ${company.favorite ? 'active' : ''}" data-company-id="${companyId}"></i>
            </td>
            <td class="actions-cell">
                <button class="btn-icon edit-links-btn" title="Edit Links" data-company-id="${companyId}">
                    <i class="fas fa-link"></i>
                </button>
                <button class="btn-icon delete-company-btn" title="Delete" data-company-id="${companyId}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        setupRowEventListeners(row, companyId);
        
        return row;
    }

    function setupRowEventListeners(row, companyId) {
        const checkbox = row.querySelector('.company-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    selectedCompanies.add(companyId);
                } else {
                    selectedCompanies.delete(companyId);
                }
                updateBulkActionButtons();
            });
        }

        const inputs = row.querySelectorAll('.inline-input');
        inputs.forEach(input => {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.blur();
                    updateCompanyData(companyId, this.getAttribute('data-field'), this.value);
                }
            });

            input.addEventListener('blur', function() {
                updateCompanyData(companyId, this.getAttribute('data-field'), this.value);
            });

            input.addEventListener('change', function() {
                updateCompanyData(companyId, this.getAttribute('data-field'), this.value);
            });
        });

        const favoriteIcon = row.querySelector('.favorite-star');
        if (favoriteIcon) {
            favoriteIcon.addEventListener('click', function() {
                this.classList.toggle('active');
                const isFavorite = this.classList.contains('active');
                updateCompanyData(companyId, 'favorite', isFavorite);
                
                if (isFavorite) {
                    row.classList.add('favorite');
                    this.setAttribute('title', 'Remove from favorites');
                } else {
                    row.classList.remove('favorite');
                    this.setAttribute('title', 'Add to favorites');
                }
            });
        }

        const commentTitle = row.querySelector('.comment-title');
        if (commentTitle) {
            commentTitle.addEventListener('click', function() {
                openCommentsModal(companyId);
            });
        }

        const inactiveLinks = row.querySelectorAll('.link-icon.inactive');
        inactiveLinks.forEach(link => {
            link.addEventListener('click', function() {
                const field = this.getAttribute('data-field');
                openQuickEditLinksModal(companyId, field);
            });
        });

        const editLinksBtn = row.querySelector('.edit-links-btn');
        if (editLinksBtn) {
            editLinksBtn.addEventListener('click', function() {
                openQuickEditLinksModal(companyId);
            });
        }

        const deleteBtn = row.querySelector('.delete-company-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                deleteCompany(companyId);
            });
        }
    }

    function updateCompanyData(companyId, field, value) {
        if (!userData.companies[companyId]) {
            userData.companies[companyId] = {};
        }
        
        const isCompanySelected = selectedCompanies.has(companyId);
        const isBulkEditField = ['selection', 'appliedDate', 'favorite'].includes(field);
        const hasMultipleSelected = selectedCompanies.size > 1;
        
        if (isCompanySelected && isBulkEditField && hasMultipleSelected) {
            let updatedCount = 0;
            selectedCompanies.forEach(selectedCompanyId => {
                if (userData.companies[selectedCompanyId]) {
                    userData.companies[selectedCompanyId][field] = value;
                    updatedCount++;
                    
                    if (field === 'appliedDate') {
                        const row = document.querySelector(`tr[data-id="${selectedCompanyId}"]`);
                        if (row) {
                            if (value) {
                                row.classList.add('applied');
                            } else {
                                row.classList.remove('applied');
                            }
                            
                            row.classList.remove('row-hot', 'row-medium', 'row-cold');
                            const dateCategory = getDateCategory(value);
                            if (dateCategory) {
                                row.classList.add(`row-${dateCategory}`);
                            }
                        }
                    }
                }
            });
            
            populateCompaniesTable();
            
            let fieldName = field;
            if (field === 'appliedDate') fieldName = 'application date';
            if (field === 'favorite') fieldName = value ? 'favorite status (added)' : 'favorite status (removed)';
            
            showToast('success', `${updatedCount} companies updated: ${fieldName}`);
        } else {
            if (field === 'appliedDate') {
                const row = document.querySelector(`tr[data-id="${companyId}"]`);
                if (row) {
                    if (value) {
                        row.classList.add('applied');
                    } else {
                        row.classList.remove('applied');
                    }
                    
                    row.classList.remove('row-hot', 'row-medium', 'row-cold');
                    const dateCategory = getDateCategory(value);
                    if (dateCategory) {
                        row.classList.add(`row-${dateCategory}`);
                    }
                }
            }
            
            userData.companies[companyId][field] = value;
        }
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        
        if (window.dashboardModule && window.dashboardModule.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        if (field === 'appliedDate' && window.remindersModule && window.remindersModule.populateReminders) {
            window.remindersModule.populateReminders();
        }
        
        if (field === 'favorite' && window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
            window.companiesModule.populateFavoriteCompanies();
        }
    }

    function clearAllAppliedDates() {
        let clearedCount = 0;
        Object.keys(userData.companies).forEach(companyId => {
            if (userData.companies[companyId].appliedDate) {
                userData.companies[companyId].appliedDate = '';
                clearedCount++;
            }
        });
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        populateCompaniesTable();
        
        if (window.dashboardModule && window.dashboardModule.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        if (window.remindersModule && window.remindersModule.populateReminders) {
            window.remindersModule.populateReminders();
        }
        
        showToast('success', `${clearedCount} application dates cleared`);
    }

    function clearSelectedDates() {
        let clearedCount = 0;
        selectedCompanies.forEach(companyId => {
            if (userData.companies[companyId] && userData.companies[companyId].appliedDate) {
                userData.companies[companyId].appliedDate = '';
                clearedCount++;
            }
        });
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        populateCompaniesTable();
        
        if (window.dashboardModule && window.dashboardModule.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        if (window.remindersModule && window.remindersModule.populateReminders) {
            window.remindersModule.populateReminders();
        }
        
        showToast('success', `${clearedCount} selected application dates cleared`);
    }

    function clearAllFavorites() {
        let clearedCount = 0;
        Object.keys(userData.companies).forEach(companyId => {
            if (userData.companies[companyId].favorite) {
                userData.companies[companyId].favorite = false;
                clearedCount++;
            }
        });
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        populateCompaniesTable();
        
        if (window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
            window.companiesModule.populateFavoriteCompanies();
        }
        
        if (window.dashboardModule && window.dashboardModule.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        showToast('success', `${clearedCount} favorites cleared`);
    }

    function clearSelectedFavorites() {
        let clearedCount = 0;
        selectedCompanies.forEach(companyId => {
            if (userData.companies[companyId] && userData.companies[companyId].favorite) {
                userData.companies[companyId].favorite = false;
                clearedCount++;
            }
        });
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        populateCompaniesTable();
        
        if (window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
            window.companiesModule.populateFavoriteCompanies();
        }
        
        if (window.dashboardModule && window.dashboardModule.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        showToast('success', `${clearedCount} selected favorites cleared`);
    }

    function clearAllCompanies() {
        const companyCount = Object.keys(userData.companies).length;
        userData.companies = {};
        selectedCompanies.clear();
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        populateCompaniesTable();
        
        if (window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
            window.companiesModule.populateFavoriteCompanies();
        }
        
        if (window.remindersModule && window.remindersModule.populateReminders) {
            window.remindersModule.populateReminders();
        }
        
        if (window.dashboardModule && window.dashboardModule.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        showToast('success', `${companyCount} companies deleted`);
    }

    function deleteSelectedCompanies() {
        const companiesToDelete = Array.from(selectedCompanies);
        let deletedCount = 0;
        
        companiesToDelete.forEach(companyId => {
            if (userData.companies[companyId]) {
                delete userData.companies[companyId];
                deletedCount++;
            }
        });
        
        selectedCompanies.clear();
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        populateCompaniesTable();
        
        if (window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
            window.companiesModule.populateFavoriteCompanies();
        }
        
        if (window.remindersModule && window.remindersModule.populateReminders) {
            window.remindersModule.populateReminders();
        }
        
        if (window.dashboardModule && window.dashboardModule.updateDashboard) {
            window.dashboardModule.updateDashboard();
        }
        
        showToast('success', `${deletedCount} companies deleted`);
    }

    function openClearAllDatesModal() {
        const modal = document.getElementById('clear-all-dates-modal');
        if (modal) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Opening Clear All Dates Modal');
            modal.classList.add('show');
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','clear-all-dates-modal not found');
        }
    }

    function openClearSelectedDatesModal() {
        const modal = document.getElementById('clear-selected-dates-modal');
        if (modal) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Opening Clear Selected Dates Modal');
            modal.classList.add('show');
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','clear-selected-dates-modal not found');
        }
    }   

    function openClearAllFavoritesModal() {
        const modal = document.getElementById('clear-all-favorites-modal');
        if (modal) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Opening Clear All Favorites Modal');
            modal.classList.add('show');
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','clear-all-favorites-modal not found');
        }
    }

    function openClearSelectedFavoritesModal() {
        const modal = document.getElementById('clear-selected-favorites-modal');
        if (modal) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Opening Clear Selected Favorites Modal');
            modal.classList.add('show');
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','clear-selected-favorites-modal not found');
        }
    }

    function openClearAllCompaniesModal() {
        const modal = document.getElementById('clear-all-companies-modal');
        if (modal) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Opening Clear All Companies Modal');
            modal.classList.add('show');
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','clear-all-companies-modal not found');
        }
    }

    function openDeleteSelectedModal() {
        const modal = document.getElementById('delete-selected-modal');
        if (!modal) {
            window.clientConfig&&window.clientConfig.smartLog('fail','delete-selected-modal not found');
            return;
        }
    
        const selectedCompanyNames = Array.from(selectedCompanies)
            .map(id => userData.companies[id]?.name)
            .filter(name => name);
    
        const companiesList = document.getElementById('selected-companies-list');
        if (companiesList) {
            companiesList.innerHTML = selectedCompanyNames
                .map(name => `<li>${name}</li>`)
                .join('');
        }
    
        const countElement = document.getElementById('selected-companies-count');
        if (countElement) {
            countElement.textContent = selectedCompanies.size;
        }
    
        window.clientConfig&&window.clientConfig.smartLog('buffer','Opening Delete Selected Modal');
        modal.classList.add('show');
    }

    function setupBulkActionModals() {
        setupClearAllDatesModal();
        setupClearSelectedDatesModal();
        setupClearAllFavoritesModal();
        setupClearSelectedFavoritesModal();
        setupClearAllCompaniesModal();
        setupDeleteSelectedModal();
    }

    function setupClearAllDatesModal() {
        const modal = document.getElementById('clear-all-dates-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-clear-all-dates-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-clear-all-dates');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const confirmBtn = document.getElementById('confirm-clear-all-dates');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                clearAllAppliedDates();
                modal.classList.remove('show');
            });
        }
    }

    function setupClearSelectedDatesModal() {
        const modal = document.getElementById('clear-selected-dates-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-clear-selected-dates-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-clear-selected-dates');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const confirmBtn = document.getElementById('confirm-clear-selected-dates');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                clearSelectedDates();
                modal.classList.remove('show');
            });
        }
    }

    function setupClearAllFavoritesModal() {
        const modal = document.getElementById('clear-all-favorites-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-clear-all-favorites-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-clear-all-favorites');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const confirmBtn = document.getElementById('confirm-clear-all-favorites');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                clearAllFavorites();
                modal.classList.remove('show');
            });
        }
    }

    function setupClearSelectedFavoritesModal() {
        const modal = document.getElementById('clear-selected-favorites-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-clear-selected-favorites-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-clear-selected-favorites');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const confirmBtn = document.getElementById('confirm-clear-selected-favorites');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                clearSelectedFavorites();
                modal.classList.remove('show');
            });
        }
    }

    function setupClearAllCompaniesModal() {
        const modal = document.getElementById('clear-all-companies-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-clear-all-companies-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-clear-all-companies');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const confirmBtn = document.getElementById('confirm-clear-all-companies');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                clearAllCompanies();
                modal.classList.remove('show');
            });
        }
    }

    function setupDeleteSelectedModal() {
        const modal = document.getElementById('delete-selected-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-delete-selected-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-delete-selected');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const confirmBtn = document.getElementById('confirm-delete-selected');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                deleteSelectedCompanies();
                modal.classList.remove('show');
            });
        }
    }

    function openCommentsModal(companyId) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Opening comments modal for company:', companyId);
        const modal = document.getElementById('add-comments-modal');
        if (!modal) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Comments modal not found');
            return;
        }
        window.clientConfig&&window.clientConfig.smartLog('buffer','Modal found:', modal);

        if (!window.userData) {
            showToast('error', 'User data not available');
            return;
        }
        
        const company = userData.companies[companyId];
        if (!company) {
            showToast('error', 'Company not found');
            return;
        }
        window.clientConfig&&window.clientConfig.smartLog('buffer','Company found:', company);
        
        const companyIdInput = document.getElementById('comments-company-id');
        const titleInput = document.getElementById('comments-title');
        const contentInput = document.getElementById('comments-content');
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Form elements found:', { companyIdInput, titleInput, contentInput });
        
        if (companyIdInput) companyIdInput.value = companyId;
        
        let title = '';
        let content = '';
        
        if (company.comments) {
            if (typeof company.comments === 'string') {
                content = company.comments;
                title = '';
            } else if (typeof company.comments === 'object') {
                title = company.comments.title || '';
                content = company.comments.content || '';
            }
        }
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Setting form values:', { title, content });
        
        if (titleInput) {
            titleInput.value = title;
            titleInput.style.background = '';
            titleInput.style.borderColor = '';
        }
        if (contentInput) {
            contentInput.value = content;
            contentInput.style.background = '';
            contentInput.style.borderColor = '';
        }
        
        const modalTitle = modal.querySelector('.modal-title');
        const saveBtn = document.getElementById('save-comments');
        
        if (company.comments) {
            if (modalTitle) modalTitle.textContent = 'Edit Comments';
            if (saveBtn) saveBtn.textContent = 'Update Comments';
        } else {
            if (modalTitle) modalTitle.textContent = 'Add Comments';
            if (saveBtn) saveBtn.textContent = 'Save Comments';
        }
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Showing modal...');
        modal.classList.add('show');
        
        setTimeout(() => {
            if (titleInput) titleInput.focus();
        }, 100);
    }

    function deleteCompany(companyId) {
        const company = userData.companies[companyId];
        if (!company) return;

        openDeleteConfirmationModal(companyId, company.name);
    }

    function openDeleteConfirmationModal(companyId, companyName) {
        const modal = document.getElementById('delete-confirmation-modal');
        if (!modal) return;

        const companyNameElement = document.getElementById('company-name-to-delete');
        if (companyNameElement) {
            companyNameElement.textContent = `"${companyName}"?`;
        }

        modal.setAttribute('data-company-id', companyId);
        modal.classList.add('show');
    }

    function setupDeleteConfirmationModal() {
        const modal = document.getElementById('delete-confirmation-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-delete-confirmation-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-delete-confirmation');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const confirmBtn = document.getElementById('confirm-delete-company');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                const companyId = modal.getAttribute('data-company-id');

                if (!companyId) {
                    showToast('error', 'Company ID not found');
                    return;
                }

                delete userData.companies[companyId];
                selectedCompanies.delete(companyId);
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};

                populateCompaniesTable();

                if (window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
                    window.companiesModule.populateFavoriteCompanies();
                }

                if (window.remindersModule && window.remindersModule.populateReminders) {
                    window.remindersModule.populateReminders();
                }

                if (window.dashboardModule && window.dashboardModule.updateDashboard) {
                    window.dashboardModule.updateDashboard();
                }

                modal.classList.remove('show');
                showToast('success', 'Company deleted successfully');
            });
        }
    }

    function filterCompanies(searchTerm) {
        const rows = document.querySelectorAll('#companies-table tbody tr:not(.new-row)');
        let visibleCount = 0;
        
        rows.forEach(row => {
            const companyName = row.querySelector('.company-name-edit').value.toLowerCase();
            const location = row.querySelector('[data-field="location"]').value.toLowerCase();
            const commentTitle = row.querySelector('.comment-title');
            const comments = commentTitle ? commentTitle.textContent.toLowerCase() : '';
            
            if (companyName.includes(searchTerm) || location.includes(searchTerm) || comments.includes(searchTerm)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });
        
        updateShowingCount(visibleCount);
    }

    function applyCompanyFilter(filter) {
        populateCompaniesTable();
    }

    function applySorting(field, direction) {
        currentSort = { field, direction };
        populateCompaniesTable();
    }

    function updateSortButtonStates() {
        const sortButtons = document.querySelectorAll('.sort-button');
        sortButtons.forEach(button => {
            button.classList.remove('active');
            if (button.getAttribute('data-sort') === currentSort.field && 
                button.getAttribute('data-direction') === currentSort.direction) {
                button.classList.add('active');
            }
        });
    }

    function setupPagination() {
        const firstBtn = document.getElementById('first-page');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        const lastBtn = document.getElementById('last-page');

        if (firstBtn) {
            firstBtn.addEventListener('click', function() {
                currentPage = 1;
                populateCompaniesTable();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (currentPage > 1) {
                    currentPage--;
                    populateCompaniesTable();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    populateCompaniesTable();
                }
            });
        }

        if (lastBtn) {
            lastBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
                currentPage = totalPages;
                populateCompaniesTable();
            });
        }
    }

    function updateItemsPerPage() {
        const select = document.querySelector('.items-per-page-select');
        if (select) {
            itemsPerPage = parseInt(select.value) || 50;
            currentPage = 1;
            populateCompaniesTable();
        }
    }
    
    function updatePaginationInfo() {
        const totalItems = filteredCompanies.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const startItem = Math.min((currentPage - 1) * itemsPerPage + 1, totalItems);
        const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    
        const paginationInfo = document.querySelector('.pagination-info');
        if (paginationInfo) {
            if (totalItems === 0) {
                paginationInfo.textContent = 'Showing 0-0 of 0 companies';
            } else {
                paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalItems} companies`;
            }
        }
    
        const pageInfo = document.querySelector('.page-info');
        if (pageInfo) {
            if (totalPages === 0) {
                pageInfo.textContent = 'Page 0 of 0';
            } else {
                pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
            }
        }
    
        const prevBtn = document.querySelector('.pagination-prev');
        const nextBtn = document.querySelector('.pagination-next');
    
        if (prevBtn) {
            prevBtn.disabled = currentPage <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = currentPage >= totalPages;
        }
    
        updateItemsPerPageSelector();
    }
    
    function updateItemsPerPageSelector() {
        const select = document.querySelector('.items-per-page-select');
        if (select && select.value !== itemsPerPage.toString()) {
            select.value = itemsPerPage.toString();
        }
    }
    
    function setupPaginationControls() {
        const prevBtn = document.querySelector('.pagination-prev');
        const nextBtn = document.querySelector('.pagination-next');
        const firstBtn = document.querySelector('.pagination-first');
        const lastBtn = document.querySelector('.pagination-last');
    
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (currentPage > 1) {
                    currentPage--;
                    populateCompaniesTable();
                }
            });
        }
    
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    populateCompaniesTable();
                }
            });
        }
    
        if (firstBtn) {
            firstBtn.addEventListener('click', function() {
                currentPage = 1;
                populateCompaniesTable();
            });
        }
    
        if (lastBtn) {
            lastBtn.addEventListener('click', function() {
                const totalPages = Math.ceil(filteredCompanies.length / itemsPerPage);
                if (totalPages > 0) {
                    currentPage = totalPages;
                    populateCompaniesTable();
                }
            });
        }
    
        const itemsPerPageSelect = document.querySelector('.items-per-page-select');
        if (itemsPerPageSelect) {
            itemsPerPageSelect.addEventListener('change', updateItemsPerPage);
        }
    
        const showSelects = document.querySelectorAll('.show-select, .items-per-page');
        showSelects.forEach(select => {
            if (!select.hasAttribute('data-listener')) {
                select.setAttribute('data-listener', 'true');
                select.addEventListener('change', function() {
                    const newValue = parseInt(this.value);
                    if (newValue && newValue !== itemsPerPage) {
                        itemsPerPage = newValue;
                        currentPage = 1;
                        populateCompaniesTable();
                    }
                });
            }
        });
    }

    function updateShowingCount(visibleCount) {
        const showingStart = document.getElementById('showing-start');
        const showingEnd = document.getElementById('showing-end');
        
        if (showingStart) showingStart.textContent = visibleCount > 0 ? '1' : '0';
        if (showingEnd) showingEnd.textContent = visibleCount.toString();
    }

    function resetApplicationsViewAfterImport() {
        currentPage = 1;
        currentFilter = 'all';
        currentSelection = 'all';
        itemsPerPage = 50;
        
        const filterButtons = document.querySelectorAll('.filter-buttons .site-button');
        filterButtons.forEach(button => {
            button.classList.remove('active');
            if (button.getAttribute('data-filter') === 'all') {
                button.classList.add('active');
            }
        });

        const selectionButtons = document.querySelectorAll('.selection-button');
        selectionButtons.forEach(button => {
            button.classList.remove('active');
            if (button.getAttribute('data-selection') === 'all') {
                button.classList.add('active');
            }
        });
        
        const itemsPerPageSelect = document.querySelector('.items-per-page-select, .show-select');
        if (itemsPerPageSelect) {
            itemsPerPageSelect.value = '50';
        }
        
        const searchInput = document.getElementById('company-search');
        if (searchInput) {
            searchInput.value = '';
        }
        
        setupPaginationControls();
        
        if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
            window.applicationsModule.populateCompaniesTable();
        }
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Applications view reset after import');
    }

    function setupQuickEditModal() {
        const modal = document.getElementById('quick-edit-links-modal');
        if (!modal) return;

        const closeBtn = document.getElementById('close-quick-edit-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const cancelBtn = document.getElementById('cancel-edit-links');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }

        const saveBtn = document.getElementById('save-edit-links');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const companyId = document.getElementById('edit-links-company-id').value;
                const website = document.getElementById('edit-website').value.trim();
                const linkedin = document.getElementById('edit-linkedin').value.trim();
                const email = document.getElementById('edit-email').value.trim();

                if (!userData.companies[companyId]) return;

                userData.companies[companyId].website = website;
                userData.companies[companyId].linkedin = linkedin;
                userData.companies[companyId].email = email;

                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                populateCompaniesTable();
                modal.classList.remove('show');
                showToast('success', 'Links updated successfully');
                
                setTimeout(() => {
                    const row = document.querySelector(`tr[data-id="${companyId}"]`);
                    if (row) {
                        const links = row.querySelectorAll('.link-icon.active');
                        links.forEach(link => {
                            link.classList.add('link-added');
                            setTimeout(() => link.classList.remove('link-added'), 500);
                        });
                    }
                }, 100);
            });
        }
    }

    function setupCommentsModal() {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Setting up comments modal...');
        const modal = document.getElementById('add-comments-modal');
        if (!modal) {
            window.clientConfig&&window.clientConfig.smartLog('fail','Comments modal not found during setup');
            return;
        }
        window.clientConfig&&window.clientConfig.smartLog('buffer','Comments modal found:', modal);

        const closeBtn = document.getElementById('close-add-comments-modal');
        const cancelBtn = document.getElementById('cancel-add-comments');
        const saveBtn = document.getElementById('save-comments');
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Modal buttons found:', { closeBtn, cancelBtn, saveBtn });

        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Close button clicked');
                clearCommentsModal();
                modal.classList.remove('show');
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Cancel button clicked');
                clearCommentsModal();
                modal.classList.remove('show');
            });
        }

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Modal backdrop clicked');
                clearCommentsModal();
                modal.classList.remove('show');
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Escape key pressed');
                clearCommentsModal();
                modal.classList.remove('show');
            }
        });

        function clearCommentsModal() {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Clearing comments modal');
            const companyIdInput = document.getElementById('comments-company-id');
            const titleInput = document.getElementById('comments-title');
            const contentInput = document.getElementById('comments-content');
            
            if (companyIdInput) companyIdInput.value = '';
            if (titleInput) titleInput.value = '';
            if (contentInput) contentInput.value = '';
            
            const modalTitle = modal.querySelector('.modal-title');
            const saveBtn = document.getElementById('save-comments');
            
            if (modalTitle) modalTitle.textContent = 'Add Comments';
            if (saveBtn) saveBtn.textContent = 'Save Comments';
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                window.clientConfig&&window.clientConfig.smartLog('buffer','Save comments button clicked');
                const companyId = document.getElementById('comments-company-id').value;
                const title = document.getElementById('comments-title').value.trim();
                const content = document.getElementById('comments-content').value.trim();
                
                window.clientConfig&&window.clientConfig.smartLog('buffer','Data to save:', { companyId, title, content });
                
                if (!companyId) {
                    showToast('error', 'Company ID not found');
                    return;
                }

                if (!window.userData) {
                    window.clientConfig&&window.clientConfig.smartLog('fail','userData not found');
                    showToast('error', 'User data not available');
                    return;
                }

                if (!userData.companies[companyId]) {
                    showToast('error', 'Company not found');
                    return;
                }

                if (!window.safeSaveUserPreferences) {
                    window.clientConfig&&window.clientConfig.smartLog('fail','saveUserData function not found');
                    showToast('error', 'Unable to save data');
                    return;
                }
                
                if (!title && !content) {
                    userData.companies[companyId].comments = null;
                } else if (!title) {
                    userData.companies[companyId].comments = content;
                } else {
                    userData.companies[companyId].comments = { title, content };
                }
                
                window.clientConfig&&window.clientConfig.smartLog('buffer','Saving comments:', userData.companies[companyId].comments);
                
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                populateCompaniesTable();
                clearCommentsModal();
                modal.classList.remove('show');
                showToast('success', 'Comments saved successfully');
                
                const row = document.querySelector(`tr[data-id="${companyId}"]`);
                if (row) {
                    const commentTitle = row.querySelector('.comment-title');
                    if (commentTitle) {
                        commentTitle.classList.add('comment-saved');
                        setTimeout(() => commentTitle.classList.remove('comment-saved'), 600);
                    }
                }
            });
        }
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','Comments modal setup complete');
    }

    function openQuickEditLinksModal(companyId, focusField = null) {
        const modal = document.getElementById('quick-edit-links-modal');
        if (!modal) return;

        const company = userData.companies[companyId];
        if (!company) return;

        document.getElementById('edit-links-company-id').value = companyId;
        document.getElementById('edit-website').value = company.website || '';
        document.getElementById('edit-linkedin').value = company.linkedin || '';
        document.getElementById('edit-email').value = company.email || '';

        modal.classList.add('show');

        if (focusField) {
            setTimeout(() => {
                const inputMap = {
                    'website': 'edit-website',
                    'linkedin': 'edit-linkedin',
                    'email': 'edit-email'
                };
                const inputId = inputMap[focusField];
                if (inputId) {
                    document.getElementById(inputId).focus();
                }
            }, 100);
        }
    }

    function openExportModal() {
        if (window.modalsModule && window.modalsModule.openExportModal) {
            window.modalsModule.openExportModal();
        }
    }

    function openImportModal() {
        if (window.modalsModule && window.modalsModule.openImportModal) {
            window.modalsModule.openImportModal();
        }
    }

    function getTodayDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApplications);
    } else {
        initApplications();
    }
    
    window.applicationsModule = {
        populateCompaniesTable,
        updateCompanyData,
        clearAllAppliedDates,
        clearSelectedDates,
        clearAllFavorites,
        clearSelectedFavorites,
        clearAllCompanies,
        deleteSelectedCompanies,
        getDateCategory
    };
})();