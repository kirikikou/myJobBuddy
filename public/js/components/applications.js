(function() {
    let stateOrigin = {
        currentSort: { field: null, direction: 'asc' },
        currentFilter: 'all',
        currentSelection: 'all',
        currentPage: 1,
        itemsPerPage: 50,
        filteredCompanies: [],
        isNewRowActive: false,
        selectedCompanies: new Set(),
        isEditMode: false
    };

    const config = {
        timeouts: {
            focus: 100,
            highlight: 500,
            commentSaved: 600
        },
        dateCategories: {
            hot: 30,
            medium: 15
        }
    };

    const eventHandlers = {
        setupEventListeners() {
            this.bindButtons();
            this.bindFilterControls();
            this.bindSortControls();
            this.bindPaginationControls();
            this.bindModals();
        },

        bindButtons() {
            const buttonMappings = [
                { id: 'export-data-btn', action: () => modals.openExportModal() },
                { id: 'import-data-btn', action: () => modals.openImportModal() },
                { id: 'toggle-edit-mode', action: () => state.toggleEditMode() },
                { id: 'select-all-btn', action: () => selection.selectAll() },
                { id: 'deselect-all-btn', action: () => selection.deselectAll() }
            ];

            buttonMappings.forEach(({ id, action }) => {
                const element = document.getElementById(id);
                if (element) element.addEventListener('click', action);
            });
        },

        bindFilterControls() {
            const companySearch = document.getElementById('company-search');
            if (companySearch) {
                companySearch.addEventListener('input', (e) => {
                    table.filterCompanies(e.target.value.toLowerCase());
                });
            }

            document.querySelectorAll('.filter-buttons .site-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    filters.setActiveFilter(e.target, 'filter');
                    state.currentFilter = e.target.getAttribute('data-filter');
                    state.currentPage = 1;
                    table.populate();
                });
            });

            document.querySelectorAll('.selection-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    filters.setActiveFilter(e.target, 'selection');
                    state.currentSelection = e.target.getAttribute('data-selection');
                    state.currentPage = 1;
                    table.populate();
                });
            });
        },

        bindSortControls() {
            document.querySelectorAll('.sort-button').forEach(button => {
                button.addEventListener('click', (e) => {
                    const field = e.target.getAttribute('data-sort');
                    const direction = e.target.getAttribute('data-direction');
                    sorting.apply(field, direction);
                });
            });
        },

        bindPaginationControls() {
            const itemsPerPageSelect = document.getElementById('items-per-page');
            if (itemsPerPageSelect) {
                itemsPerPageSelect.addEventListener('change', (e) => {
                    state.itemsPerPage = parseInt(e.target.value);
                    state.currentPage = 1;
                    table.populate();
                });
            }
        },

        bindModals() {
            modals.setupAll();
        }
    };

    const logging = {
        log(category, message, data = null) {
            if (window.clientConfig && window.clientConfig.smartLog) {
                window.clientConfig.smartLog(category, message, data);
            }
        }
    };

    const utils = {
        getTodayDate() {
            const today = new Date();
            return today.toISOString().split('T')[0];
        },

        formatDate(dateString) {
            if (!dateString) return '';
            return new Date(dateString).toISOString().split('T')[0];
        },

        getDateCategory(appliedDate) {
            if (!appliedDate) return null;
            
            const today = new Date();
            const applied = new Date(appliedDate);
            const diffDays = Math.ceil(Math.abs(today - applied) / (1000 * 60 * 60 * 24));
            
            if (diffDays > config.dateCategories.hot) return 'hot';
            if (diffDays >= config.dateCategories.medium) return 'medium';
            return 'cold';
        },

        getCommentsDisplay(comments) {
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
        },

        showToast(type, messageKey, params = {}) {
            const message = window.getTranslatedMessage ? 
                window.getTranslatedMessage(messageKey, params) : 
                messageKey;
            if (window.showToast) window.showToast(type, message);
        },

        safeUpdatePreferences() {
            if (window.safeSaveUserPreferences) {
                window.safeSaveUserPreferences(window.userData);
            }
        }
    };

    const state = {
        ...stateOrigin,
        
        toggleEditMode() {
            this.isEditMode = !this.isEditMode;
            ui.updateEditModeDisplay();
            if (!this.isEditMode) {
                selection.deselectAll();
            }
        }
    };

    const selection = {
        selectAll() {
            const visibleRows = document.querySelectorAll('#companies-table tbody tr:not(.new-row):not([style*="display: none"])');
            visibleRows.forEach(row => {
                const companyId = row.getAttribute('data-id');
                if (companyId) {
                    state.selectedCompanies.add(companyId);
                    const checkbox = row.querySelector('.company-checkbox');
                    if (checkbox) checkbox.checked = true;
                }
            });
            ui.updateBulkActionButtons();
        },

        deselectAll() {
            state.selectedCompanies.clear();
            document.querySelectorAll('.company-checkbox').forEach(checkbox => {
                checkbox.checked = false;
            });
            const headerCheckbox = document.getElementById('select-all-header');
            if (headerCheckbox) headerCheckbox.checked = false;
            ui.updateBulkActionButtons();
        },

        toggle(companyId, checked) {
            if (checked) {
                state.selectedCompanies.add(companyId);
            } else {
                state.selectedCompanies.delete(companyId);
            }
            ui.updateBulkActionButtons();
        }
    };

    const filters = {
        setActiveFilter(target, type) {
            const containerClass = type === 'filter' ? '.filter-buttons' : '.selection-buttons';
            const buttons = document.querySelectorAll(`${containerClass} .site-button, ${containerClass} .selection-button`);
            buttons.forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
        }
    };

    const sorting = {
        apply(field, direction) {
            state.currentSort = { field, direction };
            table.populate();
        },

        updateButtonStates() {
            document.querySelectorAll('.sort-button').forEach(button => {
                button.classList.remove('active');
                if (button.getAttribute('data-sort') === state.currentSort.field && 
                    button.getAttribute('data-direction') === state.currentSort.direction) {
                    button.classList.add('active');
                }
            });
        }
    };

    const table = {
        populate() {
            const tbody = document.querySelector('#companies-table tbody');
            if (!tbody) return;

            const companies = Object.entries(window.userData.companies || {});
            
            state.filteredCompanies = companies.filter(([id, company]) => {
                return this.passesFilter(company) && this.passesSelection(company);
            });

            if (state.currentSort.field) {
                this.sortCompanies();
            }

            this.paginate();
            this.renderRows(tbody);
            this.updateUI();
            
            logging.log('buffer', `Showing ${this.getCurrentPageCompanies().length} companies out of ${state.filteredCompanies.length} total filtered companies`);
        },

        passesFilter(company) {
            const dateCategory = utils.getDateCategory(company.appliedDate);
            
            switch (state.currentFilter) {
                case 'applied': return company.appliedDate;
                case 'favorite': return company.favorite;
                case 'not-applied': return !company.appliedDate;
                case 'hot': return dateCategory === 'hot';
                case 'medium': return dateCategory === 'medium';
                case 'cold': return dateCategory === 'cold';
                default: return true;
            }
        },

        passesSelection(company) {
            return state.currentSelection === 'all' || company.selection === state.currentSelection;
        },

        sortCompanies() {
            state.filteredCompanies.sort(([idA, companyA], [idB, companyB]) => {
                let valueA = companyA[state.currentSort.field] || '';
                let valueB = companyB[state.currentSort.field] || '';
                
                if (state.currentSort.field === 'name') {
                    valueA = valueA.toLowerCase();
                    valueB = valueB.toLowerCase();
                } else if (state.currentSort.field === 'appliedDate') {
                    valueA = valueA ? new Date(valueA) : new Date(0);
                    valueB = valueB ? new Date(valueB) : new Date(0);
                }

                const comparison = state.currentSort.field === 'appliedDate' ? 
                    valueA - valueB : 
                    valueA.toString().localeCompare(valueB.toString());
                
                return state.currentSort.direction === 'asc' ? comparison : -comparison;
            });
        },

        paginate() {
            const totalPages = Math.ceil(state.filteredCompanies.length / state.itemsPerPage);
            if (state.currentPage > totalPages && totalPages > 0) {
                state.currentPage = totalPages;
            }
        },

        getCurrentPageCompanies() {
            const startIndex = (state.currentPage - 1) * state.itemsPerPage;
            const endIndex = startIndex + state.itemsPerPage;
            return state.filteredCompanies.slice(startIndex, endIndex);
        },

        renderRows(tbody) {
            tbody.querySelectorAll('tr:not(.new-row)').forEach(row => row.remove());
            
            this.getCurrentPageCompanies().forEach(([companyId, company]) => {
                const row = this.createRow(companyId, company);
                tbody.appendChild(row);
            });
        },

        createRow(companyId, company) {
            const row = document.createElement('tr');
            row.setAttribute('data-id', companyId);
            
            this.addRowClasses(row, company);
            row.innerHTML = this.getRowHTML(companyId, company);
            this.setupRowEvents(row, companyId);
            
            return row;
        },

        addRowClasses(row, company) {
            if (company.appliedDate) row.classList.add('applied');
            if (company.favorite) row.classList.add('favorite');

            const dateCategory = utils.getDateCategory(company.appliedDate);
            if (dateCategory) row.classList.add(`row-${dateCategory}`);
        },

        getRowHTML(companyId, company) {
            const commentsDisplay = utils.getCommentsDisplay(company.comments);
            const isSelected = state.selectedCompanies.has(companyId);

            return `
                <td class="select-cell" style="display: ${state.isEditMode ? 'table-cell' : 'none'};">
                    <input type="checkbox" class="company-checkbox" data-company-id="${companyId}" ${isSelected ? 'checked' : ''} style="width: 18px; height: 18px;">
                </td>
                <td>
                    <input type="text" class="inline-input company-name-edit" value="${company.name || ''}" data-company-id="${companyId}" data-field="name">
                </td>
                <td>
                    <input type="text" class="inline-input" value="${company.location || ''}" data-company-id="${companyId}" data-field="location">
                </td>
                <td>
                    ${this.getSelectionDropdown(companyId, company.selection)}
                </td>
                <td class="icon-cell">${this.getLinkIcon(company.website, 'website', companyId, 'globe')}</td>
                <td class="icon-cell">${this.getLinkIcon(company.linkedin, 'linkedin', companyId, 'linkedin', 'fab')}</td>
                <td class="icon-cell">${this.getLinkIcon(company.email, 'email', companyId, 'envelope', 'fas', 'mailto:')}</td>
                <td>
                    <input type="date" class="inline-input date-input" value="${utils.formatDate(company.appliedDate)}" data-company-id="${companyId}" data-field="appliedDate">
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
        },

        getSelectionDropdown(companyId, selection) {
            const options = ['', 'A', 'B', 'C'];
            return `
                <select class="inline-input selection-select" data-company-id="${companyId}" data-field="selection">
                    ${options.map(opt => 
                        `<option value="${opt}" ${selection === opt ? 'selected' : ''}>${opt || '-'}</option>`
                    ).join('')}
                </select>
            `;
        },

        getLinkIcon(value, field, companyId, iconName, iconClass = 'fas', prefix = '') {
            if (value) {
                const href = prefix ? `${prefix}${value}` : value;
                return `<a href="${href}" target="_blank" class="link-icon active" title="${value}"><i class="${iconClass} fa-${iconName}"></i></a>`;
            }
            return `<span class="link-icon inactive" data-company-id="${companyId}" data-field="${field}" title="Click to add ${field}"><i class="${iconClass} fa-${iconName}"></i></span>`;
        },

        setupRowEvents(row, companyId) {
            this.bindCheckbox(row, companyId);
            this.bindInputs(row, companyId);
            this.bindActions(row, companyId);
        },

        bindCheckbox(row, companyId) {
            const checkbox = row.querySelector('.company-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    selection.toggle(companyId, e.target.checked);
                });
            }
        },

        bindInputs(row, companyId) {
            row.querySelectorAll('.inline-input').forEach(input => {
                const events = ['keydown', 'blur', 'change'];
                events.forEach(event => {
                    input.addEventListener(event, (e) => {
                        if (event === 'keydown' && e.key !== 'Enter') return;
                        if (event === 'keydown') e.preventDefault();
                        if (event === 'keydown') e.target.blur();
                        
                        data.updateCompany(companyId, input.getAttribute('data-field'), input.value);
                    });
                });
            });
        },

        bindActions(row, companyId) {
            const actions = {
                '.favorite-star': () => this.toggleFavorite(row, companyId),
                '.comment-title': () => modals.openComments(companyId),
                '.link-icon.inactive': (e) => modals.openQuickEditLinks(companyId, e.target.closest('[data-field]').getAttribute('data-field')),
                '.edit-links-btn': () => modals.openQuickEditLinks(companyId),
                '.delete-company-btn': () => data.deleteCompany(companyId)
            };

            Object.entries(actions).forEach(([selector, handler]) => {
                const element = row.querySelector(selector);
                if (element) element.addEventListener('click', handler);
            });
        },

        toggleFavorite(row, companyId) {
            const icon = row.querySelector('.favorite-star');
            icon.classList.toggle('active');
            const isFavorite = icon.classList.contains('active');
            
            data.updateCompany(companyId, 'favorite', isFavorite);
            
            if (isFavorite) {
                row.classList.add('favorite');
                icon.setAttribute('title', 'Remove from favorites');
            } else {
                row.classList.remove('favorite');
                icon.setAttribute('title', 'Add to favorites');
            }
        },

        filterCompanies(searchTerm) {
            const rows = document.querySelectorAll('#companies-table tbody tr:not(.new-row)');
            let visibleCount = 0;
            
            rows.forEach(row => {
                const fields = [
                    row.querySelector('.company-name-edit')?.value.toLowerCase() || '',
                    row.querySelector('[data-field="location"]')?.value.toLowerCase() || '',
                    row.querySelector('.comment-title')?.textContent.toLowerCase() || ''
                ];
                
                const matches = fields.some(field => field.includes(searchTerm));
                row.style.display = matches ? '' : 'none';
                if (matches) visibleCount++;
            });
            
            ui.updateShowingCount(visibleCount);
        },

        updateUI() {
            ui.updatePaginationInfo();
            sorting.updateButtonStates();
            ui.updateBulkActionButtons();
            ui.updateEditModeDisplay();
        }
    };

    const data = {
        updateCompany(companyId, field, value) {
            if (!window.userData.companies[companyId]) {
                window.userData.companies[companyId] = {};
            }
            
            const isCompanySelected = state.selectedCompanies.has(companyId);
            const isBulkEditField = ['selection', 'appliedDate', 'favorite'].includes(field);
            const hasMultipleSelected = state.selectedCompanies.size > 1;
            
            if (isCompanySelected && isBulkEditField && hasMultipleSelected) {
                this.bulkUpdate(field, value);
            } else {
                this.singleUpdate(companyId, field, value);
            }
            
            utils.safeUpdatePreferences();
            this.notifyModules(field);
        },

        bulkUpdate(field, value) {
            let updatedCount = 0;
            state.selectedCompanies.forEach(selectedCompanyId => {
                if (window.userData.companies[selectedCompanyId]) {
                    window.userData.companies[selectedCompanyId][field] = value;
                    updatedCount++;
                    
                    if (field === 'appliedDate') {
                        this.updateRowDateClass(selectedCompanyId, value);
                    }
                }
            });
            
            table.populate();
            
            const fieldNames = {
                appliedDate: 'application date',
                favorite: value ? 'favorite status (added)' : 'favorite status (removed)',
                default: field
            };
            
            const fieldName = fieldNames[field] || fieldNames.default;
            utils.showToast('success', `${updatedCount} companies updated: ${fieldName}`);
        },

        singleUpdate(companyId, field, value) {
            if (field === 'appliedDate') {
                this.updateRowDateClass(companyId, value);
            }
            
            window.userData.companies[companyId][field] = value;
        },

        updateRowDateClass(companyId, value) {
            const row = document.querySelector(`tr[data-id="${companyId}"]`);
            if (!row) return;
            
            row.classList.toggle('applied', !!value);
            row.classList.remove('row-hot', 'row-medium', 'row-cold');
            
            const dateCategory = utils.getDateCategory(value);
            if (dateCategory) {
                row.classList.add(`row-${dateCategory}`);
            }
        },

        notifyModules(field) {
            const moduleNotifications = {
                appliedDate: () => {
                    if (window.dashboardModule?.updateDashboard) window.dashboardModule.updateDashboard();
                    if (window.remindersModule?.populateReminders) window.remindersModule.populateReminders();
                },
                favorite: () => {
                    if (window.dashboardModule?.updateDashboard) window.dashboardModule.updateDashboard();
                    if (window.companiesModule?.populateFavoriteCompanies) window.companiesModule.populateFavoriteCompanies();
                },
                default: () => {
                    if (window.dashboardModule?.updateDashboard) window.dashboardModule.updateDashboard();
                }
            };
            
            const notify = moduleNotifications[field] || moduleNotifications.default;
            notify();
        },

        deleteCompany(companyId) {
            const company = window.userData.companies[companyId];
            if (!company) return;
            modals.openDeleteConfirmation(companyId, company.name);
        },

        bulkOperations: {
            clearAllDates() {
                let clearedCount = 0;
                Object.keys(window.userData.companies).forEach(companyId => {
                    if (window.userData.companies[companyId].appliedDate) {
                        window.userData.companies[companyId].appliedDate = '';
                        clearedCount++;
                    }
                });
                
                utils.safeUpdatePreferences();
                table.populate();
                data.notifyModules('appliedDate');
                utils.showToast('success', `${clearedCount} application dates cleared`);
            },

            clearSelectedDates() {
                let clearedCount = 0;
                state.selectedCompanies.forEach(companyId => {
                    if (window.userData.companies[companyId]?.appliedDate) {
                        window.userData.companies[companyId].appliedDate = '';
                        clearedCount++;
                    }
                });
                
                utils.safeUpdatePreferences();
                table.populate();
                data.notifyModules('appliedDate');
                utils.showToast('success', `${clearedCount} selected application dates cleared`);
            },

            clearAllFavorites() {
                let clearedCount = 0;
                Object.keys(window.userData.companies).forEach(companyId => {
                    if (window.userData.companies[companyId].favorite) {
                        window.userData.companies[companyId].favorite = false;
                        clearedCount++;
                    }
                });
                
                utils.safeUpdatePreferences();
                table.populate();
                data.notifyModules('favorite');
                utils.showToast('success', `${clearedCount} favorites cleared`);
            },

            clearSelectedFavorites() {
                let clearedCount = 0;
                state.selectedCompanies.forEach(companyId => {
                    if (window.userData.companies[companyId]?.favorite) {
                        window.userData.companies[companyId].favorite = false;
                        clearedCount++;
                    }
                });
                
                utils.safeUpdatePreferences();
                table.populate();
                data.notifyModules('favorite');
                utils.showToast('success', `${clearedCount} selected favorites cleared`);
            },

            clearAllCompanies() {
                const companyCount = Object.keys(window.userData.companies).length;
                window.userData.companies = {};
                state.selectedCompanies.clear();
                
                utils.safeUpdatePreferences();
                table.populate();
                data.notifyModules('default');
                utils.showToast('success', `${companyCount} companies deleted`);
            },

            deleteSelected() {
                const companiesToDelete = Array.from(state.selectedCompanies);
                let deletedCount = 0;
                
                companiesToDelete.forEach(companyId => {
                    if (window.userData.companies[companyId]) {
                        delete window.userData.companies[companyId];
                        deletedCount++;
                    }
                });
                
                state.selectedCompanies.clear();
                utils.safeUpdatePreferences();
                table.populate();
                data.notifyModules('default');
                utils.showToast('success', `${deletedCount} companies deleted`);
            }
        }
    };

    const ui = {
        updateEditModeDisplay() {
            const elements = {
                selectionControls: document.getElementById('selection-controls'),
                bulkActionButtons: document.getElementById('bulk-action-buttons'),
                selectHeader: document.getElementById('select-header'),
                selectCells: document.querySelectorAll('.select-cell, .select-cell-new'),
                toggleEditBtn: document.getElementById('toggle-edit-mode')
            };

            const displayStyle = state.isEditMode ? 'flex' : 'none';
            const cellDisplayStyle = state.isEditMode ? 'table-cell' : 'none';

            if (elements.selectionControls) elements.selectionControls.style.display = displayStyle;
            if (elements.bulkActionButtons) elements.bulkActionButtons.style.display = displayStyle;
            if (elements.selectHeader) elements.selectHeader.style.display = cellDisplayStyle;
            elements.selectCells.forEach(cell => cell.style.display = cellDisplayStyle);

            if (elements.toggleEditBtn) {
                elements.toggleEditBtn.innerHTML = state.isEditMode ? 
                    '<i class="fas fa-times"></i> Cancel Edit' : 
                    '<i class="fas fa-edit"></i> Edit';
                elements.toggleEditBtn.classList.toggle('active', state.isEditMode);
            }
        },

        updateBulkActionButtons() {
            const selectedCount = state.selectedCompanies.size;
            const elements = {
                selectedCount: document.getElementById('selected-count'),
                selectAllBtn: document.getElementById('select-all-btn'),
                deselectAllBtn: document.getElementById('deselect-all-btn'),
                deleteSelectedBtn: document.getElementById('delete-selected-btn'),
                clearSelectedDatesBtn: document.getElementById('clear-selected-dates-btn'),
                clearSelectedFavoritesBtn: document.getElementById('clear-selected-favorites-btn')
            };

            if (elements.selectedCount) {
                elements.selectedCount.textContent = `${selectedCount} selected`;
            }

            const hasSelection = selectedCount > 0;
            if (elements.selectAllBtn) elements.selectAllBtn.style.display = hasSelection ? 'none' : 'inline-flex';
            if (elements.deselectAllBtn) elements.deselectAllBtn.style.display = hasSelection ? 'inline-flex' : 'none';
            if (elements.deleteSelectedBtn) elements.deleteSelectedBtn.style.display = hasSelection ? 'inline-flex' : 'none';
            if (elements.clearSelectedDatesBtn) elements.clearSelectedDatesBtn.style.display = hasSelection ? 'inline-flex' : 'none';
            if (elements.clearSelectedFavoritesBtn) elements.clearSelectedFavoritesBtn.style.display = hasSelection ? 'inline-flex' : 'none';
        },

        updatePaginationInfo() {
            const totalItems = state.filteredCompanies.length;
            const totalPages = Math.ceil(totalItems / state.itemsPerPage);
            const startItem = Math.min((state.currentPage - 1) * state.itemsPerPage + 1, totalItems);
            const endItem = Math.min(state.currentPage * state.itemsPerPage, totalItems);

            const paginationInfo = document.querySelector('.pagination-info');
            if (paginationInfo) {
                paginationInfo.textContent = totalItems === 0 ? 
                    'Showing 0-0 of 0 companies' : 
                    `Showing ${startItem}-${endItem} of ${totalItems} companies`;
            }

            const pageInfo = document.querySelector('.page-info');
            if (pageInfo) {
                pageInfo.textContent = totalPages === 0 ? 
                    'Page 0 of 0' : 
                    `Page ${state.currentPage} of ${totalPages}`;
            }

            this.updatePaginationButtons(totalPages);
        },

        updatePaginationButtons(totalPages) {
            const prevBtn = document.querySelector('.pagination-prev');
            const nextBtn = document.querySelector('.pagination-next');

            if (prevBtn) prevBtn.disabled = state.currentPage <= 1;
            if (nextBtn) nextBtn.disabled = state.currentPage >= totalPages;
        },

        updateShowingCount(visibleCount) {
            const showingStart = document.getElementById('showing-start');
            const showingEnd = document.getElementById('showing-end');
            
            if (showingStart) showingStart.textContent = visibleCount > 0 ? '1' : '0';
            if (showingEnd) showingEnd.textContent = visibleCount.toString();
        }
    };

    const modals = {
        setupAll() {
            this.setupComments();
            this.setupQuickEdit();
            this.setupDeleteConfirmation();
            this.setupBulkActions();
        },

        setupComments() {
            logging.log('buffer', 'Setting up comments modal...');
            const modal = document.getElementById('add-comments-modal');
            if (!modal) {
                logging.log('fail', 'Comments modal not found during setup');
                return;
            }

            const closeHandlers = [
                { id: 'close-add-comments-modal', action: () => this.closeComments(modal) },
                { id: 'cancel-add-comments', action: () => this.closeComments(modal) }
            ];

            closeHandlers.forEach(({ id, action }) => {
                const element = document.getElementById(id);
                if (element) element.addEventListener('click', action);
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeComments(modal);
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && modal.classList.contains('show')) {
                    this.closeComments(modal);
                }
            });

            const saveBtn = document.getElementById('save-comments');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveComments(modal));
            }

            logging.log('buffer', 'Comments modal setup complete');
        },

        openComments(companyId) {
            logging.log('buffer', 'Opening comments modal for company:', companyId);
            const modal = document.getElementById('add-comments-modal');
            if (!modal) {
                logging.log('fail', 'Comments modal not found');
                return;
            }

            if (!window.userData) {
                utils.showToast('error', 'User data not available');
                return;
            }
            
            const company = window.userData.companies[companyId];
            if (!company) {
                utils.showToast('error', 'Company not found');
                return;
            }

            this.populateCommentsForm(companyId, company);
            modal.classList.add('show');
            
            setTimeout(() => {
                const titleInput = document.getElementById('comments-title');
                if (titleInput) titleInput.focus();
            }, config.timeouts.focus);
        },

        populateCommentsForm(companyId, company) {
            const elements = {
                companyId: document.getElementById('comments-company-id'),
                title: document.getElementById('comments-title'),
                content: document.getElementById('comments-content')
            };

            if (elements.companyId) elements.companyId.value = companyId;

            let title = '';
            let content = '';
            
            if (company.comments) {
                if (typeof company.comments === 'string') {
                    content = company.comments;
                } else if (typeof company.comments === 'object') {
                    title = company.comments.title || '';
                    content = company.comments.content || '';
                }
            }

            if (elements.title) elements.title.value = title;
            if (elements.content) elements.content.value = content;

            this.updateCommentsModalTitle(!!company.comments);
        },

        updateCommentsModalTitle(hasComments) {
            const modal = document.getElementById('add-comments-modal');
            const modalTitle = modal?.querySelector('.modal-title');
            const saveBtn = document.getElementById('save-comments');
            
            if (modalTitle) modalTitle.textContent = hasComments ? 'Edit Comments' : 'Add Comments';
            if (saveBtn) saveBtn.textContent = hasComments ? 'Update Comments' : 'Save Comments';
        },

        saveComments(modal) {
            logging.log('buffer', 'Save comments button clicked');
            const companyId = document.getElementById('comments-company-id').value;
            const title = document.getElementById('comments-title').value.trim();
            const content = document.getElementById('comments-content').value.trim();
            
            if (!companyId || !window.userData?.companies[companyId]) {
                utils.showToast('error', 'Company not found');
                return;
            }

            if (!title && !content) {
                window.userData.companies[companyId].comments = null;
            } else if (!title) {
                window.userData.companies[companyId].comments = content;
            } else {
                window.userData.companies[companyId].comments = { title, content };
            }
            
            utils.safeUpdatePreferences();
            table.populate();
            this.clearCommentsForm();
            modal.classList.remove('show');
            utils.showToast('success', 'Comments saved successfully');
            
            this.highlightCommentSaved(companyId);
        },

        highlightCommentSaved(companyId) {
            const row = document.querySelector(`tr[data-id="${companyId}"]`);
            if (row) {
                const commentTitle = row.querySelector('.comment-title');
                if (commentTitle) {
                    commentTitle.classList.add('comment-saved');
                    setTimeout(() => commentTitle.classList.remove('comment-saved'), config.timeouts.commentSaved);
                }
            }
        },

        closeComments(modal) {
            this.clearCommentsForm();
            modal.classList.remove('show');
        },

        clearCommentsForm() {
            const elements = ['comments-company-id', 'comments-title', 'comments-content'];
            elements.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.value = '';
            });
        },

        setupQuickEdit() {
            const modal = document.getElementById('quick-edit-links-modal');
            if (!modal) return;

            const handlers = [
                { id: 'close-quick-edit-modal', action: () => modal.classList.remove('show') },
                { id: 'cancel-edit-links', action: () => modal.classList.remove('show') },
                { id: 'save-edit-links', action: () => this.saveQuickEdit(modal) }
            ];

            handlers.forEach(({ id, action }) => {
                const element = document.getElementById(id);
                if (element) element.addEventListener('click', action);
            });
        },

        openQuickEditLinks(companyId, focusField = null) {
            const modal = document.getElementById('quick-edit-links-modal');
            if (!modal) return;

            const company = window.userData.companies[companyId];
            if (!company) return;

            document.getElementById('edit-links-company-id').value = companyId;
            document.getElementById('edit-website').value = company.website || '';
            document.getElementById('edit-linkedin').value = company.linkedin || '';
            document.getElementById('edit-email').value = company.email || '';

            modal.classList.add('show');

            if (focusField) {
                this.focusEditField(focusField);
            }
        },

        focusEditField(focusField) {
            const inputMap = {
                'website': 'edit-website',
                'linkedin': 'edit-linkedin',
                'email': 'edit-email'
            };
            
            const inputId = inputMap[focusField];
            if (inputId) {
                setTimeout(() => {
                    const input = document.getElementById(inputId);
                    if (input) input.focus();
                }, config.timeouts.focus);
            }
        },

        saveQuickEdit(modal) {
            const companyId = document.getElementById('edit-links-company-id').value;
            const links = {
                website: document.getElementById('edit-website').value.trim(),
                linkedin: document.getElementById('edit-linkedin').value.trim(),
                email: document.getElementById('edit-email').value.trim()
            };

            if (!window.userData.companies[companyId]) return;

            Object.entries(links).forEach(([field, value]) => {
                window.userData.companies[companyId][field] = value;
            });

            utils.safeUpdatePreferences();
            table.populate();
            modal.classList.remove('show');
            utils.showToast('success', 'Links updated successfully');
            
            this.highlightLinksUpdated(companyId);
        },

        highlightLinksUpdated(companyId) {
            setTimeout(() => {
                const row = document.querySelector(`tr[data-id="${companyId}"]`);
                if (row) {
                    const links = row.querySelectorAll('.link-icon.active');
                    links.forEach(link => {
                        link.classList.add('link-added');
                        setTimeout(() => link.classList.remove('link-added'), config.timeouts.highlight);
                    });
                }
            }, config.timeouts.focus);
        },

        setupDeleteConfirmation() {
            const modal = document.getElementById('delete-confirmation-modal');
            if (!modal) return;

            const handlers = [
                { id: 'close-delete-confirmation-modal', action: () => modal.classList.remove('show') },
                { id: 'cancel-delete-confirmation', action: () => modal.classList.remove('show') },
                { id: 'confirm-delete-company', action: () => this.confirmDelete(modal) }
            ];

            handlers.forEach(({ id, action }) => {
                const element = document.getElementById(id);
                if (element) element.addEventListener('click', action);
            });
        },

        openDeleteConfirmation(companyId, companyName) {
            const modal = document.getElementById('delete-confirmation-modal');
            if (!modal) return;

            const companyNameElement = document.getElementById('company-name-to-delete');
            if (companyNameElement) {
                companyNameElement.textContent = `"${companyName}"?`;
            }

            modal.setAttribute('data-company-id', companyId);
            modal.classList.add('show');
        },

        confirmDelete(modal) {
            const companyId = modal.getAttribute('data-company-id');
            if (!companyId) {
                utils.showToast('error', 'Company ID not found');
                return;
            }

            delete window.userData.companies[companyId];
            state.selectedCompanies.delete(companyId);
            utils.safeUpdatePreferences();

            table.populate();
            data.notifyModules('default');

            modal.classList.remove('show');
            utils.showToast('success', 'Company deleted successfully');
        },

        setupBulkActions() {
            const bulkActionModals = [
                { id: 'clear-all-dates-modal', action: data.bulkOperations.clearAllDates },
                { id: 'clear-selected-dates-modal', action: data.bulkOperations.clearSelectedDates },
                { id: 'clear-all-favorites-modal', action: data.bulkOperations.clearAllFavorites },
                { id: 'clear-selected-favorites-modal', action: data.bulkOperations.clearSelectedFavorites },
                { id: 'clear-all-companies-modal', action: data.bulkOperations.clearAllCompanies },
                { id: 'delete-selected-modal', action: data.bulkOperations.deleteSelected }
            ];

            bulkActionModals.forEach(({ id, action }) => {
                this.setupBulkActionModal(id, action);
            });

            this.setupBulkActionButtons();
        },

        setupBulkActionModal(modalId, confirmAction) {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            const baseId = modalId.replace('-modal', '');
            const handlers = [
                { id: `close-${modalId}`, action: () => modal.classList.remove('show') },
                { id: `cancel-${baseId}`, action: () => modal.classList.remove('show') },
                { id: `confirm-${baseId}`, action: () => { confirmAction(); modal.classList.remove('show'); } }
            ];

            handlers.forEach(({ id, action }) => {
                const element = document.getElementById(id);
                if (element) element.addEventListener('click', action);
            });
        },

        setupBulkActionButtons() {
            const bulkButtons = [
                { id: 'clear-all-dates-btn', action: () => this.openBulkModal('clear-all-dates-modal') },
                { id: 'clear-selected-dates-btn', action: () => this.openBulkModal('clear-selected-dates-modal') },
                { id: 'clear-all-favorites-btn', action: () => this.openBulkModal('clear-all-favorites-modal') },
                { id: 'clear-selected-favorites-btn', action: () => this.openBulkModal('clear-selected-favorites-modal') },
                { id: 'clear-all-companies-btn', action: () => this.openBulkModal('clear-all-companies-modal') },
                { id: 'delete-selected-btn', action: () => this.openDeleteSelectedModal() }
            ];

            bulkButtons.forEach(({ id, action }) => {
                const element = document.getElementById(id);
                if (element) {
                    element.addEventListener('click', () => {
                        logging.log('buffer', `${id} clicked`);
                        action();
                    });
                }
            });
        },

        openBulkModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) {
                logging.log('buffer', `Opening ${modalId}`);
                modal.classList.add('show');
            } else {
                logging.log('fail', `${modalId} not found`);
            }
        },

        openDeleteSelectedModal() {
            const modal = document.getElementById('delete-selected-modal');
            if (!modal) {
                logging.log('fail', 'delete-selected-modal not found');
                return;
            }

            const selectedCompanyNames = Array.from(state.selectedCompanies)
                .map(id => window.userData.companies[id]?.name)
                .filter(name => name);

            const companiesList = document.getElementById('selected-companies-list');
            if (companiesList) {
                companiesList.innerHTML = selectedCompanyNames
                    .map(name => `<li>${name}</li>`)
                    .join('');
            }

            const countElement = document.getElementById('selected-companies-count');
            if (countElement) {
                countElement.textContent = state.selectedCompanies.size;
            }

            logging.log('buffer', 'Opening Delete Selected Modal');
            modal.classList.add('show');
        },

        openExportModal() {
            if (window.modalsModule?.openExportModal) {
                window.modalsModule.openExportModal();
            }
        },

        openImportModal() {
            if (window.modalsModule?.openImportModal) {
                window.modalsModule.openImportModal();
            }
        }
    };

    const newRow = {
        setup() {
            const newRowElement = document.getElementById('new-company-row');
            if (!newRowElement) return;

            this.bindInputs(newRowElement);
            this.bindActions(newRowElement);
            this.initializeDate(newRowElement);
        },

        bindInputs(newRowElement) {
            const inputs = newRowElement.querySelectorAll('.inline-input');
            const companyNameInput = newRowElement.querySelector('.company-name');
            const saveBtn = newRowElement.querySelector('.save-row-btn');

            inputs.forEach(input => {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (input.classList.contains('company-name') && input.value.trim()) {
                            this.save();
                        } else {
                            const nextInput = this.getNextInput(input);
                            if (nextInput) {
                                nextInput.focus();
                            } else if (companyNameInput?.value.trim()) {
                                this.save();
                            }
                        }
                    }
                });

                input.addEventListener('input', () => {
                    const hasContent = Array.from(inputs).some(inp => inp.value.trim());
                    if (saveBtn) {
                        saveBtn.style.opacity = hasContent ? '1' : '0.3';
                        state.isNewRowActive = hasContent;
                    }
                });
            });
        },

        bindActions(newRowElement) {
            const favoriteIcon = newRowElement.querySelector('.favorite-star');
            if (favoriteIcon) {
                favoriteIcon.addEventListener('click', () => {
                    favoriteIcon.classList.toggle('active');
                });
            }

            const commentPlaceholder = newRowElement.querySelector('.comment-placeholder');
            if (commentPlaceholder) {
                commentPlaceholder.addEventListener('click', () => {
                    utils.showToast('info', 'Please save the company first to add comments');
                });
            }

            const saveBtn = newRowElement.querySelector('.save-row-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const companyNameInput = newRowElement.querySelector('.company-name');
                    if (companyNameInput?.value.trim()) {
                        this.save();
                    }
                });
            }
        },

        initializeDate(newRowElement) {
            const dateInput = newRowElement.querySelector('.date-input');
            if (dateInput) {
                dateInput.value = utils.getTodayDate();
            }
        },

        getNextInput(currentInput) {
            const inputs = Array.from(document.querySelectorAll('#new-company-row .inline-input'));
            const currentIndex = inputs.indexOf(currentInput);
            return inputs[currentIndex + 1] || null;
        },

        save() {
            const newRowElement = document.getElementById('new-company-row');
            if (!newRowElement) return;

            const inputs = newRowElement.querySelectorAll('.inline-input');
            const companyName = newRowElement.querySelector('.company-name')?.value.trim();
            
            if (!companyName) return;

            const companyId = Date.now().toString();
            const companyData = {
                name: companyName,
                location: '',
                status: 'interested',
                appliedDate: '',
                website: '',
                linkedin: '',
                email: '',
                comments: '',
                favorite: newRowElement.querySelector('.favorite-star')?.classList.contains('active') || false
            };

            inputs.forEach(input => {
                const field = input.getAttribute('data-field') || 
                             (input.classList.contains('company-name') ? 'name' : null);
                if (field && field !== 'name') {
                    companyData[field] = input.value;
                }
            });

            if (!window.userData.companies) {
                window.userData.companies = {};
            }
            
            window.userData.companies[companyId] = companyData;
            utils.safeUpdatePreferences();
            
            this.clear();
            table.populate();
            
            if (window.dashboardModule?.updateDashboard) {
                window.dashboardModule.updateDashboard();
            }
            
            utils.showToast('success', 'Company added successfully');
        },

        clear() {
            const newRowElement = document.getElementById('new-company-row');
            if (!newRowElement) return;

            const inputs = newRowElement.querySelectorAll('.inline-input');
            inputs.forEach(input => {
                if (input.classList.contains('date-input')) {
                    input.value = utils.getTodayDate();
                } else {
                    input.value = '';
                }
            });

            const favoriteIcon = newRowElement.querySelector('.favorite-star');
            if (favoriteIcon) favoriteIcon.classList.remove('active');

            const saveBtn = newRowElement.querySelector('.save-row-btn');
            if (saveBtn) saveBtn.style.opacity = '0.3';

            state.isNewRowActive = false;
        }
    };

    const pagination = {
        setup() {
            const controls = [
                { id: 'first-page', action: () => this.goToPage(1) },
                { id: 'prev-page', action: () => this.goToPage(state.currentPage - 1) },
                { id: 'next-page', action: () => this.goToPage(state.currentPage + 1) },
                { id: 'last-page', action: () => this.goToPage(Math.ceil(state.filteredCompanies.length / state.itemsPerPage)) }
            ];

            controls.forEach(({ id, action }) => {
                const element = document.getElementById(id);
                if (element) element.addEventListener('click', action);
            });

            const itemsPerPageSelect = document.getElementById('items-per-page');
            if (itemsPerPageSelect) {
                itemsPerPageSelect.addEventListener('change', (e) => {
                    state.itemsPerPage = parseInt(e.target.value);
                    state.currentPage = 1;
                    table.populate();
                });
            }
        },

        goToPage(page) {
            const totalPages = Math.ceil(state.filteredCompanies.length / state.itemsPerPage);
            if (page >= 1 && page <= totalPages) {
                state.currentPage = page;
                table.populate();
            }
        }
    };

    function initializeComponentI18n() {
        if (window.uiManager) {
            window.uiManager.translatePage();
            window.uiManager.onLanguageChange(() => {
                setTimeout(initializeComponentI18n, config.timeouts.focus);
            });
        }
    }

    function resetApplicationsViewAfterImport() {
        state.currentPage = 1;
        state.currentFilter = 'all';
        state.currentSelection = 'all';
        state.itemsPerPage = 50;
        
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
        if (itemsPerPageSelect) itemsPerPageSelect.value = '50';
        
        const searchInput = document.getElementById('company-search');
        if (searchInput) searchInput.value = '';
        
        pagination.setup();
        table.populate();
        
        logging.log('buffer', 'Applications view reset after import');
    }

    function initApplications() {
        eventHandlers.setupEventListeners();
        table.populate();
        newRow.setup();
        pagination.setup();
        ui.updateEditModeDisplay();
        initializeComponentI18n();
    }

    window.getComponentData = function() {
        return {
            currentSort: state.currentSort,
            currentFilter: state.currentFilter,
            currentSelection: state.currentSelection,
            currentPage: state.currentPage,
            itemsPerPage: state.itemsPerPage,
            selectedCompanies: Array.from(state.selectedCompanies),
            isEditMode: state.isEditMode
        };
    };

    window.setComponentData = function(data) {
        if (data.currentSort) state.currentSort = data.currentSort;
        if (data.currentFilter) state.currentFilter = data.currentFilter;
        if (data.currentSelection) state.currentSelection = data.currentSelection;
        if (data.currentPage) state.currentPage = data.currentPage;
        if (data.itemsPerPage) state.itemsPerPage = data.itemsPerPage;
        if (data.selectedCompanies) state.selectedCompanies = new Set(data.selectedCompanies);
        if (data.isEditMode !== undefined) state.isEditMode = data.isEditMode;
        
        table.populate();
        ui.updateBulkActionButtons();
        ui.updateEditModeDisplay();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApplications);
    } else {
        initApplications();
    }
    
    window.applicationsModule = {
        populateCompaniesTable: table.populate,
        updateCompanyData: data.updateCompany,
        clearAllAppliedDates: data.bulkOperations.clearAllDates,
        clearSelectedDates: data.bulkOperations.clearSelectedDates,
        clearAllFavorites: data.bulkOperations.clearAllFavorites,
        clearSelectedFavorites: data.bulkOperations.clearSelectedFavorites,
        clearAllCompanies: data.bulkOperations.clearAllCompanies,
        deleteSelectedCompanies: data.bulkOperations.deleteSelected,
        getDateCategory: utils.getDateCategory,
        resetApplicationsViewAfterImport
    };
})();