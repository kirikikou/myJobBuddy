(function() {
    let currentEditingId = null;
    
    function initLinktree() {
        if (!window.userData) {
            console.log('userData not ready, retrying...');
            setTimeout(initLinktree, 100);
            return;
        }
        
        initializeLinktreeData();
        setupEventListeners();
        updateAllPreviews();
        initializeComponentI18n();
    }

    function initializeComponentI18n() {
        if (window.uiManager && window.uiManager.isInitialized) {
            window.uiManager.translatePage();
            window.uiManager.onLanguageChange(() => {
                setTimeout(() => {
                    window.uiManager.translatePage();
                    updateAllPreviews();
                }, 100);
            });
        }
    }
    
    function showLocalizedToast(type, messageKey, params = {}) {
        const message = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate(messageKey, params) : 
            messageKey;
        showToast(type, message);
    }

    function initializeLinktreeData() {
        if (!userData.linktrees || Object.keys(userData.linktrees).length === 0) {
            userData.linktrees = {
                1: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', email: '', links: [] },
                2: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', email: '', links: [] },
                3: { active: false, firstName: '', lastName: '', header: '', jobTitles: '', email: '', links: [] }
            };
            if (window.saveUserData) {
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
            }
        }
    }
    
    function setupEventListeners() {
        const previewAllBtn = document.getElementById('preview-all-btn');
        if (previewAllBtn) {
            previewAllBtn.addEventListener('click', previewAllLinktrees);
        }
        
        for (let i = 1; i <= 3; i++) {
            const editBtn = document.getElementById(`edit-${i}`);
            const previewBtn = document.getElementById(`preview-${i}-btn`);
            const copyBtn = document.getElementById(`copy-${i}`);
            
            if (editBtn) {
                editBtn.addEventListener('click', () => editLinktree(i));
            }
            if (previewBtn) {
                previewBtn.addEventListener('click', () => previewLinktree(i));
            }
            if (copyBtn) {
                copyBtn.addEventListener('click', () => copyLinktreeLink(i));
            }
        }
        
        const closeEditModalBtn = document.getElementById('close-edit-modal');
        const cancelEditBtn = document.getElementById('cancel-edit');
        const saveLinktreeBtn = document.getElementById('save-linktree');
        const clearLinktreeBtn = document.getElementById('clear-linktree');
        const addLinkBtn = document.getElementById('add-link-btn');

        if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModalHandler);
        if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModalHandler);
        if (saveLinktreeBtn) saveLinktreeBtn.addEventListener('click', saveLinktreeData);
        if (clearLinktreeBtn) clearLinktreeBtn.addEventListener('click', openClearConfirmModal);
        if (addLinkBtn) addLinkBtn.addEventListener('click', addLinkField);

        const closePreviewModal = document.getElementById('close-preview-modal');
        const closePreview = document.getElementById('close-preview');
        const openInTab = document.getElementById('open-in-tab');
        
        if (closePreviewModal) closePreviewModal.addEventListener('click', closePreviewModalHandler);
        if (closePreview) closePreview.addEventListener('click', closePreviewModalHandler);
        if (openInTab) openInTab.addEventListener('click', openPreviewInTab);
        
        setupClearConfirmModal();
        
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('remove-link')) {
                e.target.closest('.link-item').remove();
            }
        });
    }
    
    function setupClearConfirmModal() {
        const modal = document.getElementById('clear-linktree-confirm-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-clear-linktree-confirm-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-clear-linktree-confirmation');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const confirmBtn = document.getElementById('confirm-clear-linktree');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                performClearLinktree();
                modal.classList.remove('show');
            });
        }
    }
    
    function openClearConfirmModal() {
        if (!currentEditingId) return;
        
        const modal = document.getElementById('clear-linktree-confirm-modal');
        if (modal) {
            modal.classList.add('show');
        }
    }
    
    function performClearLinktree() {
        if (!currentEditingId) return;
        
        if (!userData.linktrees) {
            initializeLinktreeData();
        }
        
        userData.linktrees[currentEditingId] = {
            active: false,
            firstName: '',
            lastName: '',
            header: '',
            jobTitles: '',
            email: '',
            links: []
        };
        
        if (window.saveUserData) {
            if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        }
        
        updateAllPreviews();
        closeEditModalHandler();
        
        showLocalizedToast('success', 'linktree.clearedSuccessfully', { treeId: currentEditingId });
    }
    
    function updateAllPreviews() {
        if (!userData || !userData.linktrees) return;
        
        for (let i = 1; i <= 3; i++) {
            updatePreview(i);
            updateStatus(i);
            updateCopyButton(i);
        }
    }
    
    function getOrdinalKey(num) {
        const ordinals = { 1: 'first', 2: 'second', 3: 'third' };
        return ordinals[num] || 'nth';
    }
    
    function updatePreview(treeId) {
        const preview = document.getElementById(`preview-${treeId}`);
        if (!preview || !userData.linktrees) return;
        
        const linktree = userData.linktrees[treeId];
        
        if (!linktree || (!linktree.firstName && !linktree.lastName && !linktree.header && (!linktree.links || linktree.links.length === 0))) {
            const ordinal = getOrdinalKey(treeId);
            const createText = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate(`linktree.create${ordinal.charAt(0).toUpperCase() + ordinal.slice(1)}Linktree`) : 
                `Create your ${ordinal} linktree`;
            
            preview.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-plus-circle"></i>
                    <p>${createText}</p>
                </div>
            `;
            return;
        }
        
        const fullName = `${linktree.firstName || ''} ${linktree.lastName || ''}`.trim();
        const jobTitlesArray = (linktree.jobTitles || '').split('|').map(t => t.trim()).filter(t => t);
        const hasRequiredData = linktree.firstName && linktree.lastName && linktree.links && linktree.links.length > 0;
        
        preview.innerHTML = `
            <div class="preview-content">
                ${fullName ? `
                    <div class="preview-name clickable-preview" data-tree-id="${treeId}" style="cursor: pointer; transition: all 0.3s ease;">
                        ${fullName}
                    </div>
                ` : ''}
                ${linktree.header ? `
                    <div class="preview-header clickable-preview" data-tree-id="${treeId}" style="cursor: pointer; transition: all 0.3s ease;">
                        ${linktree.header}
                    </div>
                ` : ''}
                ${jobTitlesArray.length > 0 ? `
                    <div class="preview-jobs">${jobTitlesArray.join(' | ')}</div>
                ` : ''}
                ${linktree.email ? `
                    <div class="preview-email">${linktree.email}</div>
                ` : ''}
                ${linktree.links && linktree.links.length > 0 ? `
                    <div class="preview-links">
                        ${linktree.links.slice(0, 6).map(link => `
                            <div class="preview-link" title="${link.title || ''}">
                                <i class="${link.icon || 'fas fa-globe'}"></i>
                            </div>
                        `).join('')}
                        ${linktree.links.length > 6 ? '<div class="preview-link"><i class="fas fa-ellipsis-h"></i></div>' : ''}
                    </div>
                ` : ''}
            </div>
        `;
        
        const clickableElements = preview.querySelectorAll('.clickable-preview');
        clickableElements.forEach(element => {
            element.addEventListener('click', function() {
                const treeId = this.getAttribute('data-tree-id');
                const linktree = userData.linktrees[treeId];
                const hasRequiredData = linktree && linktree.firstName && linktree.lastName && linktree.links && linktree.links.length > 0;
                
                if (hasRequiredData) {
                    const url = generateLinktreeUrl(treeId);
                    window.open(url, '_blank');
                } else {
                    showLocalizedToast('error', 'linktree.incompleteLinktree');
                }
            });
            
            element.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.05)';
                this.style.color = 'var(--primary)';
            });
            
            element.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
                this.style.color = '';
            });
        });
    }
    
    function updateStatus(treeId) {
        const statusEl = document.getElementById(`status-${treeId}`);
        if (!statusEl || !userData.linktrees) return;
        
        const linktree = userData.linktrees[treeId];
        const isActive = linktree && linktree.firstName && linktree.lastName && linktree.links && linktree.links.length > 0;
        
        if (linktree) {
            linktree.active = isActive;
        }
        
        const statusText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate(isActive ? 'linktree.active' : 'linktree.inactive') : 
            (isActive ? 'Active' : 'Inactive');
        
        statusEl.innerHTML = `<span class="status-badge ${isActive ? 'active' : 'inactive'}">${statusText}</span>`;
    }
    
    function updateCopyButton(treeId) {
        const copyBtn = document.getElementById(`copy-${treeId}`);
        if (!copyBtn || !userData.linktrees) return;
        
        const linktree = userData.linktrees[treeId];
        const isActive = linktree && linktree.active;
        
        if (isActive) {
            copyBtn.disabled = false;
            copyBtn.setAttribute('data-url', generateLinktreeUrl(treeId));
        } else {
            copyBtn.disabled = true;
            copyBtn.setAttribute('data-url', '');
        }
    }
    
    function generateLinktreeUrl(treeId) {
        if (!userData.linktrees || !userData.linktrees[treeId]) return '';
        
        const baseUrl = window.location.origin;
        const linktree = userData.linktrees[treeId];
        const slug = `${linktree.firstName || ''}-${linktree.lastName || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        return `${baseUrl}/linktree/${treeId}/${slug}`;
    }
    
    function editLinktree(treeId) {
        if (!userData.linktrees) {
            initializeLinktreeData();
        }
        
        currentEditingId = treeId;
        const linktree = userData.linktrees[treeId] || { firstName: '', lastName: '', header: '', jobTitles: '', email: '', links: [] };
        
        const firstNameInput = document.getElementById('first-name');
        const lastNameInput = document.getElementById('last-name');
        const headerInput = document.getElementById('header');
        const jobTitlesInput = document.getElementById('job-titles');
        const emailInput = document.getElementById('linktree-email');
        
        if (firstNameInput) firstNameInput.value = linktree.firstName || '';
        if (lastNameInput) lastNameInput.value = linktree.lastName || '';
        if (headerInput) headerInput.value = linktree.header || '';
        if (jobTitlesInput) jobTitlesInput.value = linktree.jobTitles || '';
        if (emailInput) emailInput.value = linktree.email || '';
        
        populateLinksContainer(linktree.links || []);
        
        const modalTitle = document.querySelector('#edit-linktree-modal .modal-title');
        if (modalTitle) {
            const titleText = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('linktree.editLinktreeNumber', { number: treeId }) : 
                `Edit Linktree #${treeId}`;
            modalTitle.textContent = titleText;
        }
        
        openModal('edit-linktree-modal');
    }
    
    function populateLinksContainer(links) {
        const container = document.getElementById('links-container');
        if (!container) return;
        
        container.innerHTML = '';
        
        links.forEach(link => {
            addLinkField(link);
        });
        
        if (links.length === 0) {
            addLinkField();
        }
    }
    
    function addLinkField(linkData = null) {
        const template = document.getElementById('link-template');
        const container = document.getElementById('links-container');
        
        if (!template || !container) return;
        
        const linkItem = template.firstElementChild.cloneNode(true);
        
        if (linkData) {
            const titleInput = linkItem.querySelector('.link-title');
            const urlInput = linkItem.querySelector('.link-url');
            const iconSelect = linkItem.querySelector('.link-icon');
            
            if (titleInput) titleInput.value = linkData.title || '';
            if (urlInput) urlInput.value = linkData.url || '';
            if (iconSelect) iconSelect.value = linkData.icon || 'fas fa-globe';
        }
        
        const iconSelect = linkItem.querySelector('.link-icon');
        if (iconSelect) {
            iconSelect.addEventListener('change', function() {
                const previewIcon = linkItem.querySelector('.icon-preview');
                if (previewIcon) {
                    previewIcon.className = `icon-preview ${this.value}`;
                }
            });
            
            iconSelect.dispatchEvent(new Event('change'));
        }
        
        container.appendChild(linkItem);
    }
    
    function saveLinktreeData() {
        if (!currentEditingId) return;
        
        const firstName = document.getElementById('first-name')?.value.trim() || '';
        const lastName = document.getElementById('last-name')?.value.trim() || '';
        const header = document.getElementById('header')?.value.trim() || '';
        const jobTitles = document.getElementById('job-titles')?.value.trim() || '';
        const email = document.getElementById('linktree-email')?.value.trim() || '';
        
        const linkItems = document.querySelectorAll('#links-container .link-item');
        const links = [];
        
        linkItems.forEach(item => {
            const title = item.querySelector('.link-title')?.value.trim() || '';
            const url = item.querySelector('.link-url')?.value.trim() || '';
            const icon = item.querySelector('.link-icon')?.value || 'fas fa-globe';
            
            if (title && url) {
                try {
                    new URL(url);
                    links.push({ title, url, icon });
                } catch (e) {
                    showLocalizedToast('error', 'linktree.invalidUrl', { url });
                    return;
                }
            }
        });
        
        if (!userData.linktrees) {
            initializeLinktreeData();
        }
        
        userData.linktrees[currentEditingId] = {
            firstName,
            lastName,
            header,
            jobTitles,
            email,
            links,
            active: false
        };
        
        if (window.saveUserData) {
            if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        }
        
        updateAllPreviews();
        closeEditModalHandler();
        
        showLocalizedToast('success', 'linktree.savedSuccessfully', { treeId: currentEditingId });
    }
    
    function previewLinktree(treeId) {
        if (!userData.linktrees || !userData.linktrees[treeId]) return;
        
        const linktree = userData.linktrees[treeId];
        
        if (!linktree.active) {
            showLocalizedToast('error', 'linktree.notActiveError');
            return;
        }
        
        const previewContainer = document.getElementById('preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = generateLinktreeHTML(linktree, true);
        }
        
        const modalTitle = document.querySelector('#preview-modal .modal-title');
        if (modalTitle) {
            const titleText = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('linktree.previewTitle', { number: treeId }) : 
                `Linktree #${treeId} Preview`;
            modalTitle.textContent = titleText;
        }
        
        openModal('preview-modal');
    }
    
    function previewAllLinktrees() {
        if (!userData.linktrees) return;
        
        const activeLinktrees = Object.entries(userData.linktrees).filter(([id, tree]) => tree && tree.active);
        
        if (activeLinktrees.length === 0) {
            showLocalizedToast('info', 'linktree.noActiveLinktrees');
            return;
        }
        
        let previewHTML = '<div style="display: grid; gap: 20px;">';
        
        activeLinktrees.forEach(([id, tree]) => {
            const linktreeTitle = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('linktree.linktreeNumber', { number: id }) : 
                `Linktree #${id}`;
            
            previewHTML += `
                <div style="border: 1px solid var(--border-color); border-radius: var(--radius); padding: 20px;">
                    <h4 style="margin-bottom: 15px; color: var(--primary);">${linktreeTitle}</h4>
                    ${generateLinktreeHTML(tree, true)}
                </div>
            `;
        });
        
        previewHTML += '</div>';
        
        const previewContainer = document.getElementById('preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = previewHTML;
        }
        
        const modalTitle = document.querySelector('#preview-modal .modal-title');
        if (modalTitle) {
            const titleText = window.uiManager && window.uiManager.translate ? 
                window.uiManager.translate('linktree.allActiveLinktrees') : 
                'All Active Linktrees';
            modalTitle.textContent = titleText;
        }
        
        openModal('preview-modal');
    }
    
    function generateLinksGrid(links, isCompact = false) {
        if (!links || links.length === 0) return '';
        
        const linkSize = isCompact ? '70px' : '120px';
        const fontSize = isCompact ? '1.4rem' : '2.25rem';
        const gap = isCompact ? '18px' : '30px';
        
        const createLinkHTML = (link) => `
            <a href="${link.url}" target="_blank" class="link-sphere" style="
                width: ${linkSize};
                height: ${linkSize};
                border-radius: 50%;
                background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1));
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                text-decoration: none;
                font-size: ${fontSize};
                transition: all 0.3s ease;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3);
                position: relative;
                overflow: hidden;
                text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
            " 
            onmouseover="this.style.transform='translateY(-10px) scale(1.1)'; this.style.boxShadow='0 20px 40px rgba(0,0,0,0.5), 0 8px 20px rgba(0,0,0,0.4)'; this.style.background='linear-gradient(135deg, rgba(255,255,255,0.3), rgba(255,255,255,0.2))';"
            onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)'; this.style.background='linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))';"
            title="${link.title}">
                <i class="${link.icon}"></i>
            </a>
        `;
        
        let gridHTML = '';
        
        if (links.length <= 4) {
            gridHTML = `
                <div style="
                    display: grid;
                    grid-template-columns: repeat(${links.length}, 1fr);
                    gap: ${gap};
                    justify-items: center;
                    margin-bottom: 30px;
                    max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                    margin-left: auto;
                    margin-right: auto;
                ">
                    ${links.map(createLinkHTML).join('')}
                </div>
            `;
        } else if (links.length <= 8) {
            const firstRow = links.slice(0, 4);
            const secondRow = links.slice(4, 8);
            
            gridHTML = `
                <div style="margin-bottom: 30px;">
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: ${gap};
                        justify-items: center;
                        margin-bottom: ${gap};
                        max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        ${firstRow.map(createLinkHTML).join('')}
                    </div>
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(${secondRow.length}, 1fr);
                        gap: ${gap};
                        justify-items: center;
                        max-width: ${parseInt(linkSize) * secondRow.length + parseInt(gap) * (secondRow.length - 1)}px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        ${secondRow.map(createLinkHTML).join('')}
                    </div>
                </div>
            `;
        } else {
            const firstRow = links.slice(0, 4);
            const secondRow = links.slice(4, 8);
            const thirdRow = links.slice(8, 10);
            
            gridHTML = `
                <div style="margin-bottom: 30px;">
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: ${gap};
                        justify-items: center;
                        margin-bottom: ${gap};
                        max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        ${firstRow.map(createLinkHTML).join('')}
                    </div>
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: ${gap};
                        justify-items: center;
                        margin-bottom: ${gap};
                        max-width: ${parseInt(linkSize) * 4 + parseInt(gap) * 3}px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        ${secondRow.map(createLinkHTML).join('')}
                    </div>
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(${thirdRow.length}, 1fr);
                        gap: ${gap};
                        justify-items: center;
                        max-width: ${parseInt(linkSize) * thirdRow.length + parseInt(gap) * (thirdRow.length - 1)}px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        ${thirdRow.map(createLinkHTML).join('')}
                    </div>
                </div>
            `;
        }
        
        return gridHTML;
    }
    
    function generateLinktreeHTML(linktree, isCompact = false) {
        const fullName = `${linktree.firstName || ''} ${linktree.lastName || ''}`.trim();
        const jobTitlesArray = (linktree.jobTitles || '').split('|').map(t => t.trim()).filter(t => t);
        
        const poweredByText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('linktree.poweredBy') : 'Powered by';
        const taglineText = window.uiManager && window.uiManager.translate ? 
            window.uiManager.translate('linktree.tagline') : 'Professional networking made simple';
        
        return `
            <div class="linktree-page-container" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: ${isCompact ? '400px' : '100vh'};
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                overflow: hidden;
                padding: 20px;
            ">
                <div class="sphere sphere-1" style="
                    position: absolute;
                    width: 200px;
                    height: 200px;
                    border-radius: 50%;
                    background: linear-gradient(45deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
                    top: 10%;
                    left: 10%;
                    animation: float 6s ease-in-out infinite;
                "></div>
                <div class="sphere sphere-2" style="
                    position: absolute;
                    width: 150px;
                    height: 150px;
                    border-radius: 50%;
                    background: linear-gradient(45deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
                    top: 60%;
                    right: 15%;
                    animation: float 8s ease-in-out infinite reverse;
                "></div>
                <div class="sphere sphere-3" style="
                    position: absolute;
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    background: linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
                    bottom: 20%;
                    left: 20%;
                    animation: float 4s ease-in-out infinite;
                "></div>
                
                <div class="linktree-content" style="
                    text-align: center;
                    z-index: 2;
                    max-width: 500px;
                    width: 100%;
                ">
                    ${fullName ? `
                        <h1 style="
                            color: white;
                            font-size: ${isCompact ? '1.8rem' : '2.5rem'};
                            margin-bottom: 10px;
                            text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.4);
                            font-weight: 600;
                        ">${fullName}</h1>
                    ` : ''}
                    
                    ${linktree.header ? `
                        <p style="
                            color: rgba(255,255,255,0.9);
                            font-size: ${isCompact ? '1.1rem' : '1.2rem'};
                            margin-bottom: 10px;
                            text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                        ">${linktree.header}</p>
                    ` : ''}
                    
                    ${jobTitlesArray.length > 0 ? `
                        <p style="
                            color: rgba(255,255,255,0.8);
                            font-size: ${isCompact ? '0.95rem' : '1rem'};
                            margin-bottom: ${linktree.email ? '10px' : '30px'};
                            text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                        ">${jobTitlesArray.join(' | ')}</p>
                    ` : ''}
                    
                    ${linktree.email ? `
                        <p style="
                            color: rgba(255,255,255,0.8);
                            font-size: ${isCompact ? '0.95rem' : '1rem'};
                            margin-bottom: 30px;
                            text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                        ">
                            <a href="mailto:${linktree.email}" style="
                                color: rgba(255,255,255,0.8);
                                text-decoration: none;
                                transition: color 0.3s ease;
                                text-shadow: 0 2px 4px rgba(0,0,0,0.6), 0 4px 8px rgba(0,0,0,0.4);
                            " onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.8)'">${linktree.email}</a>
                        </p>
                    ` : ''}
                    
                    ${generateLinksGrid(linktree.links, isCompact)}
                    
                    <div style="
                        margin-top: 40px;
                        padding-top: 20px;
                        border-top: 1px solid rgba(255,255,255,0.2);
                        color: rgba(255,255,255,0.6);
                        font-size: 0.8rem;
                        text-shadow: 0 1px 3px rgba(0,0,0,0.6);
                    ">
                        <p>${poweredByText} <strong>myJobBuddy</strong></p>
                        <p style="margin-top: 5px;">${taglineText}</p>
                    </div>
                </div>
            </div>
            
            <style>
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(180deg); }
                }
                
                .link-sphere::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    border-radius: 50%;
                    background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                }
                
                .link-sphere:hover::before {
                    opacity: 1;
                }
            </style>
        `;
    }
    
    function copyLinktreeLink(treeId) {
        const url = generateLinktreeUrl(treeId);
        
        navigator.clipboard.writeText(url)
            .then(() => {
                showLocalizedToast('success', 'linktree.urlCopiedSuccess');
            })
            .catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = url;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showLocalizedToast('success', 'linktree.urlCopiedSuccess');
            });
    }
    
    function openPreviewInTab() {
        const previewModal = document.getElementById('preview-modal');
        
        let treeId = null;
        if (currentEditingId) {
            treeId = currentEditingId;
        } else if (previewModal && previewModal.querySelector('.modal-title')) {
            const titleText = previewModal.querySelector('.modal-title').textContent;
            const match = titleText.match(/Linktree #(\d+)/);
            if (match) {
                treeId = match[1];
            }
        }
        
        if (!treeId) {
            showLocalizedToast('error', 'linktree.cannotDetermineLinktree');
            return;
        }
        
        const linktree = userData.linktrees[treeId];
        const hasRequiredData = linktree && linktree.firstName && linktree.lastName && linktree.links && linktree.links.length > 0;
        
        if (!hasRequiredData) {
            showLocalizedToast('error', 'linktree.incompleteLinktree');
            return;
        }
        
        const url = generateLinktreeUrl(treeId);
        window.open(url, '_blank');
    }
    
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            document.body.classList.add('modal-open');
            modal.classList.add('show');
        }
    }
    
    function closeEditModalHandler() {
        document.body.classList.remove('modal-open');
        const modal = document.getElementById('edit-linktree-modal');
        if (modal) modal.classList.remove('show');
        currentEditingId = null;
    }
    
    function closePreviewModalHandler() {
        document.body.classList.remove('modal-open');
        const modal = document.getElementById('preview-modal');
        if (modal) modal.classList.remove('show');
    }
    
    function showToast(type, message) {
        if (window.showToast) {
            window.showToast(type, message);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }
    
    window.getComponentData = function() {
        return {
            linktrees: userData ? userData.linktrees : {}
        };
    };

    window.setComponentData = function(data) {
        if (data.linktrees && userData) {
            userData.linktrees = data.linktrees;
            updateAllPreviews();
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLinktree);
    } else {
        initLinktree();
    }
    
    window.linktreeModule = {
        updateAllPreviews,
        generateLinktreeUrl
    };
})();