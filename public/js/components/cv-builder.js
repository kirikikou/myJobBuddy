const CV_CONFIG = {
    TIMING: {
        MODAL_DELAY_MS: 100,
        DEBOUNCE_DELAY_MS: 500,
        AUTO_SAVE_DELAY_MS: 1000
    },
    VALIDATION: {
        MAX_TEXT_LENGTH: 2000,
        MAX_NAME_LENGTH: 100,
        MAX_EMAIL_LENGTH: 100
    },
    PHOTO: {
        MAX_SIZE_MB: 5,
        ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif'],
        DEFAULT_SIZE: 0.15
    }
};

const CV_LOGGING = {
    service: (message, data) => {
        if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('service', `CV-Builder: ${message}`, data);
        }
    },
    buffer: (message, data) => {
        if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('buffer', `CV-Builder: ${message}`, data);
        }
    },
    win: (message, data) => {
        if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('win', `CV-Builder: ${message}`, data);
        }
    },
    fail: (message, data) => {
        if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('fail', `CV-Builder: ${message}`, data);
        }
    },
    error: (message, data) => {
        if (window.clientConfig?.smartLog) {
            window.clientConfig.smartLog('fail', `CV-Builder ERROR: ${message}`, data);
        }
    }
};

let currentCVData = {
    personalInfo: {},
    experiences: [],
    education: [],
    summary: '',
    extra1: { title: '', content: '' },
    extra2: { title: '', content: '' },
    letterMode: false,
    coverLetter: { title: '', content: '' },
    photo: null,
    photoSize: CV_CONFIG.PHOTO.DEFAULT_SIZE
};

let currentCVId = 'cv_1';
let isCurrentMode = 'cv';
let isSaving = false;
let photoSize = CV_CONFIG.PHOTO.DEFAULT_SIZE;
let debouncedSaveTimeout = null;
let cropData = null;

function debouncedSave() {
    if (debouncedSaveTimeout) {
        clearTimeout(debouncedSaveTimeout);
    }
    debouncedSaveTimeout = setTimeout(() => {
        saveCurrentCV();
    }, CV_CONFIG.TIMING.AUTO_SAVE_DELAY_MS);
}

function validateInput(value, element) {
    if (!element) return true;
    
    const maxLength = element.type === 'email' ? CV_CONFIG.VALIDATION.MAX_EMAIL_LENGTH :
                     element.tagName === 'TEXTAREA' ? CV_CONFIG.VALIDATION.MAX_TEXT_LENGTH :
                     CV_CONFIG.VALIDATION.MAX_NAME_LENGTH;
    
    if (value.length > maxLength) {
        element.value = value.substring(0, maxLength);
        return false;
    }
    return true;
}

async function saveCurrentCV() {
    if (isSaving) return;
    isSaving = true;
    
    try {
        currentCVData = collectCurrentData();
        const cvKey = `cv_data_${currentCVId}`;
        
        if (window.safeSaveUserPreferences) {
            const existingPrefs = window.userData || {};
            const updatedPrefs = {
                ...existingPrefs,
                [cvKey]: currentCVData,
                jobTitles: existingPrefs.jobTitles || [],
                locations: existingPrefs.locations || [],
                careerPages: existingPrefs.careerPages || [],
                companies: existingPrefs.companies || [],
                lastUsed: {
                    ...existingPrefs.lastUsed,
                    cvBuilder: Date.now()
                }
            };
            
            if (window.userData) {
                window.userData[cvKey] = currentCVData;
            }
            
            const result = await window.safeSaveUserPreferences(updatedPrefs);
            
            if (result.success) {
                CV_LOGGING.buffer('CV data saved successfully');
            } else {
                CV_LOGGING.error('Failed to save CV data', { error: result.error });
            }
        }
    } catch (error) {
        CV_LOGGING.error('Failed to save CV data', { error: error.message });
    } finally {
        isSaving = false;
    }
}

function collectCurrentData() {
    const data = {
        personalInfo: {
            firstName: getValue('firstName'),
            lastName: getValue('lastName'),
            jobTitle: getValue('jobTitle'),
            location: getValue('location'),
            email: getValue('email'),
            phone: getValue('phone'),
            drivingLicense: getValue('drivingLicense'),
            languages: getValue('languages'),
            additionalNote: getValue('additionalNote'),
            website: getValue('website'),
            linkedin: getValue('linkedin'),
            portfolio: getValue('portfolio'),
            link1: getValue('link1'),
            link2: getValue('link2'),
            personalComment: getValue('personalComment')
        },
        summary: getValue('summary'),
        experiences: currentCVData.experiences || [],
        education: currentCVData.education || [],
        extra1: {
            title: getValue('extra1Title'),
            content: getValue('extra1Content')
        },
        extra2: {
            title: getValue('extra2Title'),
            content: getValue('extra2Content')
        },
        letterMode: isCurrentMode === 'letter',
        coverLetter: {
            title: getValue('coverLetterTitle'),
            content: getValue('coverLetterContent')
        },
        photo: currentCVData.photo,
        photoSize: photoSize
    };
    
    return data;
}

function getValue(id) {
    const element = document.getElementById(id);
    return element ? element.value.trim() : '';
}

function updatePreview() {
    try {
        updatePersonalInfo();
        updateSummary();
        updateExperiences();
        updateEducation();
        updateExtraSections();
        updatePhoto();
        
        if (isCurrentMode === 'letter') {
            updateLetterPreview();
        }
        
        CV_LOGGING.buffer('Preview updated');
    } catch (error) {
        CV_LOGGING.error('Failed to update preview', { error: error.message });
    }
}

function updatePersonalInfo() {
    const mappings = [
        { id: 'firstName', preview: 'previewFirstName' },
        { id: 'lastName', preview: 'previewLastName' },
        { id: 'jobTitle', preview: 'previewJobTitle' },
        { id: 'email', preview: 'previewEmail', container: 'previewEmailContainer' },
        { id: 'phone', preview: 'previewPhone', container: 'previewPhoneContainer' },
        { id: 'location', preview: 'previewLocation', container: 'previewLocationContainer' },
        { id: 'drivingLicense', preview: 'previewDrivingLicense', container: 'previewDrivingLicenseContainer' },
        { id: 'languages', preview: 'previewLanguages', container: 'previewLanguagesContainer' },
        { id: 'additionalNote', preview: 'previewAdditionalNote', container: 'previewAdditionalNoteContainer' },
        { id: 'website', preview: 'previewWebsite', container: 'previewWebsiteContainer' },
        { id: 'linkedin', preview: 'previewLinkedin', container: 'previewLinkedinContainer' },
        { id: 'portfolio', preview: 'previewPortfolio', container: 'previewPortfolioContainer' },
        { id: 'link1', preview: 'previewLink1', container: 'previewLink1Container' },
        { id: 'link2', preview: 'previewLink2', container: 'previewLink2Container' },
        { id: 'personalComment', preview: 'previewPersonalComment', container: 'previewPersonalCommentContainer' }
    ];

    mappings.forEach(({ id, preview, container }) => {
        const value = getValue(id);
        const previewElement = document.getElementById(preview);
        const containerElement = container ? document.getElementById(container) : null;

        if (previewElement) {
            previewElement.textContent = value;
        }

        if (containerElement) {
            containerElement.style.display = value ? 'flex' : 'none';
        }
    });
}

function updateSummary() {
    const summary = getValue('summary');
    const previewSummary = document.getElementById('previewSummary');
    const previewSection = document.getElementById('previewSummarySection');
    
    if (previewSummary) {
        previewSummary.textContent = summary;
    }
    if (previewSection) {
        previewSection.style.display = summary ? 'block' : 'none';
    }
}

function updateExperiences() {
    const container = document.getElementById('previewExperiences');
    const section = document.getElementById('previewExperienceSection');
    
    if (!container || !section) return;
    
    if (currentCVData.experiences.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    container.innerHTML = currentCVData.experiences.map(exp => `
        <div class="experience-item">
            <div class="experience-header">
                <h4>${exp.position || ''}</h4>
                <span class="experience-dates">${exp.startDate || ''} - ${exp.endDate || ''}</span>
            </div>
            <div class="experience-company">${exp.company || ''}</div>
            <div class="experience-description">${exp.description || ''}</div>
        </div>
    `).join('');
}

function updateEducation() {
    const container = document.getElementById('previewEducation');
    const section = document.getElementById('previewEducationSection');
    
    if (!container || !section) return;
    
    if (currentCVData.education.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    container.innerHTML = currentCVData.education.map(edu => `
        <div class="education-item">
            <div class="education-header">
                <h4>${edu.degree || ''}</h4>
                <span class="education-dates">${edu.startDate || ''} - ${edu.endDate || ''}</span>
            </div>
            <div class="education-institution">${edu.institution || ''}</div>
            <div class="education-description">${edu.description || ''}</div>
        </div>
    `).join('');
}

function updateExtraSections() {
    const extra1Title = getValue('extra1Title');
    const extra1Content = getValue('extra1Content');
    const extra2Title = getValue('extra2Title');
    const extra2Content = getValue('extra2Content');

    updateExtraSection('previewExtra1Section', 'previewExtra1Title', 'previewExtra1Content', extra1Title, extra1Content);
    updateExtraSection('previewExtra2Section', 'previewExtra2Title', 'previewExtra2Content', extra2Title, extra2Content);
}

function updateExtraSection(sectionId, titleId, contentId, title, content) {
    const section = document.getElementById(sectionId);
    const titleElement = document.getElementById(titleId);
    const contentElement = document.getElementById(contentId);
    
    if (section) {
        section.style.display = (title || content) ? 'block' : 'none';
    }
    if (titleElement) {
        titleElement.textContent = title;
    }
    if (contentElement) {
        contentElement.textContent = content;
    }
}

function updateLetterPreview() {
    const letterObject = document.getElementById('letterObject');
    const letterBody = document.getElementById('letterBody');
    const letterSignature = document.getElementById('letterSignature');
    
    if (letterObject) {
        letterObject.textContent = getValue('coverLetterTitle');
    }
    if (letterBody) {
        letterBody.textContent = getValue('coverLetterContent');
    }
    if (letterSignature) {
        const firstName = getValue('firstName');
        const lastName = getValue('lastName');
        letterSignature.textContent = `${firstName} ${lastName}`.trim();
    }
}

function updatePhoto() {
    const previewPhoto = document.getElementById('previewPhoto');
    const photoContainer = document.querySelector('.cv-photo-container');
    
    if (!previewPhoto || !photoContainer) return;
    
    if (currentCVData.photo) {
        previewPhoto.src = currentCVData.photo;
        previewPhoto.style.display = 'block';
        photoContainer.classList.add('has-photo');
        updatePhotoSize();
    } else {
        previewPhoto.style.display = 'none';
        photoContainer.classList.remove('has-photo');
    }
}

function updatePhotoSize() {
    const previewPhoto = document.getElementById('previewPhoto');
    if (previewPhoto && currentCVData.photo) {
        const size = Math.max(0.05, Math.min(0.4, photoSize));
        previewPhoto.style.width = `${size * 400}px`;
        previewPhoto.style.height = `${size * 400}px`;
    }
}

function toggleCVMode() {
    isCurrentMode = isCurrentMode === 'cv' ? 'letter' : 'cv';
    
    const cvModeElements = document.querySelectorAll('.cv-mode-only');
    const letterModeElements = document.querySelectorAll('.letter-mode-only');
    const cvPreviewContent = document.querySelector('.cv-mode-content');
    const letterPreviewContent = document.querySelector('.letter-mode-content');
    const toggleButton = document.getElementById('cvModeToggle');
    
    if (isCurrentMode === 'cv') {
        cvModeElements.forEach(el => el.style.display = 'block');
        letterModeElements.forEach(el => el.style.display = 'none');
        if (cvPreviewContent) cvPreviewContent.style.display = 'block';
        if (letterPreviewContent) letterPreviewContent.style.display = 'none';
        if (toggleButton) {
            toggleButton.innerHTML = '<i class="fas fa-envelope"></i> <span>Mode Lettre</span>';
        }
    } else {
        cvModeElements.forEach(el => el.style.display = 'none');
        letterModeElements.forEach(el => el.style.display = 'block');
        if (cvPreviewContent) cvPreviewContent.style.display = 'none';
        if (letterPreviewContent) letterPreviewContent.style.display = 'block';
        if (toggleButton) {
            toggleButton.innerHTML = '<i class="fas fa-file-alt"></i> <span>Mode CV</span>';
        }
    }
    
    updatePreview();
    debouncedSave();
    CV_LOGGING.buffer(`Switched to ${isCurrentMode} mode`);
}

function handleCVChange(selector) {
    if (selector.value !== currentCVId) {
        saveCurrentCV();
        currentCVId = selector.value;
        loadCVData(currentCVId);
    }
}

async function loadCVData(cvId) {
    try {
        if (window.userData && window.userData[`cv_data_${cvId}`]) {
            currentCVData = { ...window.userData[`cv_data_${cvId}`] };
            populateForm();
            updatePreview();
            CV_LOGGING.buffer(`CV ${cvId} loaded from userData`);
        } else {
            resetForm();
            CV_LOGGING.buffer(`No saved data for ${cvId}, using defaults`);
        }
    } catch (error) {
        CV_LOGGING.error(`Failed to load CV ${cvId}`, { error: error.message });
        resetForm();
    }
}

function populateForm() {
    if (!currentCVData) return;
    
    const { personalInfo = {}, extra1 = {}, extra2 = {}, coverLetter = {} } = currentCVData;
    
    Object.entries(personalInfo).forEach(([key, value]) => {
        setValue(key, value);
    });
    
    setValue('summary', currentCVData.summary || '');
    setValue('extra1Title', extra1.title || '');
    setValue('extra1Content', extra1.content || '');
    setValue('extra2Title', extra2.title || '');
    setValue('extra2Content', extra2.content || '');
    setValue('coverLetterTitle', coverLetter.title || '');
    setValue('coverLetterContent', coverLetter.content || '');
    
    if (currentCVData.letterMode && currentCVData.letterMode !== (isCurrentMode === 'letter')) {
        toggleCVMode();
    }
    
    if (currentCVData.photo) {
        showPhoto(currentCVData.photo);
    }
    
    if (currentCVData.photoSize) {
        photoSize = currentCVData.photoSize;
        updatePhotoSizeSlider();
    }
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value || '';
    }
}

function resetForm() {
    currentCVData = {
        personalInfo: {},
        experiences: [],
        education: [],
        summary: '',
        extra1: { title: '', content: '' },
        extra2: { title: '', content: '' },
        letterMode: false,
        coverLetter: { title: '', content: '' },
        photo: null,
        photoSize: CV_CONFIG.PHOTO.DEFAULT_SIZE
    };
    
    const inputs = document.querySelectorAll('input:not([type="file"]):not([type="button"]):not([type="submit"]):not([type="range"]), textarea');
    inputs.forEach(input => input.value = '');
    
    hidePhoto();
    updatePreview();
}

function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > CV_CONFIG.PHOTO.MAX_SIZE_MB * 1024 * 1024) {
        alert(`Fichier trop volumineux. Taille maximum : ${CV_CONFIG.PHOTO.MAX_SIZE_MB}MB`);
        return;
    }
    
    if (!CV_CONFIG.PHOTO.ALLOWED_TYPES.includes(file.type)) {
        alert('Format non supporté. Utilisez JPG, PNG ou GIF.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        showPhoto(e.target.result);
        currentCVData.photo = e.target.result;
        updatePreview();
        debouncedSave();
        CV_LOGGING.buffer('Photo uploaded successfully');
    };
    reader.readAsDataURL(file);
}

function showPhoto(photoData) {
    const previewPhoto = document.getElementById('previewPhoto');
    const removePhotoBtn = document.getElementById('removePhoto');
    const photoSizeControl = document.getElementById('photoSizeControl');
    
    if (previewPhoto) {
        previewPhoto.src = photoData;
        previewPhoto.style.display = 'block';
    }
    
    if (removePhotoBtn) {
        removePhotoBtn.style.display = 'inline-block';
    }
    
    if (photoSizeControl) {
        photoSizeControl.style.display = 'block';
    }
    
    updatePhotoSize();
}

function handleRemovePhoto() {
    hidePhoto();
    currentCVData.photo = null;
    updatePreview();
    debouncedSave();
    CV_LOGGING.buffer('Photo removed');
}

function hidePhoto() {
    const previewPhoto = document.getElementById('previewPhoto');
    const removePhotoBtn = document.getElementById('removePhoto');
    const photoSizeControl = document.getElementById('photoSizeControl');
    const photoUpload = document.getElementById('photoUpload');
    
    if (previewPhoto) {
        previewPhoto.style.display = 'none';
        previewPhoto.src = '';
    }
    
    if (removePhotoBtn) {
        removePhotoBtn.style.display = 'none';
    }
    
    if (photoSizeControl) {
        photoSizeControl.style.display = 'none';
    }
    
    if (photoUpload) {
        photoUpload.value = '';
    }
}

function updatePhotoSizeSlider() {
    const slider = document.getElementById('photoSizeSlider');
    if (slider) {
        slider.value = photoSize;
    }
}

function handleAddExperience() {
    const experience = {
        id: Date.now(),
        position: 'Nouveau poste',
        company: 'Entreprise',
        startDate: '2024',
        endDate: '2024',
        description: 'Description de l\'expérience...'
    };
    
    currentCVData.experiences.push(experience);
    updatePreview();
    debouncedSave();
    CV_LOGGING.buffer('Experience added');
}

function handleAddEducation() {
    const education = {
        id: Date.now(),
        degree: 'Nouveau diplôme',
        institution: 'Institution',
        startDate: '2024',
        endDate: '2024',
        description: 'Description de la formation...'
    };
    
    currentCVData.education.push(education);
    updatePreview();
    debouncedSave();
    CV_LOGGING.buffer('Education added');
}

function handleExportCV() {
    const exportModal = document.getElementById('exportModal');
    if (exportModal) {
        exportModal.classList.add('show');
        setTimeout(attachExportListeners, CV_CONFIG.TIMING.MODAL_DELAY_MS);
        CV_LOGGING.buffer('Export modal opened');
    } else {
        CV_LOGGING.error('Export modal not found');
    }
}

function attachExportListeners() {
    const exportOptions = document.querySelectorAll('.export-option');
    exportOptions.forEach(option => {
        if (!option.hasAttribute('data-export-listener')) {
            option.setAttribute('data-export-listener', 'true');
            option.addEventListener('click', (e) => {
                const format = e.currentTarget.getAttribute('data-format');
                if (format) {
                    exportCV(format);
                }
            });
        }
    });
}

function exportCV(format) {
    CV_LOGGING.buffer(`Exporting CV as ${format}`);
    
    switch (format) {
        case 'pdf':
            exportAsPDF();
            break;
        case 'jpg':
            exportAsImage();
            break;
        case 'doc':
            exportAsDoc();
            break;
        default:
            CV_LOGGING.fail(`Unsupported export format: ${format}`);
    }
    
    const exportModal = document.getElementById('exportModal');
    if (exportModal) {
        exportModal.classList.remove('show');
    }
}

function exportAsPDF() {
    CV_LOGGING.buffer('PDF export started');
    try {
        const cvPreview = document.getElementById('cvPreview');
        if (!cvPreview) {
            CV_LOGGING.fail('CV preview element not found for PDF export');
            alert('Erreur : Impossible de trouver le contenu à exporter');
            return;
        }
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Popup bloqué. Activez les popups pour exporter.');
            return;
        }
        
        printWindow.document.write(`
            <html>
                <head>
                    <title>CV Export</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .cv-preview { transform: none !important; }
                    </style>
                </head>
                <body>
                    ${cvPreview.outerHTML}
                    <script>window.print(); window.close();</script>
                </body>
            </html>
        `);
        
        CV_LOGGING.win('PDF export completed successfully');
    } catch (error) {
        CV_LOGGING.error('PDF export failed', { error: error.message });
        alert('Erreur lors de l\'export PDF');
    }
}

function exportAsImage() {
    CV_LOGGING.buffer('Image export started');
    alert('Export Image : Fonctionnalité en cours de développement\nUtilisez l\'export PDF pour l\'instant.');
}

function exportAsDoc() {
    CV_LOGGING.buffer('Doc export started');
    alert('Export Word : Fonctionnalité en cours de développement\nUtilisez l\'export PDF pour l\'instant.');
}

async function loadExportLibraries() {
    CV_LOGGING.buffer('Export libraries loading skipped (not implemented)');
    return Promise.resolve();
}

function createNewCV() {
    const selector = document.getElementById('cvSelector');
    if (!selector) return;
    
    const existingOptions = Array.from(selector.options).map(opt => opt.value);
    let newCVNum = 1;
    while (existingOptions.includes(`cv_${newCVNum}`)) {
        newCVNum++;
    }
    
    if (newCVNum > 5) {
        alert('Maximum 5 CV autorisés');
        return;
    }
    
    const newCVId = `cv_${newCVNum}`;
    const option = document.createElement('option');
    option.value = newCVId;
    option.textContent = `CV ${newCVNum}`;
    selector.appendChild(option);
    
    selector.value = newCVId;
    handleCVChange(selector);
    
    CV_LOGGING.buffer(`New CV created: ${newCVId}`);
}

function deleteCurrentCV() {
    if (currentCVId === 'cv_1') {
        alert('Impossible de supprimer le CV principal');
        return;
    }
    
    if (confirm('Êtes-vous sûr de vouloir supprimer ce CV ?')) {
        const selector = document.getElementById('cvSelector');
        if (selector) {
            const optionToRemove = selector.querySelector(`option[value="${currentCVId}"]`);
            if (optionToRemove) {
                optionToRemove.remove();
            }
            
            selector.value = 'cv_1';
            handleCVChange(selector);
        }
        
        CV_LOGGING.buffer(`CV deleted: ${currentCVId}`);
    }
}

function createRequiredModals() {
    if (!document.getElementById('experienceModal')) {
        const experienceModal = document.createElement('div');
        experienceModal.id = 'experienceModal';
        experienceModal.className = 'modal-backdrop';
        experienceModal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>Ajouter une expérience</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Poste</label>
                        <input type="text" id="exp-position" class="form-control" placeholder="Développeur Web">
                    </div>
                    <div class="form-group">
                        <label>Entreprise</label>
                        <input type="text" id="exp-company" class="form-control" placeholder="Google">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Date début</label>
                            <input type="text" id="exp-start" class="form-control" placeholder="01/2020">
                        </div>
                        <div class="form-group">
                            <label>Date fin</label>
                            <input type="text" id="exp-end" class="form-control" placeholder="12/2023">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="exp-description" class="form-control" rows="3" placeholder="Description de vos missions..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" id="cancel-experience">Annuler</button>
                    <button class="btn btn-primary" id="save-experience">Ajouter</button>
                </div>
            </div>
        `;
        document.body.appendChild(experienceModal);
    }
    
    if (!document.getElementById('educationModal')) {
        const educationModal = document.createElement('div');
        educationModal.id = 'educationModal';
        educationModal.className = 'modal-backdrop';
        educationModal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>Ajouter une formation</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Diplôme</label>
                        <input type="text" id="edu-degree" class="form-control" placeholder="Master en Informatique">
                    </div>
                    <div class="form-group">
                        <label>Institution</label>
                        <input type="text" id="edu-institution" class="form-control" placeholder="Université Paris-Saclay">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Date début</label>
                            <input type="text" id="edu-start" class="form-control" placeholder="09/2018">
                        </div>
                        <div class="form-group">
                            <label>Date fin</label>
                            <input type="text" id="edu-end" class="form-control" placeholder="06/2020">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="edu-description" class="form-control" rows="3" placeholder="Spécialisation, mentions, projets..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" id="cancel-education">Annuler</button>
                    <button class="btn btn-primary" id="save-education">Ajouter</button>
                </div>
            </div>
        `;
        document.body.appendChild(educationModal);
    }
}

function initializeEventListeners() {
    CV_LOGGING.service('event_listeners_init_start');
    
    createRequiredModals();
    
    attachBasicEventListeners();
    attachPhotoEventListeners();
    attachFormEventListeners();
    attachModalEventListeners();
    attachPreviewZoomListeners();
    attachExperienceModalListeners();
    attachEducationModalListeners();
    
    window.addEventListener('beforeunload', async () => {
        if (!isSaving) {
            await saveCurrentCV();
        }
    });
    
    CV_LOGGING.service('event_listeners_init_complete');
}

function attachBasicEventListeners() {
    const eventMappings = [
        { id: 'cvSelector', event: 'change', handler: (e) => handleCVChange(e.target) },
        { id: 'newCV', event: 'click', handler: () => createNewCV() },
        { id: 'deleteCV', event: 'click', handler: () => deleteCurrentCV() },
        { id: 'cvModeToggle', event: 'click', handler: () => toggleCVMode() },
        { id: 'addExperience', event: 'click', handler: () => openExperienceModal() },
        { id: 'addEducation', event: 'click', handler: () => openEducationModal() },
        { id: 'exportCV', event: 'click', handler: () => handleExportCV() }
    ];

    eventMappings.forEach(({ id, event, handler }) => {
        const element = document.getElementById(id);
        if (element && !element.hasAttribute('data-listener')) {
            element.setAttribute('data-listener', 'true');
            element.addEventListener(event, handler);
            CV_LOGGING.buffer(`Event listener attached to ${id}`);
        } else if (!element) {
            CV_LOGGING.fail(`Element ${id} not found for event listener`);
        }
    });
}

function attachPhotoEventListeners() {
    const photoUpload = document.getElementById('photoUpload');
    if (photoUpload && !photoUpload.hasAttribute('data-listener')) {
        photoUpload.setAttribute('data-listener', 'true');
        photoUpload.addEventListener('change', (e) => handlePhotoUpload(e));
        CV_LOGGING.buffer('Photo upload listener attached');
    }

    const removePhoto = document.getElementById('removePhoto');
    if (removePhoto && !removePhoto.hasAttribute('data-listener')) {
        removePhoto.setAttribute('data-listener', 'true');
        removePhoto.addEventListener('click', () => handleRemovePhoto());
    }

    const photoSizeSlider = document.getElementById('photoSizeSlider');
    if (photoSizeSlider && !photoSizeSlider.hasAttribute('data-listener')) {
        photoSizeSlider.setAttribute('data-listener', 'true');
        photoSizeSlider.addEventListener('input', (e) => {
            photoSize = parseFloat(e.target.value);
            updatePhotoSize();
            updatePreview();
            debouncedSave();
        });
    }
}

function attachFormEventListeners() {
    const inputs = document.querySelectorAll('input:not([type="file"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="checkbox"]), textarea');
    
    inputs.forEach(input => {
        if (!input.hasAttribute('data-listener')) {
            input.setAttribute('data-listener', 'true');
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                
                if (validateInput(value, e.target)) {
                    updatePreview();
                    debouncedSave();
                }
            });
        }
    });
    
    CV_LOGGING.buffer(`Form listeners attached to ${inputs.length} inputs`);
}

function attachModalEventListeners() {
    const modals = ['exportModal', 'photoCropModal', 'experienceModal', 'educationModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && !modal.hasAttribute('data-listener')) {
            modal.setAttribute('data-listener', 'true');
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-backdrop') || e.target.classList.contains('modal-close')) {
                    modal.classList.remove('show');
                }
            });
        }
    });
}

function attachExperienceModalListeners() {
    const saveBtn = document.getElementById('save-experience');
    const cancelBtn = document.getElementById('cancel-experience');
    
    if (saveBtn && !saveBtn.hasAttribute('data-listener')) {
        saveBtn.setAttribute('data-listener', 'true');
        saveBtn.addEventListener('click', saveExperience);
    }
    
    if (cancelBtn && !cancelBtn.hasAttribute('data-listener')) {
        cancelBtn.setAttribute('data-listener', 'true');
        cancelBtn.addEventListener('click', () => {
            document.getElementById('experienceModal').classList.remove('show');
        });
    }
}

function attachEducationModalListeners() {
    const saveBtn = document.getElementById('save-education');
    const cancelBtn = document.getElementById('cancel-education');
    
    if (saveBtn && !saveBtn.hasAttribute('data-listener')) {
        saveBtn.setAttribute('data-listener', 'true');
        saveBtn.addEventListener('click', saveEducation);
    }
    
    if (cancelBtn && !cancelBtn.hasAttribute('data-listener')) {
        cancelBtn.setAttribute('data-listener', 'true');
        cancelBtn.addEventListener('click', () => {
            document.getElementById('educationModal').classList.remove('show');
        });
    }
}

function openExperienceModal() {
    const modal = document.getElementById('experienceModal');
    if (modal) {
        document.getElementById('exp-position').value = '';
        document.getElementById('exp-company').value = '';
        document.getElementById('exp-start').value = '';
        document.getElementById('exp-end').value = '';
        document.getElementById('exp-description').value = '';
        modal.classList.add('show');
        CV_LOGGING.buffer('Experience modal opened');
    } else {
        CV_LOGGING.error('Experience modal not found');
    }
}

function openEducationModal() {
    const modal = document.getElementById('educationModal');
    if (modal) {
        document.getElementById('edu-degree').value = '';
        document.getElementById('edu-institution').value = '';
        document.getElementById('edu-start').value = '';
        document.getElementById('edu-end').value = '';
        document.getElementById('edu-description').value = '';
        modal.classList.add('show');
        CV_LOGGING.buffer('Education modal opened');
    } else {
        CV_LOGGING.error('Education modal not found');
    }
}

function saveExperience() {
    const experience = {
        id: Date.now(),
        position: document.getElementById('exp-position').value || 'Nouveau poste',
        company: document.getElementById('exp-company').value || 'Entreprise',
        startDate: document.getElementById('exp-start').value || '',
        endDate: document.getElementById('exp-end').value || '',
        description: document.getElementById('exp-description').value || ''
    };
    
    currentCVData.experiences.push(experience);
    document.getElementById('experienceModal').classList.remove('show');
    updatePreview();
    debouncedSave();
    CV_LOGGING.buffer('Experience saved successfully');
}

function saveEducation() {
    const education = {
        id: Date.now(),
        degree: document.getElementById('edu-degree').value || 'Nouveau diplôme',
        institution: document.getElementById('edu-institution').value || 'Institution',
        startDate: document.getElementById('edu-start').value || '',
        endDate: document.getElementById('edu-end').value || '',
        description: document.getElementById('edu-description').value || ''
    };
    
    currentCVData.education.push(education);
    document.getElementById('educationModal').classList.remove('show');
    updatePreview();
    debouncedSave();
    CV_LOGGING.buffer('Education saved successfully');
}

function attachPreviewZoomListeners() {
    document.querySelectorAll('.preview-zoom').forEach(btn => {
        if (!btn.hasAttribute('data-listener')) {
            btn.setAttribute('data-listener', 'true');
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preview-zoom').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const zoom = parseFloat(e.currentTarget.dataset.zoom);
                const cvPreview = document.getElementById('cvPreview');
                if (cvPreview) {
                    cvPreview.style.transform = `scale(${zoom})`;
                }
            });
        }
    });
}

function createRequiredElements() {
    if (!document.getElementById('cv-photo-styles')) {
        const style = document.createElement('style');
        style.id = 'cv-photo-styles';
        style.textContent = `
            .cv-photo-placeholder {
                display: none !important;
            }
            .cv-photo-container {
                display: none;
            }
            .cv-photo-container.has-photo {
                display: block;
            }
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
            }
            .modal-backdrop.show {
                display: flex;
            }
            .modal {
                background: var(--surface, #fff);
                border-radius: 8px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            }
            .modal-header {
                padding: 20px;
                border-bottom: 1px solid var(--border-color, #e0e0e0);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .modal-header h3 {
                margin: 0;
                color: var(--text-primary, #333);
            }
            .modal-close {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: var(--text-secondary, #666);
            }
            .modal-body {
                padding: 20px;
            }
            .modal-footer {
                padding: 20px;
                border-top: 1px solid var(--border-color, #e0e0e0);
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
        `;
        document.head.appendChild(style);
    }
    
    CV_LOGGING.service('required_elements_created');
}

async function initCVBuilder() {
    try {
        CV_LOGGING.service('initialization_start');
        
        await loadCVData(currentCVId);
        initializeEventListeners();
        updatePreview();
        
        CV_LOGGING.win('CV Builder initialized successfully');
        return true;
    } catch (error) {
        CV_LOGGING.error('CV Builder initialization failed', { error: error.message });
        return false;
    }
}

async function initCVBuilderComplete() {
    try {
        await initCVBuilder();
        await loadExportLibraries();
        createRequiredElements();
        
        CV_LOGGING.win('complete_initialization_success');
    } catch (error) {
        CV_LOGGING.error('Complete initialization failed', { error: error.message });
    }
}

if (typeof window !== 'undefined') {
    setTimeout(() => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCVBuilderComplete);
        } else {
            initCVBuilderComplete();
        }
    }, 200);
}