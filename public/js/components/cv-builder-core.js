let userPreferences = null;
let currentCV = 'cv_1';
let isLetterMode = false;
let photoDataUrl = null;
let photoSize = 0;
let isSaving = false;
let autoPreviewTimer = null;
let debounceTimer = null;

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedSave = debounce(async () => {
    await saveCurrentCV();
}, CV_CONFIG.TIMING.SAVE_DEBOUNCE_MS);

function getTranslatedMessage(key, params = {}) {
    if (window.uiManager) {
        return window.uiManager.translate(key, params);
    }
    return key;
}

function safeShowToast(messageKey, type = 'info', params = {}) {
    const message = getTranslatedMessage(messageKey, params);
    if (typeof showToast === 'function') {
        showToast(type, message);
    }
}

async function safeGetUserPreferences() {
    try {
        if (typeof getUserPreferences === 'function') {
            return await getUserPreferences();
        } else if (typeof window.userData !== 'undefined') {
            return window.userData;
        } else {
            CV_LOGGING.error('getUserPreferences function not found');
            return { cvs: {}, currentCV: 'cv_1' };
        }
    } catch (error) {
        CV_LOGGING.error('Error getting user preferences', { error: error.message });
        return { cvs: {}, currentCV: 'cv_1' };
    }
}

async function safeSaveUserPreferences(prefs) {
    try {
        if (window.initPreferencesService) {
            await window.initPreferencesService();
        }
        if (window.safeSaveUserPreferences) {
            return await window.safeSaveUserPreferences(prefs);
        }
        
        const response = await fetch('/api/save-user-preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prefs)
        });
        
        return await response.json();
    } catch (error) {
        CV_LOGGING.error('Preferences save error', { error: error.message });
        
        try {
            localStorage.setItem('cvBuilder_preferences', JSON.stringify(prefs));
        } catch (storageError) {
            CV_LOGGING.error('LocalStorage fallback failed');
        }
        
        return { success: false, offline: true };
    }
}

async function initCVBuilder() {
    try {
        CV_LOGGING.service('initialization_start');
        
        userPreferences = await safeGetUserPreferences();
        
        if (!userPreferences.cvs || Object.keys(userPreferences.cvs).length === 0) {
            await createDefaultCV();
        }
        
        currentCV = userPreferences.currentCV || Object.keys(userPreferences.cvs)[0] || 'cv_1';
        
        setupCVSelector();
        loadCurrentCV();
        initializeEventListeners();
        updatePreview();
        
        startAutoPreviewUpdate();
        
        setTimeout(initializeComponentI18n, CV_CONFIG.TIMING.MODAL_DELAY_MS);
        
        CV_LOGGING.service('initialization_complete');
    } catch (error) {
        CV_LOGGING.error('Initialization failed', { error: error.message });
        safeShowToast('messages.loadError', 'error');
    }
}

function initializeComponentI18n() {
    if (window.uiManager) {
        window.uiManager.translatePage();
        
        window.uiManager.onLanguageChange((newLanguage) => {
            updateCVBuilderTexts();
            updateModeToggleText();
            updatePreviewSectionTitles();
        });
    }
}

function updateCVBuilderTexts() {
    updateModeToggleText();
    updatePreviewSectionTitles();
    renderExperiences();
    renderEducation();
}

function updateModeToggleText() {
    const modeToggle = document.getElementById('cvModeToggle');
    if (modeToggle) {
        const icon = isLetterMode ? 'fas fa-file-alt' : 'fas fa-envelope';
        const textKey = isLetterMode ? 'cvBuilder.cvMode' : 'cvBuilder.letterMode';
        modeToggle.innerHTML = `<i class="${icon}"></i> <span data-i18n="${textKey}">${getTranslatedMessage(textKey)}</span>`;
    }
}

function updatePreviewSectionTitles() {
    const experienceTitle = document.querySelector('#previewExperienceSection h3');
    const educationTitle = document.querySelector('#previewEducationSection h3');
    
    if (experienceTitle) {
        experienceTitle.textContent = getTranslatedMessage('cvBuilder.professionalExperience');
    }
    
    if (educationTitle) {
        educationTitle.textContent = getTranslatedMessage('cvBuilder.education');
    }
}

async function createDefaultCV() {
    const defaultCV = {
        name: getTranslatedMessage('cvBuilder.defaultCVName'),
        active: true,
        personalInfo: {
            firstName: '',
            lastName: '',
            jobTitle: '',
            location: '',
            email: '',
            phone: '',
            drivingLicense: '',
            languages: '',
            additionalNote: '',
            personalComment: '',
            website: '',
            linkedin: '',
            portfolio: '',
            link1: '',
            link2: ''
        },
        photo: null,
        photoSize: 0,
        summary: '',
        experience: [],
        education: [],
        extra1: { title: '', content: '' },
        extra2: { title: '', content: '' },
        coverLetterTitle: '',
        coverLetterContent: ''
    };
    
    userPreferences.cvs = { cv_1: defaultCV };
    userPreferences.currentCV = 'cv_1';
    await safeSaveUserPreferences(userPreferences);
    
    CV_LOGGING.service('default_cv_created');
}

function setupCVSelector() {
    const selector = document.getElementById('cvSelector');
    if (!selector) return;
    
    selector.innerHTML = '';
    Object.keys(userPreferences.cvs).forEach((cvKey) => {
        const cv = userPreferences.cvs[cvKey];
        const option = document.createElement('option');
        option.value = cvKey;
        option.textContent = cv.name || cvKey;
        if (cvKey === currentCV) option.selected = true;
        selector.appendChild(option);
    });
}

async function handleCVChange(selectElement) {
    const newCV = selectElement.value;
    if (newCV !== currentCV) {
        await saveCurrentCV();
        currentCV = newCV;
        userPreferences.currentCV = currentCV;
        await safeSaveUserPreferences(userPreferences);
        loadCurrentCV();
        updatePreview();
        
        CV_LOGGING.service('cv_changed', { newCV });
    }
}

async function createNewCV() {
    try {
        await saveCurrentCV();
        
        const cvKeys = Object.keys(userPreferences.cvs);
        const newCVKey = `cv_${cvKeys.length + 1}`;
        
        const newCV = {
            name: getTranslatedMessage('cvBuilder.newCVName', { number: cvKeys.length + 1 }),
            active: true,
            personalInfo: {
                firstName: '',
                lastName: '',
                jobTitle: '',
                location: '',
                email: '',
                phone: '',
                drivingLicense: '',
                languages: '',
                additionalNote: '',
                personalComment: '',
                website: '',
                linkedin: '',
                portfolio: '',
                link1: '',
                link2: ''
            },
            photo: null,
            photoSize: 0,
            summary: '',
            experience: [],
            education: [],
            extra1: { title: '', content: '' },
            extra2: { title: '', content: '' },
            coverLetterTitle: '',
            coverLetterContent: ''
        };
        
        userPreferences.cvs[newCVKey] = newCV;
        currentCV = newCVKey;
        userPreferences.currentCV = currentCV;
        
        await safeSaveUserPreferences(userPreferences);
        setupCVSelector();
        loadCurrentCV();
        updatePreview();
        
        safeShowToast('cvBuilder.newCVCreated', 'success');
        CV_LOGGING.service('new_cv_created', { cvKey: newCVKey });
    } catch (error) {
        CV_LOGGING.error('Failed to create new CV', { error: error.message });
        safeShowToast('messages.saveError', 'error');
    }
}

async function deleteCurrentCV() {
    try {
        const cvKeys = Object.keys(userPreferences.cvs);
        if (cvKeys.length <= 1) {
            safeShowToast('cvBuilder.cannotDeleteLastCV', 'error');
            return;
        }
        
        const confirmed = await showConfirmDialog(
            getTranslatedMessage('cvBuilder.deleteCV'),
            getTranslatedMessage('cvBuilder.confirmDeleteCV')
        );
        
        if (confirmed) {
            delete userPreferences.cvs[currentCV];
            const remainingKeys = Object.keys(userPreferences.cvs);
            currentCV = remainingKeys[0];
            userPreferences.currentCV = currentCV;
            
            await safeSaveUserPreferences(userPreferences);
            setupCVSelector();
            loadCurrentCV();
            updatePreview();
            
            safeShowToast('cvBuilder.cvDeleted', 'success');
            CV_LOGGING.service('cv_deleted');
        }
    } catch (error) {
        CV_LOGGING.error('Failed to delete CV', { error: error.message });
        safeShowToast('messages.deleteError', 'error');
    }
}

function loadCurrentCV() {
    const cv = userPreferences.cvs[currentCV];
    if (!cv) return;
    
    CV_LOGGING.service('loading_cv', { cvName: cv.name });
    
    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value || '';
        }
    };
    
    setValue('firstName', cv.personalInfo.firstName);
    setValue('lastName', cv.personalInfo.lastName);
    setValue('jobTitle', cv.personalInfo.jobTitle);
    setValue('location', cv.personalInfo.location);
    setValue('email', cv.personalInfo.email);
    setValue('phone', cv.personalInfo.phone);
    setValue('drivingLicense', cv.personalInfo.drivingLicense);
    setValue('languages', cv.personalInfo.languages);
    setValue('additionalNote', cv.personalInfo.additionalNote);
    setValue('personalComment', cv.personalInfo.personalComment);
    setValue('website', cv.personalInfo.website);
    setValue('linkedin', cv.personalInfo.linkedin);
    setValue('portfolio', cv.personalInfo.portfolio);
    setValue('link1', cv.personalInfo.link1);
    setValue('link2', cv.personalInfo.link2);
    setValue('summary', cv.summary);
    setValue('extra1Title', cv.extra1.title);
    setValue('extra1Content', cv.extra1.content);
    setValue('extra2Title', cv.extra2.title);
    setValue('extra2Content', cv.extra2.content);
    setValue('coverLetterTitle', cv.coverLetterTitle);
    setValue('coverLetterContent', cv.coverLetterContent);
    
    photoDataUrl = cv.photo;
    photoSize = cv.photoSize || 0;
    
    const photoSizeSlider = document.getElementById('photoSizeSlider');
    if (photoSizeSlider) {
        photoSizeSlider.value = photoSize;
    }
    
    updatePhotoVisibility();
    renderExperiences();
    renderEducation();
}

function updatePhotoVisibility() {
    const removePhotoBtn = document.getElementById('removePhoto');
    const photoSizeControl = document.getElementById('photoSizeControl');
    const photoUploadBtn = document.querySelector('.photo-upload-btn');
    
    if (photoDataUrl) {
        if (removePhotoBtn) removePhotoBtn.style.display = 'inline-block';
        if (photoSizeControl) photoSizeControl.style.display = 'block';
        if (photoUploadBtn) photoUploadBtn.style.display = 'none';
    } else {
        if (removePhotoBtn) removePhotoBtn.style.display = 'none';
        if (photoSizeControl) photoSizeControl.style.display = 'none';
        if (photoUploadBtn) photoUploadBtn.style.display = 'inline-block';
    }
}

async function saveCurrentCV() {
    if (!userPreferences || isSaving) return;
    
    isSaving = true;
    CV_LOGGING.service('saving_cv_start');
    
    try {
        const cv = userPreferences.cvs[currentCV];
        
        const getValue = (id) => {
            const element = document.getElementById(id);
            return element ? element.value : '';
        };
        
        cv.personalInfo.firstName = getValue('firstName');
        cv.personalInfo.lastName = getValue('lastName');
        cv.personalInfo.jobTitle = getValue('jobTitle');
        cv.personalInfo.location = getValue('location');
        cv.personalInfo.email = getValue('email');
        cv.personalInfo.phone = getValue('phone');
        cv.personalInfo.drivingLicense = getValue('drivingLicense');
        cv.personalInfo.languages = getValue('languages');
        cv.personalInfo.additionalNote = getValue('additionalNote');
        cv.personalInfo.personalComment = getValue('personalComment');
        cv.personalInfo.website = getValue('website');
        cv.personalInfo.linkedin = getValue('linkedin');
        cv.personalInfo.portfolio = getValue('portfolio');
        cv.personalInfo.link1 = getValue('link1');
        cv.personalInfo.link2 = getValue('link2');
        cv.summary = getValue('summary');
        cv.extra1.title = getValue('extra1Title');
        cv.extra1.content = getValue('extra1Content');
        cv.extra2.title = getValue('extra2Title');
        cv.extra2.content = getValue('extra2Content');
        cv.coverLetterTitle = getValue('coverLetterTitle');
        cv.coverLetterContent = getValue('coverLetterContent');
        cv.photo = photoDataUrl;
        cv.photoSize = photoSize;
        
        await safeSaveUserPreferences(userPreferences);
        CV_LOGGING.service('saving_cv_complete');
    } catch (error) {
        CV_LOGGING.error('Error saving CV', { error: error.message });
    } finally {
        isSaving = false;
    }
}

function toggleCVMode() {
    isLetterMode = !isLetterMode;
    updateModeUI();
    CV_LOGGING.service('mode_toggled', { isLetterMode });
}

function updateModeUI() {
    const btn = document.getElementById('cvModeToggle');
    const cvSections = document.querySelectorAll('.cv-mode-only');
    const letterSections = document.querySelectorAll('.letter-mode-only');
    const cvContent = document.querySelector('.cv-mode-content');
    const letterContent = document.querySelector('.letter-mode-content');

    if (isLetterMode) {
        if (btn) btn.innerHTML = `<i class="fas fa-file-alt"></i> <span data-i18n="cvBuilder.cvMode">${getTranslatedMessage('cvBuilder.cvMode')}</span>`;
        cvSections.forEach(el => el.style.display = 'none');
        letterSections.forEach(el => el.style.display = 'block');
        if (cvContent) cvContent.style.display = 'none';
        if (letterContent) letterContent.style.display = 'block';
    } else {
        if (btn) btn.innerHTML = `<i class="fas fa-envelope"></i> <span data-i18n="cvBuilder.letterMode">${getTranslatedMessage('cvBuilder.letterMode')}</span>`;
        cvSections.forEach(el => el.style.display = 'block');
        letterSections.forEach(el => el.style.display = 'none');
        if (cvContent) cvContent.style.display = 'block';
        if (letterContent) letterContent.style.display = 'none';
    }
    updatePreview();
}

function startAutoPreviewUpdate() {
    autoPreviewTimer = setInterval(() => {
        if (userPreferences && userPreferences.cvs[currentCV]) {
            updatePreview();
        }
    }, CV_CONFIG.TIMING.AUTO_PREVIEW_MS);
    
    CV_LOGGING.service('auto_preview_started');
}

function validateInput(value, element) {
    if (value.length > CV_CONFIG.VALIDATION.MAX_TEXT_LENGTH) {
        element.value = value.substring(0, CV_CONFIG.VALIDATION.MAX_TEXT_LENGTH);
        safeShowToast('cvBuilder.textTruncated', 'warning');
        return false;
    }
    
    if (CV_CONFIG.VALIDATION.REPETITION_PATTERN.test(value)) {
        element.value = value.substring(0, CV_CONFIG.VALIDATION.TRUNCATE_LENGTH);
        safeShowToast('cvBuilder.textTruncated', 'warning');
        return false;
    }
    
    return true;
}

if (typeof window !== 'undefined') {
    window.initCVBuilder = initCVBuilder;
    window.handleCVChange = handleCVChange;
    window.createNewCV = createNewCV;
    window.deleteCurrentCV = deleteCurrentCV;
    window.toggleCVMode = toggleCVMode;
    window.saveCurrentCV = saveCurrentCV;
    window.validateInput = validateInput;
}