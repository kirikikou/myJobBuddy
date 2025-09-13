(function() {
    let isEditMode = false;
    let currentEditId = null;
    let confirmCallback = null;
    
    function initResources() {
        setupEventListeners();
        populateCoverLetters();
        populateLinks();
        initializeComponentI18n();
    }

    window.getComponentData = function() {
        return {
            resources: resources,
            categories: categories
        };
    };

    window.setComponentData = function(data) {
        if (data.resources) resources = data.resources;
        if (data.categories) categories = data.categories;
        renderResources();
    };

    function initializeComponentI18n() {
        if (window.uiManager && window.uiManager.isInitialized) {
            window.uiManager.translatePage();
            window.uiManager.onLanguageChange(() => {
                setTimeout(() => {
                    window.uiManager.translatePage();
                    populateCoverLetters();
                    populateLinks();
                }, 100);
            });
        }
    }

    function showLocalizedToast(type, messageKey, params = {}) {
        const message = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate(messageKey, params) : 
            messageKey;
        showToast(message, type);
    }

    function setupEventListeners() {
        document.getElementById('toggle-edit-mode-btn')?.addEventListener('click', toggleEditMode);
        
        document.getElementById('add-cover-letter')?.addEventListener('click', function() {
            openModal('add-cover-letter-modal');
        });
        
        document.getElementById('add-link')?.addEventListener('click', function() {
            openModal('add-link-modal');
        });
        
        document.querySelectorAll('.modal-close, #cancel-cover-letter, #cancel-link').forEach(btn => {
            btn.addEventListener('click', function() {
                closeModal(this.closest('.modal-backdrop').id);
            });
        });
        
        document.getElementById('save-cover-letter')?.addEventListener('click', saveCoverLetter);
        document.getElementById('save-link')?.addEventListener('click', saveLink);
        
        document.getElementById('delete-cover-letter')?.addEventListener('click', function() {
            const message = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('resources.confirmDeleteCoverLetter') : 
                'Are you sure you want to delete this cover letter?';
            
            showConfirmDialog(message, function() {
                if (currentEditId) {
                    deleteCoverLetter(currentEditId);
                    closeModal('add-cover-letter-modal');
                    currentEditId = null;
                }
            });
        });
        
        document.getElementById('delete-link')?.addEventListener('click', function() {
            const message = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('resources.confirmDeleteLink') : 
                'Are you sure you want to delete this link?';
            
            showConfirmDialog(message, function() {
                if (currentEditId) {
                    deleteLink(currentEditId);
                    closeModal('add-link-modal');
                    currentEditId = null;
                }
            });
        });
        
        document.getElementById('cancel-confirm')?.addEventListener('click', function() {
            closeModal('confirm-dialog-modal');
        });
        
        document.getElementById('confirm-action')?.addEventListener('click', function() {
            if (typeof confirmCallback === 'function') {
                confirmCallback();
                confirmCallback = null;
            }
            closeModal('confirm-dialog-modal');
        });
    }
    
    function showConfirmDialog(message, callback) {
        const modal = document.getElementById('confirm-dialog-modal');
        const messageEl = document.getElementById('confirm-dialog-message');
        
        if (modal && messageEl) {
            messageEl.textContent = message;
            confirmCallback = callback;
            openModal('confirm-dialog-modal');
        }
    }
    
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = message;
        
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 10);
        
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => container.removeChild(toast), 300);
        }, 3000);
    }
    
    function openModal(modalId, data = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        if (modalId === 'add-cover-letter-modal') {
            setupCoverLetterModal(data);
        } else if (modalId === 'add-link-modal') {
            setupLinkModal(data);
        }
        
        modal.classList.add('show');
    }
    
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    }
    
    function setupCoverLetterModal(letterId) {
        document.getElementById('cover-letter-title').value = '';
        document.getElementById('cover-letter-content').value = '';
        
        const deleteBtn = document.getElementById('delete-cover-letter');
        const modalTitle = document.querySelector('#add-cover-letter-modal .modal-title');
        const saveBtn = document.getElementById('save-cover-letter');
        
        if (letterId) {
            currentEditId = letterId;
            const letter = userData.coverLetters[letterId];
            
            if (letter) {
                document.getElementById('cover-letter-title').value = letter.title || '';
                document.getElementById('cover-letter-content').value = letter.content || '';
                
                if (modalTitle) {
                    const titleText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('resources.editCoverLetter') : 
                        'Edit Cover Letter';
                    modalTitle.textContent = titleText;
                }
                if (saveBtn) {
                    const saveText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('resources.update') : 
                        'Update';
                    saveBtn.textContent = saveText;
                }
                if (deleteBtn) deleteBtn.style.display = 'block';
            }
        } else {
            currentEditId = null;
            if (modalTitle) {
                const titleText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('resources.addCoverLetter') : 
                    'Add Cover Letter';
                modalTitle.textContent = titleText;
            }
            if (saveBtn) {
                const saveText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('common.save') : 
                    'Save';
                saveBtn.textContent = saveText;
            }
            if (deleteBtn) deleteBtn.style.display = 'none';
        }
    }
    
    function setupLinkModal(linkId) {
        document.getElementById('link-title').value = '';
        document.getElementById('link-url').value = '';
        document.getElementById('link-icon').value = 'fas fa-globe';
        document.getElementById('link-description').value = '';
        
        const deleteBtn = document.getElementById('delete-link');
        const modalTitle = document.querySelector('#add-link-modal .modal-title');
        const saveBtn = document.getElementById('save-link');
        
        if (linkId) {
            currentEditId = linkId;
            const link = userData.links[linkId];
            
            if (link) {
                document.getElementById('link-title').value = link.title || '';
                document.getElementById('link-url').value = link.url || '';
                document.getElementById('link-icon').value = link.icon || 'fas fa-globe';
                document.getElementById('link-description').value = link.description || '';
                
                if (modalTitle) {
                    const titleText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('resources.editProfessionalLink') : 
                        'Edit Professional Link';
                    modalTitle.textContent = titleText;
                }
                if (saveBtn) {
                    const saveText = window.uiManager && window.uiManager.translate ? 
                        window.uiManager.translate('resources.update') : 
                        'Update';
                    saveBtn.textContent = saveText;
                }
                if (deleteBtn) deleteBtn.style.display = 'block';
            }
        } else {
            currentEditId = null;
            if (modalTitle) {
                const titleText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('resources.addProfessionalLink') : 
                    'Add Professional Link';
                modalTitle.textContent = titleText;
            }
            if (saveBtn) {
                const saveText = window.uiManager && window.uiManager.translate ? 
                    window.uiManager.translate('common.save') : 
                    'Save';
                saveBtn.textContent = saveText;
            }
            if (deleteBtn) deleteBtn.style.display = 'none';
        }
    }
    
    async function saveCoverLetter() {
        const title = document.getElementById('cover-letter-title').value.trim();
        const content = document.getElementById('cover-letter-content').value.trim();
        
        if (!title) {
            showLocalizedToast('error', 'resources.titleRequired');
            return;
        }
        
        if (!content) {
            showLocalizedToast('error', 'resources.contentRequired');
            return;
        }
        
        const letterId = currentEditId || 'letter_' + Date.now();
        
        if (!userData.coverLetters) userData.coverLetters = {};
        userData.coverLetters[letterId] = { title, content };
        
        try {
            if(window.safeSaveUserPreferences){await window.safeSaveUserPreferences(userData)}
            closeModal('add-cover-letter-modal');
            populateCoverLetters();
            showLocalizedToast('success', currentEditId ? 'resources.coverLetterUpdated' : 'resources.coverLetterSaved');
            currentEditId = null;
        } catch (error) {
            console.error("Error saving cover letter:", error);
            showLocalizedToast('error', 'resources.errorSavingCoverLetter');
        }
    }
    
    function saveLink() {
        const title = document.getElementById('link-title').value.trim();
        const url = document.getElementById('link-url').value.trim();
        const icon = document.getElementById('link-icon').value;
        const description = document.getElementById('link-description').value.trim();
        
        if (!title) {
            showLocalizedToast('error', 'resources.titleRequired');
            return;
        }
        
        if (!url) {
            showLocalizedToast('error', 'resources.urlRequired');
            return;
        }
        
        try {
            new URL(url);
        } catch (e) {
            showLocalizedToast('error', 'resources.invalidUrlFormat');
            return;
        }
        
        const linkId = currentEditId || 'link_' + Date.now();
        
        if (!userData.links) userData.links = {};
        userData.links[linkId] = { title, url, icon, description };
        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(userData);
        }
        
        closeModal('add-link-modal');
        populateLinks();
        showLocalizedToast('success', currentEditId ? 'resources.linkUpdated' : 'resources.linkSaved');
        currentEditId = null;
    }
    
    function deleteCoverLetter(id) {
        if (userData.coverLetters && userData.coverLetters[id]) {
            delete userData.coverLetters[id];
            
            if (userData.coverLetterOrder) {
                userData.coverLetterOrder = userData.coverLetterOrder.filter(letterId => letterId !== id);
            }
            
            removeFromDashboard(id, 'coverLetter');
            if (window.safeSaveUserPreferences) {
                window.safeSaveUserPreferences(userData);
            }
            populateCoverLetters();
            showLocalizedToast('success', 'resources.coverLetterDeleted');
        }
    }
    
    function deleteLink(id) {
        if (userData.links && userData.links[id]) {
            delete userData.links[id];
            
            if (userData.linkOrder) {
                userData.linkOrder = userData.linkOrder.filter(linkId => linkId !== id);
            }
            
            removeFromDashboard(id, 'link');
            if (window.safeSaveUserPreferences) {
                window.safeSaveUserPreferences(userData);
            }
            populateLinks();
            showLocalizedToast('success', 'resources.linkDeleted');
        }
    }
    
    function toggleEditMode() {
        isEditMode = !isEditMode;
        const editModeBtn = document.getElementById('toggle-edit-mode-btn');
        
        if (isEditMode) {
            const doneText = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('resources.done') : 
                'Done';
            editModeBtn.innerHTML = `<i class="fas fa-check"></i> ${doneText}`;
            editModeBtn.classList.add('btn-success');
            editModeBtn.classList.remove('btn-primary');
            enableDragAndDrop();
        } else {
            const editLayoutText = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('resources.editLayout') : 
                'Edit Layout';
            editModeBtn.innerHTML = `<i class="fas fa-grip-horizontal"></i> ${editLayoutText}`;
            editModeBtn.classList.add('btn-primary');
            editModeBtn.classList.remove('btn-success');
            disableDragAndDrop();
        }
    }
    
    function enableDragAndDrop() {
        const coverLettersGrid = document.getElementById('cover-letters-grid');
        const linksGrid = document.getElementById('links-grid');
        
        document.querySelectorAll('.resource-item:not(.add-resource)').forEach(item => {
            item.setAttribute('draggable', 'true');
            item.classList.add('draggable');
            
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('dragenter', handleDragEnter);
            item.addEventListener('dragleave', handleDragLeave);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
        });
        
        [coverLettersGrid, linksGrid].forEach(grid => {
            if (grid) grid.classList.add('drop-zone');
        });
        
        showLocalizedToast('info', 'resources.dragDropEnabled');
    }
    
    function disableDragAndDrop() {
        document.querySelectorAll('.resource-item').forEach(item => {
            item.removeAttribute('draggable');
            item.classList.remove('draggable');
            
            item.removeEventListener('dragstart', handleDragStart);
            item.removeEventListener('dragover', handleDragOver);
            item.removeEventListener('dragenter', handleDragEnter);
            item.removeEventListener('dragleave', handleDragLeave);
            item.removeEventListener('drop', handleDrop);
            item.removeEventListener('dragend', handleDragEnd);
        });
        
        document.querySelectorAll('.drop-zone').forEach(zone => {
            zone.classList.remove('drop-zone');
        });
        
        saveResourcesOrder();
    }
    
    let draggedItem = null;
    
    function handleDragStart(e) {
        draggedItem = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }
    
    function handleDragOver(e) {
        e.preventDefault();
        return false;
    }
    
    function handleDragEnter(e) {
        this.classList.add('drag-over');
    }
    
    function handleDragLeave(e) {
        this.classList.remove('drag-over');
    }
    
    function handleDrop(e) {
        e.stopPropagation();
        
        if (draggedItem !== this) {
            const parent = this.parentNode;
            const addButton = parent.querySelector('.add-resource');
            
            const items = Array.from(parent.querySelectorAll('.resource-item:not(.add-resource)'));
            const targetIndex = items.indexOf(this);
            const sourceIndex = items.indexOf(draggedItem);
            
            if (targetIndex > sourceIndex) {
                parent.insertBefore(draggedItem, this.nextSibling);
            } else {
                parent.insertBefore(draggedItem, this);
            }
        }
        
        this.classList.remove('drag-over');
        return false;
    }
    
    function handleDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(item => {
            item.classList.remove('drag-over');
        });
    }
    
    function saveResourcesOrder() {
        const coverLettersGrid = document.getElementById('cover-letters-grid');
        if (coverLettersGrid) {
            const coverLetterItems = coverLettersGrid.querySelectorAll('.resource-item:not(.add-resource)');
            userData.coverLetterOrder = Array.from(coverLetterItems).map(item => item.getAttribute('data-id'));
        }
        
        const linksGrid = document.getElementById('links-grid');
        if (linksGrid) {
            const linkItems = linksGrid.querySelectorAll('.resource-item:not(.add-resource)');
            userData.linkOrder = Array.from(linkItems).map(item => item.getAttribute('data-id'));
        }
        
        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(userData);
        }
        showLocalizedToast('success', 'resources.layoutSaved');
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showLocalizedToast('success', 'resources.copiedToClipboard');
            })
            .catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showLocalizedToast('success', 'resources.copiedToClipboard');
            });
    }
    
    function isInDashboard(sourceId, type) {
        if (!userData.dashboardWidgets) return false;
        
        return Object.values(userData.dashboardWidgets).some(widget => 
            widget.sourceId === sourceId && widget.type === type
        );
    }
    
    function removeFromDashboard(sourceId, type) {
        if (!userData.dashboardWidgets) return;
        
        Object.keys(userData.dashboardWidgets).forEach(widgetId => {
            const widget = userData.dashboardWidgets[widgetId];
            if (widget.sourceId === sourceId && widget.type === type) {
                delete userData.dashboardWidgets[widgetId];
            }
        });
    }
    
    function toggleDashboardItem(id, type) {
        const isCurrentlyInDashboard = isInDashboard(id, type);
        
        if (isCurrentlyInDashboard) {
            removeFromDashboard(id, type);
            showLocalizedToast('success', 'resources.removedFromDashboard');
        } else {
            if (type === 'coverLetter' && userData.coverLetters && userData.coverLetters[id]) {
                const letter = userData.coverLetters[id];
                
                if (!userData.dashboardWidgets) userData.dashboardWidgets = {};
                
                const widgetId = 'widget_' + Date.now();
                userData.dashboardWidgets[widgetId] = {
                    type: 'coverLetter',
                    title: letter.title,
                    content: letter.content,
                    sourceId: id
                };
                
                showLocalizedToast('success', 'resources.addedToDashboard');
            } else if (type === 'link' && userData.links && userData.links[id]) {
                const link = userData.links[id];
                
                if (!userData.dashboardWidgets) userData.dashboardWidgets = {};
                
                const widgetId = 'widget_' + Date.now();
                userData.dashboardWidgets[widgetId] = {
                    type: 'link',
                    title: link.title,
                    url: link.url,
                    icon: link.icon,
                    description: link.description,
                    sourceId: id
                };
                
                showLocalizedToast('success', 'resources.addedToDashboard');
            }
        }
        
        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(userData);
        }
        updateDashboardButtonState(id, type);
        
        if (window.dashboardModule && window.dashboardModule.refreshDashboard) {
            window.dashboardModule.refreshDashboard();
        }
    }
    
    function updateDashboardButtonState(sourceId, type) {
        const button = document.querySelector(`[data-id="${sourceId}"].dashboard`);
        if (!button) return;
        
        const isInDash = isInDashboard(sourceId, type);
        
        const addToDashboardText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('resources.addToDashboard') : 
            'Add to Dashboard';
        const removeFromDashboardText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('resources.removeFromDashboard') : 
            'Remove from Dashboard';
        
        if (isInDash) {
            button.classList.add('active');
            button.title = removeFromDashboardText;
            button.innerHTML = '<i class="fas fa-clipboard-check"></i>';
        } else {
            button.classList.remove('active');
            button.title = addToDashboardText;
            button.innerHTML = '<i class="fas fa-clipboard"></i>';
        }
    }
    
    function populateCoverLetters() {
        const grid = document.getElementById('cover-letters-grid');
        if (!grid) return;
        
        try {
            const localData = localStorage.getItem('myJobBuddyData');
            if (localData) {
                const parsed = JSON.parse(localData);
                if (parsed && parsed.coverLetters) {
                    userData.coverLetters = parsed.coverLetters;
                }
            }
        } catch (e) {
            console.error("Error reloading from localStorage:", e);
        }
        
        const coverLetters = Object.entries(userData.coverLetters || {})
            .map(([id, letter]) => ({ id, ...letter }));
        
        let orderedLetters = [...coverLetters];
        
        if (userData.coverLetterOrder && userData.coverLetterOrder.length > 0) {
            const orderMap = new Map();
            userData.coverLetterOrder.forEach((id, index) => {
                orderMap.set(id, index);
            });
            
            orderedLetters.sort((a, b) => {
                const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
                const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
                return orderA - orderB;
            });
        }
        
        const addButton = document.getElementById('add-cover-letter');
        if (!addButton) return;
        
        while (grid.firstChild) {
            grid.removeChild(grid.firstChild);
        }
        grid.appendChild(addButton);
        
        const clickToCopyText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('resources.clickToCopyText') : 
            'Click to copy text';
        const editText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('common.edit') : 
            'Edit';
        
        orderedLetters.forEach(letter => {
            const item = document.createElement('div');
            item.className = 'resource-item';
            item.setAttribute('data-id', letter.id);
            
            const isInDash = isInDashboard(letter.id, 'coverLetter');
            const dashboardClass = isInDash ? 'active' : '';
            const dashboardIcon = isInDash ? 'clipboard-check' : 'clipboard';
            const dashboardTitle = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate(isInDash ? 'resources.removeFromDashboard' : 'resources.addToDashboard') : 
                (isInDash ? 'Remove from Dashboard' : 'Add to Dashboard');
            
            item.innerHTML = `
                <div class="resource-icon">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div class="resource-title">${letter.title}</div>
                
                <div class="resource-copy" data-content="${encodeURIComponent(letter.content)}">${clickToCopyText}</div>
                
                <div class="resource-content"></div>
                
                <div class="resource-actions">
                    <div class="resource-action-left">
                        <button class="btn-resource dashboard ${dashboardClass}" title="${dashboardTitle}" data-id="${letter.id}">
                            <i class="fas fa-${dashboardIcon}"></i>
                        </button>
                    </div>
                    <div class="resource-action-right">
                        <button class="btn-resource edit" title="${editText}" data-id="${letter.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </div>
            `;
            
            grid.insertBefore(item, addButton);
            
            item.querySelector('.resource-copy').addEventListener('click', e => {
                e.stopPropagation();
                copyToClipboard(decodeURIComponent(e.currentTarget.getAttribute('data-content')));
            });
            
            item.querySelector('.btn-resource.dashboard').addEventListener('click', e => {
                e.stopPropagation();
                toggleDashboardItem(letter.id, 'coverLetter');
            });
            
            item.querySelector('.btn-resource.edit').addEventListener('click', e => {
                e.stopPropagation();
                openModal('add-cover-letter-modal', letter.id);
            });
        });
    }

    function populateLinks() {
        const grid = document.getElementById('links-grid');
        if (!grid) return;
        
        try {
            const localData = localStorage.getItem('myJobBuddyData');
            if (localData) {
                const parsed = JSON.parse(localData);
                if (parsed && parsed.links) {
                    userData.links = parsed.links;
                }
            }
        } catch (e) {
            console.error("Error reloading from localStorage:", e);
        }
        
        const links = Object.entries(userData.links || {})
            .map(([id, link]) => ({ id, ...link }));
        
        let orderedLinks = [...links];
        
        if (userData.linkOrder && userData.linkOrder.length > 0) {
            const orderMap = new Map();
            userData.linkOrder.forEach((id, index) => {
                orderMap.set(id, index);
            });
            
            orderedLinks.sort((a, b) => {
                const orderA = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
                const orderB = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
                return orderA - orderB;
            });
        }
        
        const addButton = document.getElementById('add-link');
        if (!addButton) return;
        
        while (grid.firstChild) {
            grid.removeChild(grid.firstChild);
        }
        grid.appendChild(addButton);
        
        const clickToCopyUrlText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('resources.clickToCopyUrl') : 
            'Click to copy URL';
        const editText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('common.edit') : 
            'Edit';
        
        orderedLinks.forEach(link => {
            const item = document.createElement('div');
            item.className = 'resource-item';
            item.setAttribute('data-id', link.id);
            
            const isInDash = isInDashboard(link.id, 'link');
            const dashboardClass = isInDash ? 'active' : '';
            const dashboardIcon = isInDash ? 'clipboard-check' : 'clipboard';
            const dashboardTitle = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate(isInDash ? 'resources.removeFromDashboard' : 'resources.addToDashboard') : 
                (isInDash ? 'Remove from Dashboard' : 'Add to Dashboard');
            
            item.innerHTML = `
                <div class="resource-icon">
                    <i class="${link.icon || 'fas fa-link'}"></i>
                </div>
                <div class="resource-title">${link.title}</div>
                
                <div class="resource-copy" data-url="${link.url}">${clickToCopyUrlText}</div>
                
                <div class="resource-content"></div>
                
                <div class="resource-actions">
                    <div class="resource-action-left">
                        <button class="btn-resource dashboard ${dashboardClass}" title="${dashboardTitle}" data-id="${link.id}">
                            <i class="fas fa-${dashboardIcon}"></i>
                        </button>
                    </div>
                    <div class="resource-action-right">
                        <button class="btn-resource edit" title="${editText}" data-id="${link.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </div>
            `;
            
            grid.insertBefore(item, addButton);
            
            item.querySelector('.resource-copy').addEventListener('click', e => {
                e.stopPropagation();
                copyToClipboard(link.url);
            });
            
            item.querySelector('.btn-resource.dashboard').addEventListener('click', e => {
                e.stopPropagation();
                toggleDashboardItem(link.id, 'link');
            });
            
            item.querySelector('.btn-resource.edit').addEventListener('click', e => {
                e.stopPropagation();
                openModal('add-link-modal', link.id);
            });
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initResources);
    } else {
        initResources();
    }
    
    window.resourcesModule = {
        populateCoverLetters,
        populateLinks,
        toggleEditMode,
        isInDashboard,
        toggleDashboardItem
    };
})();