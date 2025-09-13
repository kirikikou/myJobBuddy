(function() {
    if (window.__MODALS_READY__) return;
    window.__MODALS_READY__ = true;
    
    function initModals() {
        setupEventListeners();
    }

    function setupEventListeners() {
        setupAddCompanyModal();
        setupAddApplicationModal();
        setupEditCompanyModal();
        setupDeleteConfirmationModal();
        setupExportModal();
        setupImportModal();
        setupAddCoverLetterModal();
        setupViewCoverLetterModal();
        setupEditCoverLetterModal();
        setupAddCommentsModal();
        setupAddLinkModal();
        setupEditLinkModal();
        setupResetConfirmModal();
        setupClearAllDatesModal();
        setupClearSelectedDatesModal();
        setupClearAllFavoritesModal();
        setupClearSelectedFavoritesModal();
        setupClearAllCompaniesModal();
        setupDeleteSelectedModal();
    }

    function setupAddCompanyModal() {
        const modal = document.getElementById('add-company-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-add-company-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-add-company');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const saveBtn = document.getElementById('save-new-company');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const name = document.getElementById('new-company-name').value.trim();
                
                if (!name) {
                    showToast('error', 'Company name is required');
                    return;
                }
                
                const companyId = generateId(name);
                
                const company = {
                    name,
                    type: document.getElementById('new-company-type').value,
                    location: document.getElementById('new-company-location').value.trim(),
                    website: document.getElementById('new-company-website').value.trim(),
                    linkedin: document.getElementById('new-company-linkedin').value.trim(),
                    career: document.getElementById('new-company-career').value.trim(),
                    email: document.getElementById('new-company-email').value.trim(),
                    appliedDate: document.getElementById('new-company-date').value,
                    comments: document.getElementById('new-company-comments').value.trim(),
                    favorite: document.getElementById('new-company-favorite').checked
                };
                
                userData.companies[companyId] = company;
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                    window.applicationsModule.populateCompaniesTable();
                }
                
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
                showToast('success', 'Company added successfully');
            });
        }
    }

    function setupAddApplicationModal() {
        const modal = document.getElementById('add-application-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-add-application-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-add-application');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const saveBtn = document.getElementById('save-application');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const companyName = document.getElementById('application-company-name').value.trim();
                const appliedDate = document.getElementById('application-date').value;
                const email = document.getElementById('application-email').value.trim();
                const comments = document.getElementById('application-comments').value.trim();
                const location = document.getElementById('application-location').value;
                const website = document.getElementById('application-website').value;
                const career = document.getElementById('application-career').value;
                
                if (!companyName) {
                    showToast('error', 'Company name is required');
                    return;
                }
                
                if (!appliedDate) {
                    showToast('error', 'Applied date is required');
                    return;
                }
                
                const companyId = generateId(companyName);
                
                if (!userData.companies[companyId]) {
                    userData.companies[companyId] = {};
                }
                
                userData.companies[companyId].name = companyName;
                userData.companies[companyId].location = location;
                userData.companies[companyId].website = website;
                userData.companies[companyId].career = career;
                userData.companies[companyId].type = 'VFX';
                userData.companies[companyId].appliedDate = appliedDate;
                userData.companies[companyId].email = email;
                userData.companies[companyId].comments = comments;
                
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                    window.applicationsModule.populateCompaniesTable();
                }
                
                if (window.dashboardModule && window.dashboardModule.updateDashboard) {
                    window.dashboardModule.updateDashboard();
                }
                
                modal.classList.remove('show');
                showToast('success', 'Application added successfully');
                
                setTimeout(() => {
                    const applicationTab = document.querySelector('.nav-item[data-page="applications"]');
                    if (applicationTab) applicationTab.click();
                }, 500);
            });
        }
    }

    function setupEditCompanyModal() {
        const modal = document.getElementById('edit-company-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-edit-company-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-edit-company');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const deleteBtn = document.getElementById('delete-company');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                const companyId = document.getElementById('edit-company-id').value;
                const companyName = document.getElementById('edit-company-name').value.trim();
                
                if (!companyId) {
                    showToast('error', 'Company ID not found');
                    return;
                }
                
                openDeleteConfirmationModal(companyId, companyName);
            });
        }
        
        const saveBtn = document.getElementById('save-edit-company');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const companyId = document.getElementById('edit-company-id').value;
                const name = document.getElementById('edit-company-name').value.trim();
                
                if (!name) {
                    showToast('error', 'Company name is required');
                    return;
                }
                
                userData.companies[companyId] = {
                    name,
                    type: document.getElementById('edit-company-type').value,
                    location: document.getElementById('edit-company-location').value.trim(),
                    website: document.getElementById('edit-company-website').value.trim(),
                    linkedin: document.getElementById('edit-company-linkedin').value.trim(),
                    career: document.getElementById('edit-company-career').value.trim(),
                    email: document.getElementById('edit-company-email').value.trim(),
                    appliedDate: document.getElementById('edit-company-date').value,
                    comments: document.getElementById('edit-company-comments').value.trim(),
                    favorite: document.getElementById('edit-company-favorite').checked
                };
                
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                    window.applicationsModule.populateCompaniesTable();
                }
                
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
                showToast('success', 'Company updated successfully');
            });
        }
    }

    function setupAddCommentsModal() {
        const modal = document.getElementById('add-comments-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-add-comments-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-add-comments');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const saveBtn = document.getElementById('save-comments');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const companyId = document.getElementById('comments-company-id').value;
                const title = document.getElementById('comments-title').value.trim();
                const content = document.getElementById('comments-content').value.trim();
                
                if (!companyId) {
                    showToast('error', 'Company ID not found');
                    return;
                }
                
                if (!title && !content) {
                    userData.companies[companyId].comments = null;
                } else if (!title) {
                    userData.companies[companyId].comments = content;
                } else {
                    userData.companies[companyId].comments = { title, content };
                }
                
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                    window.applicationsModule.populateCompaniesTable();
                }
                
                modal.classList.remove('show');
                showToast('success', 'Comments saved successfully');
                
                const modalTitle = modal.querySelector('.modal-title');
                if (modalTitle) modalTitle.textContent = 'Add Comments';
                
                saveBtn.textContent = 'Save Comments';
            });
        }
    }

    function setupExportModal() {
        const modal = document.getElementById('export-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-export-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const closeExportBtn = document.getElementById('close-export');
        if (closeExportBtn) {
            closeExportBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const copyExportDataBtn = document.getElementById('copy-export-data');
        if (copyExportDataBtn) {
            copyExportDataBtn.addEventListener('click', function() {
                const exportData = document.getElementById('export-data');
                if (exportData) {
                    exportData.select();
                    document.execCommand('copy');
                    showToast('success', 'Data copied to clipboard');
                }
            });
        }
        
        const downloadExportDataBtn = document.getElementById('download-export-data');
        if (downloadExportDataBtn) {
            downloadExportDataBtn.addEventListener('click', function() {
                const exportData = document.getElementById('export-data');
                if (exportData) {
                    const blob = new Blob([exportData.value], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `myJobBuddy_data_${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            });
        }
    }

    function setupImportModal() {
        console.log('Setting up import modal...');
        const modal = document.getElementById('import-modal');
        if (!modal) {
            console.error('Import modal not found');
            return;
        }
        
        let csvData = null;
        let columnMappings = {};
        let isProcessing = false;
        let isSetup = false;
        
        if (isSetup) return;
        isSetup = true;
        
        console.log('Import modal setup starting');
        
        function resetImportModal() {
            console.log('Resetting import modal');
            csvData = null;
            columnMappings = {};
            isProcessing = false;
            
            showUploadStep();
            
            const fileInput = document.getElementById('csv-file-input');
            const nextToMappingBtn = document.getElementById('next-to-mapping');
            
            if (fileInput) fileInput.value = '';
            if (nextToMappingBtn) {
                nextToMappingBtn.disabled = true;
                nextToMappingBtn.textContent = 'Next';
            }
            
            const containers = ['csv-preview-area', 'mapping-container', 'mapping-preview', 'import-preview'];
            containers.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.innerHTML = '';
            });
            
            delete window.importableData;
        }
        
        function showUploadStep() {
            const uploadStep = document.getElementById('upload-step');
            const mappingStep = document.getElementById('mapping-step');
            const previewStep = document.getElementById('preview-step');
            
            if (uploadStep) uploadStep.style.display = 'block';
            if (mappingStep) mappingStep.style.display = 'none';
            if (previewStep) previewStep.style.display = 'none';
        }
        
        function showMappingStep() {
            const uploadStep = document.getElementById('upload-step');
            const mappingStep = document.getElementById('mapping-step');
            const previewStep = document.getElementById('preview-step');
            
            if (uploadStep) uploadStep.style.display = 'none';
            if (mappingStep) mappingStep.style.display = 'block';
            if (previewStep) previewStep.style.display = 'none';
            
            createMappingInterface();
        }
        
        function showPreviewStep() {
            const uploadStep = document.getElementById('upload-step');
            const mappingStep = document.getElementById('mapping-step');
            const previewStep = document.getElementById('preview-step');
            
            if (uploadStep) uploadStep.style.display = 'none';
            if (mappingStep) mappingStep.style.display = 'none';
            if (previewStep) previewStep.style.display = 'block';
            
            generateImportPreview();
        }
        
        const closeBtn = document.getElementById('close-import-modal');
        if (closeBtn) {
            closeBtn.onclick = function() {
                console.log('Close import modal clicked');
                resetImportModal();
                modal.classList.remove('show');
            };
        }
        
        const cancelImportBtn = document.getElementById('cancel-import');
        if (cancelImportBtn) {
            cancelImportBtn.onclick = function() {
                console.log('Cancel import clicked');
                resetImportModal();
                modal.classList.remove('show');
            };
        }
        
        const uploadArea = document.getElementById('csv-upload-area');
        if (uploadArea) {
            uploadArea.onclick = function() {
                console.log('Upload area clicked');
                const fileInput = document.getElementById('csv-file-input');
                if (fileInput) fileInput.click();
            };
            
            uploadArea.ondragover = function(e) {
                e.preventDefault();
                this.classList.add('drag-over');
            };
            
            uploadArea.ondragleave = function(e) {
                e.preventDefault();
                this.classList.remove('drag-over');
            };
            
            uploadArea.ondrop = function(e) {
                e.preventDefault();
                this.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFileUpload(files[0]);
                }
            };
        }
        
        const fileInput = document.getElementById('csv-file-input');
        if (fileInput) {
            fileInput.onchange = function(e) {
                console.log('File input changed');
                if (e.target.files.length > 0) {
                    handleFileUpload(e.target.files[0]);
                }
            };
        }
        
        const nextToMappingBtn = document.getElementById('next-to-mapping');
        if (nextToMappingBtn) {
            nextToMappingBtn.onclick = function() {
                console.log('Next to mapping clicked');
                if (csvData && !isProcessing) {
                    showMappingStep();
                }
            };
        }
        
        const backToUploadBtn = document.getElementById('back-to-upload');
        if (backToUploadBtn) {
            backToUploadBtn.onclick = function() {
                if (!isProcessing) showUploadStep();
            };
        }
        
        const nextToPreviewBtn = document.getElementById('next-to-preview');
        if (nextToPreviewBtn) {
            nextToPreviewBtn.onclick = function() {
                if (validateMappings() && !isProcessing) {
                    showPreviewStep();
                }
            };
        }
        
        const backToMappingBtn = document.getElementById('back-to-mapping');
        if (backToMappingBtn) {
            backToMappingBtn.onclick = function() {
                if (!isProcessing) showMappingStep();
            };
        }
        
        const confirmImportBtn = document.getElementById('confirm-import');
        if (confirmImportBtn) {
            confirmImportBtn.onclick = function() {
                if (!isProcessing) performImport();
            };
        }
        
        function handleFileUpload(file) {
            console.log('Handling file upload:', file.name);
            
            if (isProcessing) {
                console.log('Already processing, ignoring');
                return;
            }
            
            if (!file.name.toLowerCase().endsWith('.csv')) {
                showToast('error', 'Please select a CSV file');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) {
                showToast('error', 'File too large. Maximum size is 5MB');
                return;
            }
            
            isProcessing = true;
            showToast('info', 'Reading file...');
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                console.log('File read successfully');
                try {
                    parseCsvData(e.target.result);
                } catch (error) {
                    console.error('Error parsing CSV:', error);
                    showToast('error', 'Error reading file');
                    isProcessing = false;
                }
            };
            
            reader.onerror = function() {
                console.error('File reader error');
                showToast('error', 'Error reading file');
                isProcessing = false;
            };
            
            reader.readAsText(file);
        }
        
        function parseCsvData(csvText) {
            console.log('Parsing CSV data...');
            
            try {
                const lines = csvText.split('\n').filter(line => line.trim());
                console.log('Total lines found:', lines.length);
                
                if (lines.length < 2) {
                    showToast('error', 'CSV file must have at least 2 rows (header + data)');
                    isProcessing = false;
                    return;
                }
                
                const headers = parseCSVLine(lines[0]);
                console.log('Headers:', headers);
                
                const allRows = [];
                for (let i = 1; i < lines.length; i++) {
                    const row = parseCSVLine(lines[i]);
                    if (row.length > 0 && row.some(cell => cell.trim())) {
                        while (row.length < headers.length) {
                            row.push('');
                        }
                        allRows.push(row.slice(0, headers.length));
                    }
                }
                
                const previewRows = allRows.slice(0, 5);
                
                csvData = {
                    headers: headers,
                    rows: previewRows,
                    allRows: allRows,
                    totalRows: allRows.length
                };
                
                console.log('CSV data parsed:', csvData.totalRows, 'total rows');
                
                displayCsvPreview();
                
                const nextBtn = document.getElementById('next-to-mapping');
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = `Next (${csvData.totalRows} rows detected)`;
                }
                
                isProcessing = false;
                showToast('success', `File loaded successfully - ${csvData.totalRows} rows found`);
                
            } catch (error) {
                console.error('CSV parsing error:', error);
                showToast('error', 'Error parsing CSV file');
                isProcessing = false;
            }
        }
        
        function handleImportSubmit() {
            const fileInput = document.getElementById('import-file');
            const file = fileInput.files[0];
            
            if (!file) {
                showToast('error', 'Please select a file');
                return;
            }
        
            if (!file.name.toLowerCase().endsWith('.csv')) {
                showToast('error', 'Please select a CSV file');
                return;
            }
        
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const csvContent = e.target.result;
                    parseCSVAndImport(csvContent);
                } catch (error) {
                    console.error('Error reading file:', error);
                    showToast('error', 'Error reading file');
                }
            };
            
            reader.readAsText(file);
        }
        
        function parseCSVAndImport(csvContent) {
            try {
                const lines = csvContent.split('\n').filter(line => line.trim());
                
                if (lines.length < 3) {
                    showToast('error', 'CSV file appears to be empty or invalid');
                    return;
                }
        
                let actualHeaderLine = -1;
                let actualDataStart = -1;
                
                for (let i = 0; i < Math.min(5, lines.length); i++) {
                    const line = lines[i];
                    if (line.includes('STUDIO NAME') && line.includes('LOCATION') && line.includes('LINK')) {
                        actualHeaderLine = i;
                        actualDataStart = i + 1;
                        break;
                    }
                }
                
                if (actualHeaderLine === -1) {
                    showToast('error', 'Could not find valid headers in CSV file');
                    return;
                }
                
                const headerCells = parseCSVLine(lines[actualHeaderLine]);
                const dataLines = lines.slice(actualDataStart);
                
                const studioNameIndex = findColumnIndex(headerCells, 'STUDIO NAME');
                const locationIndex = findColumnIndex(headerCells, 'LOCATION');
                const linkIndex = findColumnIndex(headerCells, 'LINK');
                const dateIndex = findColumnIndex(headerCells, 'DATE 01');
                const emailIndex = findColumnIndex(headerCells, 'MAIL');
                const themeIndex = findColumnIndex(headerCells, 'THEME');
                
                if (studioNameIndex === -1 || locationIndex === -1 || linkIndex === -1) {
                    showToast('error', 'Required columns not found in CSV');
                    return;
                }
                
                let importedCount = 0;
                let errorCount = 0;
                const errors = [];
                
                for (let i = 0; i < dataLines.length; i++) {
                    try {
                        const cells = parseCSVLine(dataLines[i]);
                        
                        if (cells.length < Math.max(studioNameIndex, locationIndex, linkIndex) + 1) {
                            continue;
                        }
                        
                        const studioName = cells[studioNameIndex]?.toString().trim();
                        if (!studioName || studioName.length < 2) {
                            continue;
                        }
                        
                        const companyId = generateId(studioName);
                        
                        if (userData.companies[companyId]) {
                            continue;
                        }
                        
                        const location = cells[locationIndex]?.toString().trim() || '';
                        const website = cells[linkIndex]?.toString().trim() || '';
                        const rawDate = cells[dateIndex]?.toString().trim() || '';
                        const email = cells[emailIndex]?.toString().trim() || '';
                        const theme = cells[themeIndex]?.toString().trim() || '';
                        
                        let appliedDate = '';
                        if (rawDate) {
                            const formattedDate = parseDate(rawDate);
                            if (formattedDate) {
                                appliedDate = formattedDate;
                            }
                        }
                        
                        const company = {
                            name: studioName,
                            location: location,
                            website: website,
                            linkedin: '',
                            email: email,
                            appliedDate: appliedDate,
                            comments: theme ? `Theme: ${theme}` : null,
                            favorite: false,
                            type: 'Company'
                        };
                        
                        userData.companies[companyId] = company;
                        importedCount++;
                        
                    } catch (error) {
                        errorCount++;
                        errors.push(`Line ${i + actualDataStart + 1}: ${error.message}`);
                        console.error(`Error processing line ${i}:`, error);
                    }
                }
                
                if (importedCount > 0) {
                    if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                    
                    if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                        window.applicationsModule.populateCompaniesTable();
                    }
                    
                    if (window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
                        window.companiesModule.populateFavoriteCompanies();
                    }
                    
                    if (window.dashboardModule && window.dashboardModule.updateDashboard) {
                        window.dashboardModule.updateDashboard();
                    }
                    
                    document.getElementById('import-modal').classList.remove('show');
                    
                    const message = errorCount > 0 
                        ? `${importedCount} companies imported successfully. ${errorCount} errors occurred.`
                        : `${importedCount} companies imported successfully!`;
                        
                    showToast('success', message);
                    
                    if (errors.length > 0 && errors.length <= 5) {
                        console.warn('Import errors:', errors);
                    }
                } else {
                    showToast('error', 'No valid companies found in CSV file');
                }
                
            } catch (error) {
                console.error('Error parsing CSV:', error);
                showToast('error', 'Error parsing CSV file: ' + error.message);
            }
        }
        
        function findColumnIndex(headers, columnName) {
            for (let i = 0; i < headers.length; i++) {
                if (headers[i] && headers[i].toString().trim().toUpperCase() === columnName.toUpperCase()) {
                    return i;
                }
            }
            return -1;
        }
        
        function parseCSVLine(line) {
            const cells = [];
            let currentCell = '';
            let inQuotes = false;
            let i = 0;
            
            while (i < line.length) {
                const char = line[i];
                
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        currentCell += '"';
                        i += 2;
                        continue;
                    }
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    cells.push(currentCell.trim());
                    currentCell = '';
                } else {
                    currentCell += char;
                }
                i++;
            }
            
            cells.push(currentCell.trim());
            return cells;
        }
        
        function parseDate(dateStr) {
            if (!dateStr || dateStr.trim() === '') return '';
            
            const trimmed = dateStr.trim();
            
            if (trimmed.includes('/')) {
                const parts = trimmed.split('/');
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10);
                    let year = parseInt(parts[2], 10);
                    
                    if (year < 100) {
                        year = year < 50 ? 2000 + year : 1900 + year;
                    }
                    
                    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
                        const date = new Date(year, month - 1, day);
                        if (!isNaN(date.getTime())) {
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(2, '0');
                            const dd = String(date.getDate()).padStart(2, '0');
                            return `${yyyy}-${mm}-${dd}`;
                        }
                    }
                }
            }
            
            const date = new Date(trimmed);
            if (!isNaN(date.getTime())) {
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
            
            return '';
        }
        
        function displayCsvPreview() {
            console.log('Displaying CSV preview');
            const previewArea = document.getElementById('csv-preview-area');
            if (!previewArea || !csvData) return;
            
            let html = '<div class="csv-preview-table-container">';
            html += '<table class="csv-preview-table">';
            html += '<thead><tr>';
            
            csvData.headers.forEach(header => {
                html += `<th>${escapeHtml(header)}</th>`;
            });
            html += '</tr></thead><tbody>';
            
            csvData.rows.forEach(row => {
                html += '<tr>';
                row.forEach(cell => {
                    html += `<td>${escapeHtml(cell || '')}</td>`;
                });
                html += '</tr>';
            });
            
            html += '</tbody></table></div>';
            html += `<p class="csv-info">Showing first 5 rows of ${csvData.totalRows} total rows</p>`;
            
            previewArea.innerHTML = html;
        }
        
        function createMappingInterface() {
            console.log('Creating mapping interface');
            const mappingContainer = document.getElementById('mapping-container');
            if (!mappingContainer || !csvData) return;
            
            const availableFields = {
                'name': 'Company Name',
                'location': 'Location', 
                'website': 'Website',
                'linkedin': 'LinkedIn',
                'email': 'Contact Email',
                'appliedDate': 'Applied Date',
                'comments': 'Comments'
            };
            
            const requiredFields = ['name'];
            
            let html = '<div class="mapping-instructions">';
            html += '<p>Map your CSV columns to application fields. Company Name is required.</p>';
            html += '</div>';
            
            html += '<div class="mapping-grid">';
            
            Object.entries(availableFields).forEach(([fieldKey, fieldLabel]) => {
                const isRequired = requiredFields.includes(fieldKey);
                html += '<div class="mapping-row">';
                html += `<div class="field-label ${isRequired ? 'required' : ''}">${fieldLabel}</div>`;
                html += '<div class="arrow">→</div>';
                html += '<div class="column-selector">';
                html += `<select class="form-control mapping-select" data-field="${fieldKey}">`;
                html += '<option value="">-- Select Column --</option>';
                
                csvData.headers.forEach((header, index) => {
                    const selected = autoDetectMapping(fieldKey, header) ? 'selected' : '';
                    html += `<option value="${index}" ${selected}>${escapeHtml(header)}</option>`;
                });
                
                html += '</select></div></div>';
            });
            
            html += '</div>';
            
            mappingContainer.innerHTML = html;
            
            const selects = mappingContainer.querySelectorAll('.mapping-select');
            selects.forEach(select => {
                select.onchange = function() {
                    const value = this.value;
                    columnMappings[this.getAttribute('data-field')] = value === '' ? undefined : parseInt(value);
                    updateMappingPreview();
                };
                
                if (select.value) {
                    const value = select.value;
                    columnMappings[select.getAttribute('data-field')] = value === '' ? undefined : parseInt(value);
                }
            });
            
            updateMappingPreview();
        }
        
        function autoDetectMapping(fieldKey, columnHeader) {
            const header = columnHeader.toLowerCase().trim();
            
            const patterns = {
                name: ['company', 'name', 'entreprise', 'nom'],
                location: ['location', 'lieu', 'ville', 'city'],
                website: ['website', 'site', 'web', 'url'],
                linkedin: ['linkedin', 'linked'],
                email: ['email', 'mail', 'contact'],
                appliedDate: ['date', 'applied', 'candidature'],
                comments: ['comment', 'note', 'remarque']
            };
            
            const fieldPatterns = patterns[fieldKey] || [];
            return fieldPatterns.some(pattern => header.includes(pattern));
        }
        
        function updateMappingPreview() {
            console.log('Updating mapping preview');
            const previewContainer = document.getElementById('mapping-preview');
            if (!previewContainer || !csvData) return;
            
            const validMappings = Object.entries(columnMappings).filter(([field, columnIndex]) => 
                columnIndex !== undefined && !isNaN(columnIndex) && columnIndex < csvData.headers.length
            );
            
            if (validMappings.length === 0) {
                previewContainer.innerHTML = '<p>No mappings selected</p>';
                return;
            }
            
            let html = '<div class="mapping-preview-title">Preview of mapped data:</div>';
            html += '<div class="mapping-preview-table-container">';
            html += '<table class="mapping-preview-table">';
            html += '<thead><tr>';
            
            validMappings.forEach(([field, columnIndex]) => {
                html += `<th>${field} ← ${escapeHtml(csvData.headers[columnIndex])}</th>`;
            });
            
            html += '</tr></thead><tbody>';
            
            for (let i = 0; i < Math.min(csvData.rows.length, 3); i++) {
                html += '<tr>';
                validMappings.forEach(([field, columnIndex]) => {
                    const value = csvData.rows[i][columnIndex] || '';
                    html += `<td>${escapeHtml(value)}</td>`;
                });
                html += '</tr>';
            }
            
            html += '</tbody></table></div>';
            previewContainer.innerHTML = html;
        }
        
        function validateMappings() {
            if (!columnMappings.name && columnMappings.name !== 0) {
                showToast('error', 'Company Name mapping is required');
                return false;
            }
            return true;
        }
        
        function generateImportPreview() {
            console.log('Generating import preview');
            const previewContainer = document.getElementById('import-preview');
            if (!previewContainer || !csvData) return;
            
            const importableRows = [];
            
            const rowsToProcess = csvData.allRows || csvData.rows;
            console.log('Processing', rowsToProcess.length, 'rows for import');
            
            for (let i = 0; i < rowsToProcess.length; i++) {
                const row = rowsToProcess[i];
                const company = {};
                
                Object.entries(columnMappings).forEach(([field, columnIndex]) => {
                    if (columnIndex !== undefined && !isNaN(columnIndex) && columnIndex < row.length) {
                        let value = row[columnIndex] || '';
                        
                        if (field === 'appliedDate' && value) {
                            value = formatDateInput(value);
                        }
                        
                        company[field] = value.toString().trim();
                    }
                });
                
                if (company.name && company.name.trim()) {
                    company.favorite = false;
                    company.type = 'VFX';
                    importableRows.push(company);
                }
            }
            
            console.log('Generated', importableRows.length, 'importable companies');
            
            let html = `<div class="import-summary">`;
            html += `<h4>Import Summary</h4>`;
            html += `<p>${importableRows.length} companies will be imported</p>`;
            html += `</div>`;
            
            html += '<div class="import-preview-table-container">';
            html += '<table class="import-preview-table">';
            html += '<thead><tr><th>Company</th><th>Location</th><th>Applied Date</th><th>Comments</th></tr></thead><tbody>';
            
            importableRows.slice(0, 10).forEach(company => {
                html += '<tr>';
                html += `<td>${escapeHtml(company.name || '')}</td>`;
                html += `<td>${escapeHtml(company.location || '')}</td>`;
                html += `<td>${escapeHtml(company.appliedDate || '')}</td>`;
                html += `<td>${escapeHtml(company.comments ? (company.comments.length > 50 ? company.comments.substring(0, 50) + '...' : company.comments) : '')}</td>`;
                html += '</tr>';
            });
            
            if (importableRows.length > 10) {
                html += `<tr><td colspan="4" style="text-align: center; font-style: italic;">... and ${importableRows.length - 10} more companies</td></tr>`;
            }
            
            html += '</tbody></table></div>';
            
            previewContainer.innerHTML = html;
            window.importableData = importableRows;
        }
        
        function formatDateInput(dateString) {
            if (!dateString) return '';
            
            const dateFormats = [
                /(\d{4})-(\d{1,2})-(\d{1,2})/,
                /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
                /(\d{1,2})\/(\d{1,2})\/(\d{2})/,
                /(\d{1,2})-(\d{1,2})-(\d{4})/,
                /(\d{1,2})\.(\d{1,2})\.(\d{4})/
            ];
            
            for (let pattern of dateFormats) {
                const match = dateString.match(pattern);
                if (match) {
                    if (pattern.source.includes('(\\d{4})')) {
                        if (dateString.includes('/')) {
                            const [, month, day, year] = match;
                            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        } else {
                            const [, year, month, day] = match;
                            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    } else {
                        const [, month, day, year] = match;
                        const fullYear = year.length === 2 ? `20${year}` : year;
                        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    }
                }
            }
            
            return '';
        }
        
        function performImport() {
            console.log('Performing import');
            
            if (!window.importableData || !Array.isArray(window.importableData)) {
                showToast('error', 'No data to import');
                return;
            }
            
            if (isProcessing) return;
            isProcessing = true;
            
            let importedCount = 0;
            let skippedCount = 0;
            
            try {
                window.importableData.forEach(company => {
                    if (!company.name || !company.name.trim()) {
                        skippedCount++;
                        return;
                    }
                    
                    const companyId = generateId(company.name);
                    
                    if (userData.companies[companyId]) {
                        skippedCount++;
                        return;
                    }
                    
                    userData.companies[companyId] = {
                        name: company.name.trim(),
                        location: company.location || '',
                        website: company.website || '',
                        linkedin: company.linkedin || '',
                        email: company.email || '',
                        appliedDate: company.appliedDate || '',
                        comments: company.comments || '',
                        favorite: false,
                        type: 'VFX'
                    };
                    
                    importedCount++;
                });
                
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                    window.applicationsModule.populateCompaniesTable();
                }
                
                if (window.companiesModule && window.companiesModule.populateFavoriteCompanies) {
                    window.companiesModule.populateFavoriteCompanies();
                }
                
                if (window.remindersModule && window.remindersModule.populateReminders) {
                    window.remindersModule.populateReminders();
                }
                
                if (window.dashboardModule && window.dashboardModule.updateDashboard) {
                    window.dashboardModule.updateDashboard();
                }
                
                resetImportModal();
                modal.classList.remove('show');
                
                showToast('success', `Import completed: ${importedCount} companies imported, ${skippedCount} skipped`);
                
                delete window.importableData;
                isProcessing = false;
                
            } catch (error) {
                console.error('Import error:', error);
                showToast('error', 'Error during import');
                isProcessing = false;
            }
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        console.log('Import modal setup complete');
    }
    
    function openImportModal() {
        console.log('Opening import modal...');
        const modal = document.getElementById('import-modal');
        if (modal) {
            console.log('Modal found, showing...');
            modal.classList.add('show');
        } else {
            console.error('Import modal not found!');
        }
    }

    function setupAddCoverLetterModal() {
        const modal = document.getElementById('add-cover-letter-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-add-cover-letter-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-add-cover-letter');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const saveBtn = document.getElementById('save-cover-letter');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const title = document.getElementById('cover-letter-title').value.trim();
                const content = document.getElementById('cover-letter-content').value.trim();
                
                if (!title) {
                    showToast('error', 'Title is required');
                    return;
                }
                
                if (!content) {
                    showToast('error', 'Content is required');
                    return;
                }
                
                const letterId = generateId(title);
                
                if (!userData.coverLetters) userData.coverLetters = {};
                userData.coverLetters[letterId] = { title, content };
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.resourcesModule && window.resourcesModule.populateCoverLetters) {
                    window.resourcesModule.populateCoverLetters();
                }
                
                modal.classList.remove('show');
                showToast('success', 'Cover letter saved successfully');
            });
        }
    }
    
    function setupEditCoverLetterModal() {
        const modal = document.getElementById('add-cover-letter-modal');
        if (!modal) return;
        
        const saveBtn = document.getElementById('save-cover-letter');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                if (!modal.hasAttribute('data-edit-id')) return;
                
                const letterId = modal.getAttribute('data-edit-id');
                const title = document.getElementById('cover-letter-title').value.trim();
                const content = document.getElementById('cover-letter-content').value.trim();
                
                if (!title) {
                    showToast('error', 'Title is required');
                    return;
                }
                
                if (!content) {
                    showToast('error', 'Content is required');
                    return;
                }
                
                if (!userData.coverLetters) userData.coverLetters = {};
                userData.coverLetters[letterId] = { title, content };
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.resourcesModule && window.resourcesModule.populateCoverLetters) {
                    window.resourcesModule.populateCoverLetters();
                }
                
                modal.removeAttribute('data-edit-id');
                
                const modalTitle = modal.querySelector('.modal-title');
                if (modalTitle) modalTitle.textContent = 'Add Cover Letter';
                
                saveBtn.textContent = 'Save Cover Letter';
                
                modal.classList.remove('show');
                showToast('success', 'Cover letter updated successfully');
            });
        }
    }

    function setupViewCoverLetterModal() {
        const modal = document.getElementById('view-cover-letter-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-view-cover-letter-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const closeCoverLetterBtn = document.getElementById('close-view-cover-letter');
        if (closeCoverLetterBtn) {
            closeCoverLetterBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const editCoverLetterBtn = document.getElementById('edit-cover-letter');
        if (editCoverLetterBtn) {
            editCoverLetterBtn.addEventListener('click', function() {
                const viewModal = document.getElementById('view-cover-letter-modal');
                const letterId = viewModal.getAttribute('data-letter-id');
                const letter = userData.coverLetters[letterId];
                
                if (!letter) {
                    showToast('error', 'Cover letter not found');
                    return;
                }
                
                viewModal.classList.remove('show');
                openEditCoverLetterModal(letterId);
            });
        }
        
        const copyCoverLetterBtn = document.getElementById('copy-cover-letter');
        if (copyCoverLetterBtn) {
            copyCoverLetterBtn.addEventListener('click', function() {
                const viewModal = document.getElementById('view-cover-letter-modal');
                const letterId = viewModal.getAttribute('data-letter-id');
                const letter = userData.coverLetters[letterId];
                
                if (!letter) {
                    showToast('error', 'Cover letter not found');
                    return;
                }
                
                navigator.clipboard.writeText(letter.content).then(() => {
                    showToast('success', 'Cover letter copied to clipboard');
                }).catch(err => {
                    console.error('Could not copy cover letter: ', err);
                    showToast('error', 'Failed to copy cover letter');
                });
            });
        }
    }

    function setupAddLinkModal() {
        const modal = document.getElementById('add-link-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-add-link-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-add-link');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const saveBtn = document.getElementById('save-link');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                const title = document.getElementById('link-title').value.trim();
                const url = document.getElementById('link-url').value.trim();
                const icon = document.getElementById('link-icon').value;
                const description = document.getElementById('link-description').value.trim();
                
                if (!title) {
                    showToast('error', 'Title is required');
                    return;
                }
                
                if (!url) {
                    showToast('error', 'URL is required');
                    return;
                }
                
                try {
                    new URL(url);
                } catch (error) {
                    showToast('error', 'Please enter a valid URL');
                    return;
                }
                
                const linkId = generateId(title);
                
                if (!userData.links) userData.links = {};
                userData.links[linkId] = { title, url, icon, description };
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.resourcesModule && window.resourcesModule.populateLinks) {
                    window.resourcesModule.populateLinks();
                }
                
                modal.classList.remove('show');
                showToast('success', 'Link saved successfully');
            });
        }
    }

    function setupEditLinkModal() {
        const modal = document.getElementById('add-link-modal');
        if (!modal) return;
        
        const saveBtn = document.getElementById('save-link');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                if (!modal.hasAttribute('data-edit-id')) return;
                
                const linkId = modal.getAttribute('data-edit-id');
                const title = document.getElementById('link-title').value.trim();
                const url = document.getElementById('link-url').value.trim();
                const icon = document.getElementById('link-icon').value;
                const description = document.getElementById('link-description').value.trim();
                
                if (!title) {
                    showToast('error', 'Title is required');
                    return;
                }
                
                if (!url) {
                    showToast('error', 'URL is required');
                    return;
                }
                
                try {
                    new URL(url);
                } catch (error) {
                    showToast('error', 'Please enter a valid URL');
                    return;
                }
                
                if (!userData.links) userData.links = {};
                userData.links[linkId] = { title, url, icon, description };
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.resourcesModule && window.resourcesModule.populateLinks) {
                    window.resourcesModule.populateLinks();
                }
                
                modal.removeAttribute('data-edit-id');
                
                const modalTitle = modal.querySelector('.modal-title');
                if (modalTitle) modalTitle.textContent = 'Add Professional Link';
                
                saveBtn.textContent = 'Save Link';
                
                modal.classList.remove('show');
                showToast('success', 'Link updated successfully');
            });
        }
    }

    function setupResetConfirmModal() {
        const modal = document.getElementById('reset-confirm-modal');
        if (!modal) return;
        
        const closeBtn = document.getElementById('close-reset-confirm-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const cancelBtn = document.getElementById('cancel-reset');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        
        const confirmBtn = document.getElementById('confirm-reset');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                userData = {
                    jobTitles: [],
                    locations: [],
                    careerPages: [],
                    companies: {},
                    profile: {},
                    coverLetters: {},
                    links: {},
                    settings: {
                        reminderSettings: {
                            reminder15Days: true,
                            reminder30Days: true
                        },
                        appearance: {
                            theme: 'dark'
                        }
                    },
                    lastUsed: new Date().toISOString()
                };
                
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                    window.applicationsModule.populateCompaniesTable();
                }
                
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
                showToast('success', 'All data has been reset');
            });
        }
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
                if (window.applicationsModule && window.applicationsModule.clearAllAppliedDates) {
                    window.applicationsModule.clearAllAppliedDates();
                }
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
                if (window.applicationsModule && window.applicationsModule.clearSelectedDates) {
                    window.applicationsModule.clearSelectedDates();
                }
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
                if (window.applicationsModule && window.applicationsModule.clearAllFavorites) {
                    window.applicationsModule.clearAllFavorites();
                }
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
                if (window.applicationsModule && window.applicationsModule.clearSelectedFavorites) {
                    window.applicationsModule.clearSelectedFavorites();
                }
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
                if (window.applicationsModule && window.applicationsModule.clearAllCompanies) {
                    window.applicationsModule.clearAllCompanies();
                }
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
                if (window.applicationsModule && window.applicationsModule.deleteSelectedCompanies) {
                    window.applicationsModule.deleteSelectedCompanies();
                }
                modal.classList.remove('show');
            });
        }
    }

    function openAddCompanyModal() {
        const modal = document.getElementById('add-company-modal');
        if (!modal) return;
        
        const dateInput = document.getElementById('new-company-date');
        if (dateInput) dateInput.value = getTodayDate();
        
        modal.classList.add('show');
    }

    function openAddApplicationModal(jobTitle, companyName, location, website, career) {
        console.log('openAddApplicationModal called with:', { jobTitle, companyName, location, website, career });
        
        const modal = document.getElementById('add-application-modal');
        console.log('Modal element found:', modal);
        
        if (!modal) {
            console.error('Modal element not found!');
            return;
        }
        
        const jobTitleInput = document.getElementById('application-job-title');
        const companyNameInput = document.getElementById('application-company-name');
        const dateInput = document.getElementById('application-date');
        const locationInput = document.getElementById('application-location');
        const websiteInput = document.getElementById('application-website');
        const careerInput = document.getElementById('application-career');
        
        console.log('Form inputs found:', {
            jobTitleInput: !!jobTitleInput,
            companyNameInput: !!companyNameInput,
            dateInput: !!dateInput,
            locationInput: !!locationInput,
            websiteInput: !!websiteInput,
            careerInput: !!careerInput
        });
        
        if (jobTitleInput) jobTitleInput.value = jobTitle || '';
        if (companyNameInput) companyNameInput.value = companyName || '';
        if (dateInput) dateInput.value = getTodayDate();
        if (locationInput) locationInput.value = location || '';
        if (websiteInput) websiteInput.value = website || '';
        if (careerInput) careerInput.value = career || '';
        
        console.log('About to show modal...');
        
        modal.classList.add('show');
        
        console.log('Modal classes after adding show:', modal.classList.toString());
        console.log('Modal should be visible now');
    }

    function openEditCompanyModal(companyId) {
        const modal = document.getElementById('edit-company-modal');
        if (!modal) return;
        
        const company = userData.companies[companyId];
        
        if (!company) {
            showToast('error', 'Company not found');
            return;
        }
        
        const idInput = document.getElementById('edit-company-id');
        const nameInput = document.getElementById('edit-company-name');
        const typeSelect = document.getElementById('edit-company-type');
        const locationInput = document.getElementById('edit-company-location');
        const websiteInput = document.getElementById('edit-company-website');
        const linkedinInput = document.getElementById('edit-company-linkedin');
        const careerInput = document.getElementById('edit-company-career');
        const emailInput = document.getElementById('edit-company-email');
        const dateInput = document.getElementById('edit-company-date');
        const commentsInput = document.getElementById('edit-company-comments');
        const favoriteCheckbox = document.getElementById('edit-company-favorite');
        
        if (idInput) idInput.value = companyId;
        if (nameInput) nameInput.value = company.name || '';
        if (typeSelect) typeSelect.value = company.type || 'VFX';
        if (locationInput) locationInput.value = company.location || '';
        if (websiteInput) websiteInput.value = company.website || '';
        if (linkedinInput) linkedinInput.value = company.linkedin || '';
        if (careerInput) careerInput.value = company.career || '';
        if (emailInput) emailInput.value = company.email || '';
        if (dateInput) dateInput.value = formatDate(company.appliedDate);
        if (commentsInput) commentsInput.value = company.comments || '';
        if (favoriteCheckbox) favoriteCheckbox.checked = company.favorite || false;
        
        modal.classList.add('show');
    }

    function openCommentsModal(companyId) {
        const modal = document.getElementById('add-comments-modal');
        if (!modal) return;
        
        const company = userData.companies[companyId];
        if (!company) {
            showToast('error', 'Company not found');
            return;
        }
        
        const companyIdInput = document.getElementById('comments-company-id');
        const titleInput = document.getElementById('comments-title');
        const contentInput = document.getElementById('comments-content');
        
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
        
        if (titleInput) titleInput.value = title;
        if (contentInput) contentInput.value = content;
        
        const modalTitle = modal.querySelector('.modal-title');
        const saveBtn = document.getElementById('save-comments');
        
        if (company.comments) {
            if (modalTitle) modalTitle.textContent = 'Edit Comments';
            if (saveBtn) saveBtn.textContent = 'Update Comments';
        } else {
            if (modalTitle) modalTitle.textContent = 'Add Comments';
            if (saveBtn) saveBtn.textContent = 'Save Comments';
        }
        
        modal.classList.add('show');
    }

    function openExportModal() {
        const modal = document.getElementById('export-modal');
        if (!modal) return;
        
        const exportData = document.getElementById('export-data');
        if (exportData) exportData.value = JSON.stringify(userData, null, 2);
        
        modal.classList.add('show');
    }

    function openAddCoverLetterModal() {
        const modal = document.getElementById('add-cover-letter-modal');
        if (!modal) return;
        
        const titleInput = document.getElementById('cover-letter-title');
        const contentInput = document.getElementById('cover-letter-content');
        
        if (titleInput) titleInput.value = '';
        if (contentInput) contentInput.value = '';
        
        modal.removeAttribute('data-edit-id');
        
        const modalTitle = modal.querySelector('.modal-title');
        if (modalTitle) modalTitle.textContent = 'Add Cover Letter';
        
        const saveBtn = document.getElementById('save-cover-letter');
        if (saveBtn) saveBtn.textContent = 'Save Cover Letter';
        
        modal.classList.add('show');
    }
    
    function openEditCoverLetterModal(letterId) {
        const modal = document.getElementById('add-cover-letter-modal');
        if (!modal) return;
        
        const letter = userData.coverLetters[letterId];
        
        if (!letter) {
            showToast('error', 'Cover letter not found');
            return;
        }
        
        const titleInput = document.getElementById('cover-letter-title');
        const contentInput = document.getElementById('cover-letter-content');
        
        if (titleInput) titleInput.value = letter.title || '';
        if (contentInput) contentInput.value = letter.content || '';
        
        modal.setAttribute('data-edit-id', letterId);
        
        const modalTitle = modal.querySelector('.modal-title');
        if (modalTitle) modalTitle.textContent = 'Edit Cover Letter';
        
        const saveBtn = document.getElementById('save-cover-letter');
        if (saveBtn) saveBtn.textContent = 'Update Cover Letter';
        
        modal.classList.add('show');
    }

    function openViewCoverLetterModal(letterId) {
        const modal = document.getElementById('view-cover-letter-modal');
        if (!modal) return;
        
        const letter = userData.coverLetters[letterId];
        
        if (!letter) {
            showToast('error', 'Cover letter not found');
            return;
        }
        
        const titleElement = document.getElementById('view-cover-letter-title');
        const contentElement = document.getElementById('view-cover-letter-content');
        
        if (titleElement) titleElement.textContent = letter.title;
        if (contentElement) contentElement.textContent = letter.content;
        
        modal.setAttribute('data-letter-id', letterId);
        
        modal.classList.add('show');
    }

    function openAddLinkModal() {
        const modal = document.getElementById('add-link-modal');
        if (!modal) return;
        
        const titleInput = document.getElementById('link-title');
        const urlInput = document.getElementById('link-url');
        const iconSelect = document.getElementById('link-icon');
        const descriptionInput = document.getElementById('link-description');
        
        if (titleInput) titleInput.value = '';
        if (urlInput) urlInput.value = '';
        if (iconSelect) iconSelect.value = 'fas fa-globe';
        if (descriptionInput) descriptionInput.value = '';
        
        modal.removeAttribute('data-edit-id');
        
        const modalTitle = modal.querySelector('.modal-title');
        if (modalTitle) modalTitle.textContent = 'Add Professional Link';
        
        const saveBtn = document.getElementById('save-link');
        if (saveBtn) saveBtn.textContent = 'Save Link';
        
        modal.classList.add('show');
    }
    
    function openEditLinkModal(linkId) {
        const modal = document.getElementById('add-link-modal');
        if (!modal) return;
        
        const link = userData.links[linkId];
        
        if (!link) {
            showToast('error', 'Link not found');
            return;
        }
        
        const titleInput = document.getElementById('link-title');
        const urlInput = document.getElementById('link-url');
        const iconSelect = document.getElementById('link-icon');
        const descriptionInput = document.getElementById('link-description');
        
        if (titleInput) titleInput.value = link.title || '';
        if (urlInput) urlInput.value = link.url || '';
        if (iconSelect) iconSelect.value = link.icon || 'fas fa-globe';
        if (descriptionInput) descriptionInput.value = link.description || '';
        
        modal.setAttribute('data-edit-id', linkId);
        
        const modalTitle = modal.querySelector('.modal-title');
        if (modalTitle) modalTitle.textContent = 'Edit Professional Link';
        
        const saveBtn = document.getElementById('save-link');
        if (saveBtn) saveBtn.textContent = 'Update Link';
        
        modal.classList.add('show');
    }

    function openResetConfirmModal() {
        const modal = document.getElementById('reset-confirm-modal');
        if (modal) modal.classList.add('show');
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
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
                
                if (window.applicationsModule && window.applicationsModule.populateCompaniesTable) {
                    window.applicationsModule.populateCompaniesTable();
                }
                
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
                document.getElementById('edit-company-modal').classList.remove('show');
                showToast('success', 'Company deleted successfully');
            });
        }
    }

    function openDeleteConfirmationModal(companyId, companyName) {
        const modal = document.getElementById('delete-confirmation-modal');
        const companyNameElement = document.getElementById('company-name-to-delete');
        
        if (companyNameElement) {
            companyNameElement.textContent = `"${companyName}"?`;
        }
        
        modal.setAttribute('data-company-id', companyId);
        modal.classList.add('show');
    }

    function getTodayDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModals);
    } else {
        initModals();
    }

    function openModalById(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            return true;
        }
        return false;
    }
    
    window.modalsModule = {
        openAddCompanyModal,
        openAddApplicationModal,
        openEditCompanyModal,
        openCommentsModal,
        openExportModal,
        openImportModal,
        openAddCoverLetterModal,
        openEditCoverLetterModal,
        openViewCoverLetterModal,
        openAddLinkModal,
        openEditLinkModal,
        openResetConfirmModal,
        openModalById
    };
})();