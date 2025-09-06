let userPreferences = null;
let currentCV = 'cv_1';
let isLetterMode = false;
let photoDataUrl = null;
let photoSize = 0;
let cropImage = null;
let cropSettings = {
    imageX: 0,
    imageY: 0,
    imageScale: 1,
    circleRadius: 140,
    circleX: 200,
    circleY: 200
};
let isSaving = false;
let isDraggingImage = false;
let isDraggingCircle = false;
let isResizing = false;
let dragStart = { x: 0, y: 0 };
let resizeHandle = null;

function initializeComponentI18n() {
    if (window.uiManager) {
        window.uiManager.translatePage();
        
        window.uiManager.onLanguageChange((newLanguage) => {
            updateCVBuilderTexts();
            updateModeToggleText();
            updatePreviewSectionTitles();
            updateExportModalTexts();
        });
    }
}

function updateCVBuilderTexts() {
    updateModeToggleText();
    updatePreviewSectionTitles();
    updateExperienceEducationLists();
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

function updateExportModalTexts() {
    const exportOptions = document.querySelectorAll('.export-option');
    exportOptions.forEach(option => {
        const format = option.dataset.format;
        const small = option.querySelector('small');
        if (small && format) {
            if (format === 'pdf') {
                small.textContent = getTranslatedMessage('cvBuilder.recommendedFormat');
            } else if (format === 'jpg') {
                small.textContent = getTranslatedMessage('cvBuilder.forOnlineSharing');
            } else if (format === 'doc') {
                small.textContent = getTranslatedMessage('cvBuilder.forEditing');
            }
        }
    });
}

function updateExperienceEducationLists() {
    renderExperiences();
    renderEducation();
}

function getTranslatedMessage(key, params = {}) {
    if (window.uiManager) {
        return window.uiManager.translate(key, params);
    }
    return key;
}

function showLocalizedToast(type, messageKey, params = {}) {
    const message = getTranslatedMessage(messageKey, params);
    if (window.showToast) {
        window.showToast(type, message);
    } else {
        window.clientConfig&&window.clientConfig.smartLog('buffer',`${type.toUpperCase()}: ${message}`);
    }
}

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
}, 1000);

function safeShowToast(messageKey, type = 'info', params = {}) {
    const message = getTranslatedMessage(messageKey, params);
    if (typeof showToast === 'function') {
        showToast(type, message);
    } else {
        window.clientConfig&&window.clientConfig.smartLog('buffer',`${type.toUpperCase()}: ${message}`);
    }
}

async function safeGetUserPreferences() {
    try {
        if (typeof getUserPreferences === 'function') {
            return await getUserPreferences();
        } else if (typeof window.userData !== 'undefined') {
            return window.userData;
        } else {
            window.clientConfig&&window.clientConfig.smartLog('fail','getUserPreferences function not found');
            return { cvs: {}, currentCV: 'cv_1' };
        }
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','Error getting user preferences:', error);
        return { cvs: {}, currentCV: 'cv_1' };
    }
}

async function safeSaveUserPreferences(prefs){
    try{
        if(window.initPreferencesService)
            {await window.initPreferencesService()}
        if(window.safeSaveUserPreferences)
            {return await window.safeSaveUserPreferences(prefs)}
        const r=await fetch('/api/save-user-preferences',
            {method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify(prefs)})
        return await r.json()
    }catch(e){
        if(window.clientConfig&&window.clientConfig.smartLog)
            {window.clientConfig.smartLog('fail','cvBuilder prefs save error',
                {error:String(e)})}
        try{localStorage.setItem('cvBuilder_preferences',
            JSON.stringify(prefs))}catch(_){}
        return {success:false,offline:true}
    }
}

async function initCVBuilder() {
    window.clientConfig&&window.clientConfig.smartLog('buffer','🎯 Initializing CV Builder...');
    
    try {
        userPreferences = await safeGetUserPreferences();
        window.clientConfig&&window.clientConfig.smartLog('buffer','📋 User preferences loaded:', userPreferences);
        
        if (!userPreferences.cvs || Object.keys(userPreferences.cvs).length === 0) {
            await createDefaultCV();
        }
        
        currentCV = userPreferences.currentCV || Object.keys(userPreferences.cvs)[0] || 'cv_1';
        
        window.clientConfig&&window.clientConfig.smartLog('buffer',`📝 Loading CV ${currentCV}:`, userPreferences.cvs[currentCV]?.personalInfo?.firstName);
        
        setupCVSelector();
        loadCurrentCV();
        initializeEventListeners();
        updatePreview();
        
        startAutoPreviewUpdate();
        loadExportLibraries().catch(console.error);
        
        setTimeout(initializeComponentI18n, 100);
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','✅ CV Builder initialized successfully');
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','❌ Error initializing CV Builder:', error);
        safeShowToast('messages.loadError', 'error');
    }
}

function startAutoPreviewUpdate() {
    setInterval(() => {
        if (userPreferences && userPreferences.cvs[currentCV]) {
            updatePreview();
        }
    }, 5000);
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','🔄 Auto preview update started (every 5 seconds)');
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
    }
}

async function createNewCV() {
    await saveCurrentCV();
    
    const cvKeys = Object.keys(userPreferences.cvs);
    const newCVKey = `cv_${cvKeys.length + 1}`;
    
    const newCV = {
        name: getTranslatedMessage('cvBuilder.newCVName', {number: cvKeys.length + 1}),
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
}

async function deleteCurrentCV() {
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
    }
}

function loadCurrentCV() {
    const cv = userPreferences.cvs[currentCV];
    if (!cv) return;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','📥 Loading CV data:', cv);
    
    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value || '';
            window.clientConfig&&window.clientConfig.smartLog('buffer',`Set ${id} = ${value}`);
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
    
    renderExperiences();
    renderEducation();
}

async function saveCurrentCV() {
    if (!userPreferences || isSaving) return;
    
    isSaving = true;
    window.clientConfig&&window.clientConfig.smartLog('buffer','💾 Saving current CV...');
    
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
        window.clientConfig&&window.clientConfig.smartLog('buffer','✅ CV saved successfully');
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','❌ Error saving CV:', error);
    } finally {
        isSaving = false;
    }
}

async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        safeShowToast('cvBuilder.invalidImageFile', 'error');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        safeShowToast('cvBuilder.imageTooLarge', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            cropImage = img;
            initializeCropSettings();
            showPhotoCropModal();
            setTimeout(() => {
                setupCropInteractions();
                updateCanvas();
            }, 100);
        };
        img.onerror = () => {
            safeShowToast('cvBuilder.failedToLoadImage', 'error');
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        safeShowToast('cvBuilder.failedToReadFile', 'error');
    };
    reader.readAsDataURL(file);
}

function initializeCropSettings() {
    if (!cropImage) return;
    
    const canvasSize = 400;
    const imgAspect = cropImage.width / cropImage.height;
    
    let imgWidth, imgHeight;
    if (imgAspect > 1) {
        imgWidth = canvasSize * 0.8;
        imgHeight = (canvasSize * 0.8) / imgAspect;
    } else {
        imgHeight = canvasSize * 0.8;
        imgWidth = (canvasSize * 0.8) * imgAspect;
    }
    
    cropSettings = {
        imageX: (canvasSize - imgWidth) / 2,
        imageY: (canvasSize - imgHeight) / 2,
        imageScale: Math.max(imgWidth / cropImage.width, imgHeight / cropImage.height),
        circleRadius: 140,
        circleX: 200,
        circleY: 200,
        imgWidth: imgWidth,
        imgHeight: imgHeight
    };
}

async function handleRemovePhoto() {
    try {
        photoDataUrl = null;
        photoSize = 0;
        
        const photoUpload = document.getElementById('photoUpload');
        const removePhoto = document.getElementById('removePhoto');
        const photoSizeControl = document.getElementById('photoSizeControl');
        const photoSizeSlider = document.getElementById('photoSizeSlider');
        const photoUploadBtn = document.querySelector('.photo-upload-btn');
        
        if (photoUpload) photoUpload.value = '';
        if (removePhoto) removePhoto.style.display = 'none';
        if (photoSizeControl) photoSizeControl.style.display = 'none';
        if (photoSizeSlider) photoSizeSlider.value = '0';
        if (photoUploadBtn) photoUploadBtn.style.display = 'inline-block';
        
        updatePreview();
        await saveCurrentCV();
        
        safeShowToast('cvBuilder.photoRemovedSuccessfully', 'success');
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','Error removing photo:', error);
        safeShowToast('cvBuilder.failedToRemovePhoto', 'error');
    }
}

function showPhotoCropModal() {
    const modal = document.getElementById('photoCropModal');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function setupCropInteractions() {
    const canvas = document.getElementById('cropCanvas');
    const circle = document.getElementById('cropCircle');
    const handles = document.querySelectorAll('.crop-handle');
    
    if (!canvas || !circle) return;

    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

    circle.addEventListener('mousedown', handleCircleMouseDown);

    handles.forEach(handle => {
        handle.addEventListener('mousedown', handleHandleMouseDown);
    });

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    const modal = document.getElementById('photoCropModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                e.stopPropagation();
            }
        });
    }
}

function isPointInCircle(x, y) {
    const dx = x - cropSettings.circleX;
    const dy = y - cropSettings.circleY;
    return Math.sqrt(dx * dx + dy * dy) <= cropSettings.circleRadius;
}

function handleCanvasMouseDown(e) {
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isPointInCircle(x, y)) {
        isDraggingImage = true;
        dragStart = { 
            x: e.clientX - cropSettings.imageX, 
            y: e.clientY - cropSettings.imageY 
        };
        e.target.style.cursor = 'grabbing';
        e.preventDefault();
    }
}

function handleCanvasMouseMove(e) {
    if (!isDraggingImage) {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        e.target.style.cursor = isPointInCircle(x, y) ? 'grab' : 'default';
    }
}

function handleCanvasMouseUp(e) {
    if (isDraggingImage) {
        isDraggingImage = false;
        e.target.style.cursor = 'grab';
    }
}

function handleCanvasWheel(e) {
    e.preventDefault();
    const scaleFactor = e.deltaY > 0 ? 0.95 : 1.05;
    cropSettings.imageScale = Math.max(0.1, Math.min(5, cropSettings.imageScale * scaleFactor));
    updateCanvas();
}

function handleCircleMouseDown(e) {
    if (e.target.classList.contains('crop-handle')) return;
    
    e.preventDefault();
    e.stopPropagation();
    isDraggingCircle = true;
    dragStart = { 
        x: e.clientX - cropSettings.circleX, 
        y: e.clientY - cropSettings.circleY 
    };
}

function handleHandleMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    resizeHandle = e.target.dataset.position;
    
    const rect = e.target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    dragStart = { x: centerX, y: centerY };
}

function handleDocumentMouseMove(e) {
    if (isDraggingImage) {
        cropSettings.imageX = e.clientX - dragStart.x;
        cropSettings.imageY = e.clientY - dragStart.y;
        updateCanvas();
    } else if (isDraggingCircle) {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        
        const maxRadius = cropSettings.circleRadius;
        const minX = maxRadius;
        const minY = maxRadius;
        const maxX = 400 - maxRadius;
        const maxY = 400 - maxRadius;
        
        cropSettings.circleX = Math.max(minX, Math.min(maxX, newX));
        cropSettings.circleY = Math.max(minY, Math.min(maxY, newY));
        
        updateCanvas();
        updateCircleOverlay();
    } else if (isResizing && resizeHandle) {
        const canvas = document.getElementById('cropCanvas');
        const canvasRect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - canvasRect.left;
        const canvasY = e.clientY - canvasRect.top;
        
        const centerX = cropSettings.circleX;
        const centerY = cropSettings.circleY;
        
        let newRadius;
        
        switch (resizeHandle) {
            case 'n':
                newRadius = centerY - canvasY;
                break;
            case 's':
                newRadius = canvasY - centerY;
                break;
            case 'e':
                newRadius = canvasX - centerX;
                break;
            case 'w':
                newRadius = centerX - canvasX;
                break;
        }
        
        const maxRadius = Math.min(
            cropSettings.circleX,
            cropSettings.circleY,
            400 - cropSettings.circleX,
            400 - cropSettings.circleY
        );
        
        cropSettings.circleRadius = Math.max(30, Math.min(maxRadius, newRadius));
        updateCanvas();
        updateCircleOverlay();
    }
}

function handleDocumentMouseUp() {
    isDraggingImage = false;
    isDraggingCircle = false;
    isResizing = false;
    resizeHandle = null;
}

function updateCircleOverlay() {
    const circle = document.querySelector('.crop-circle');
    const grid = document.querySelector('.crop-grid');
    
    if (circle) {
        const size = cropSettings.circleRadius * 2;
        circle.style.width = size + 'px';
        circle.style.height = size + 'px';
        circle.style.left = cropSettings.circleX + 'px';
        circle.style.top = cropSettings.circleY + 'px';
        circle.style.transform = 'translate(-50%, -50%)';
    }
    
    if (grid) {
        const size = cropSettings.circleRadius * 2;
        grid.style.width = size + 'px';
        grid.style.height = size + 'px';
    }
}

function updateCanvas() {
    const canvas = document.getElementById('cropCanvas');
    const previewCanvas = document.getElementById('previewCanvas');
    
    if (!canvas || !previewCanvas || !cropImage) return;
    
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 400, 400);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 400, 400);
    
    const scaledWidth = cropImage.width * cropSettings.imageScale;
    const scaledHeight = cropImage.height * cropSettings.imageScale;
    
    ctx.drawImage(
        cropImage,
        cropSettings.imageX,
        cropSettings.imageY,
        scaledWidth,
        scaledHeight
    );
    
    updatePreviewCanvas();
}

function updatePreviewCanvas() {
    const previewCanvas = document.getElementById('previewCanvas');
    if (!previewCanvas || !cropImage) return;
    
    const ctx = previewCanvas.getContext('2d');
    const size = 160;
    
    ctx.clearRect(0, 0, size, size);
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.clip();
    
    const scaledWidth = cropImage.width * cropSettings.imageScale;
    const scaledHeight = cropImage.height * cropSettings.imageScale;
    
    const cropX = cropSettings.circleX - cropSettings.circleRadius;
    const cropY = cropSettings.circleY - cropSettings.circleRadius;
    const cropSize = cropSettings.circleRadius * 2;
    
    const scaleRatio = size / cropSize;
    
    ctx.drawImage(
        cropImage,
        (cropSettings.imageX - cropX) * scaleRatio,
        (cropSettings.imageY - cropY) * scaleRatio,
        scaledWidth * scaleRatio,
        scaledHeight * scaleRatio
    );
    
    ctx.restore();
}

window.confirmPhotoCrop = async function() {
    if (!cropImage) {
        safeShowToast('cvBuilder.noImageToCrop', 'error');
        return;
    }
    
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 300;
        canvas.width = size;
        canvas.height = size;
        
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
        ctx.clip();
        
        const scaledWidth = cropImage.width * cropSettings.imageScale;
        const scaledHeight = cropImage.height * cropSettings.imageScale;
        
        const cropX = cropSettings.circleX - cropSettings.circleRadius;
        const cropY = cropSettings.circleY - cropSettings.circleRadius;
        const cropSize = cropSettings.circleRadius * 2;
        
        const scaleRatio = size / cropSize;
        
        ctx.drawImage(
            cropImage,
            (cropSettings.imageX - cropX) * scaleRatio,
            (cropSettings.imageY - cropY) * scaleRatio,
            scaledWidth * scaleRatio,
            scaledHeight * scaleRatio
        );
        
        photoDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        
        const removePhoto = document.getElementById('removePhoto');
        const photoSizeControl = document.getElementById('photoSizeControl');
        const photoUploadBtn = document.querySelector('.photo-upload-btn');
        
        if (removePhoto) removePhoto.style.display = 'inline-block';
        if (photoSizeControl) photoSizeControl.style.display = 'block';
        if (photoUploadBtn) photoUploadBtn.style.display = 'none';
        
        updatePreview();
        await saveCurrentCV();
        
        safeShowToast('cvBuilder.photoCroppedSuccessfully', 'success');
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','Error cropping photo:', error);
        safeShowToast('cvBuilder.failedToCropPhoto', 'error');
    }
    
    cancelPhotoCrop();
};

window.cancelPhotoCrop = function() {
    const modal = document.getElementById('photoCropModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
    
    const photoUpload = document.getElementById('photoUpload');
    if (photoUpload) photoUpload.value = '';
    
    cropImage = null;
    isDraggingImage = false;
    isDraggingCircle = false;
    isResizing = false;
    resizeHandle = null;
};

function cancelPhotoCrop() {
    window.cancelPhotoCrop();
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

function updatePhotoSize() {
    const photoContainer = document.querySelector('.cv-photo-container');
    if (!photoContainer) return;
    
    photoContainer.className = photoContainer.className.replace(/cv-photo-size-\d+/g, '');
    
    if (photoSize > 0) {
        const sizeClass = Math.ceil(photoSize * 10);
        photoContainer.classList.add(`cv-photo-size-${sizeClass}`);
    }
}

function cleanUrl(url) {
    if (!url || !url.toString().trim()) return '';
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

function updateInfoItem(containerId, contentId, value) {
    const container = document.getElementById(containerId);
    const content = document.getElementById(contentId);
    
    window.clientConfig&&window.clientConfig.smartLog('buffer',`Updating ${containerId}:`, value, 'Container:', !!container, 'Content:', !!content);
    
    if (value && String(value).trim()) {
        if (container) container.style.display = 'flex';
        if (content) content.textContent = String(value).trim();
    } else {
        if (container) container.style.display = 'none';
    }
}

function updateSection(sectionId, titleId, titleValue, contentId, contentValue) {
    const section = document.getElementById(sectionId);
    const hasContent = contentId ? 
        (titleValue && titleValue.trim()) || (contentValue && contentValue.trim()) : 
        (titleValue && titleValue.trim());
    
    if (hasContent) {
        if (section) section.style.display = 'block';
        if (titleId) {
            const titleEl = document.getElementById(titleId);
            if (titleEl) titleEl.textContent = titleValue || '';
        }
        if (contentId) {
            const contentEl = document.getElementById(contentId);
            if (contentEl) {
                contentEl.innerHTML = (contentValue || '').replace(/\n/g, '<br>');
            }
        } else if (!contentId && titleValue) {
            const titleEl = document.getElementById(titleId || sectionId.replace('Section', 'Content'));
            if (titleEl) {
                titleEl.innerHTML = titleValue.replace(/\n/g, '<br>');
            }
        }
    } else {
        if (section) section.style.display = 'none';
    }
}

function updateExperiencesPreview(experiences) {
    const container = document.getElementById('previewExperiences');
    const section = document.getElementById('previewExperienceSection');
    
    if (!container || !section) return;
    
    if (!experiences || experiences.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    container.innerHTML = experiences.map(exp => {
        const endDate = exp.current ? getTranslatedMessage('cvBuilder.present') : exp.endDate;
        const dateRange = exp.startDate && endDate ? `${exp.startDate} - ${endDate}` : '';
        
        return `
            <div class="cv-experience-item">
                <div class="cv-experience-header">
                    <div class="cv-experience-title">${exp.position || ''}</div>
                    <div class="cv-experience-date">${dateRange}</div>
                </div>
                <div class="cv-experience-company">${exp.company || ''}</div>
                ${exp.location ? `<div class="cv-experience-location">${exp.location}</div>` : ''}
                ${exp.description ? `<div class="cv-experience-description">${exp.description}</div>` : ''}
            </div>
        `;
    }).join('');
}

function updateEducationPreview(education) {
    const container = document.getElementById('previewEducation');
    const section = document.getElementById('previewEducationSection');
    
    if (!container || !section) return;
    
    if (!education || education.length === 0) {
        section.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    container.innerHTML = education.map(edu => {
        const endDate = edu.current ? getTranslatedMessage('cvBuilder.present') : edu.endDate;
        const dateRange = edu.startDate && endDate ? `${edu.startDate} - ${endDate}` : '';
        
        return `
            <div class="cv-education-item">
                <div class="cv-education-header">
                    <div class="cv-education-degree">${edu.degree || ''}</div>
                    <div class="cv-education-date">${dateRange}</div>
                </div>
                <div class="cv-education-school">${edu.school || ''}</div>
                ${edu.location ? `<div class="cv-education-location">${edu.location}</div>` : ''}
                ${edu.description ? `<div class="cv-education-description">${edu.description}</div>` : ''}
            </div>
        `;
    }).join('');
}

function debugDrivingLicense() {
    const container = document.getElementById('previewDrivingLicenseContainer');
    const content = document.getElementById('previewDrivingLicense');
    const input = document.getElementById('drivingLicense');
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','=== DRIVING LICENSE DEBUG ===');
    window.clientConfig&&window.clientConfig.smartLog('buffer','Input element:', !!input, input ? input.value : 'N/A');
    window.clientConfig&&window.clientConfig.smartLog('buffer','Container element:', !!container);
    window.clientConfig&&window.clientConfig.smartLog('buffer','Content element:', !!content);
    window.clientConfig&&window.clientConfig.smartLog('buffer','CV data:', userPreferences?.cvs?.[currentCV]?.personalInfo?.drivingLicense);
    
    if (container) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Container display:', container.style.display);
        window.clientConfig&&window.clientConfig.smartLog('buffer','Container innerHTML:', container.innerHTML);
    }
    
    if (content) {
        window.clientConfig&&window.clientConfig.smartLog('buffer','Content textContent:', content.textContent);
    }
}

function updatePreview() {
    if (!userPreferences || !userPreferences.cvs[currentCV]) return;
    
    const cv = userPreferences.cvs[currentCV];
    
    const setTextContent = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value || '';
    };

    const setHTMLContent = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = (value || '').replace(/\n/g, '<br>');
        }
    };
    
    setTextContent('previewFirstName', cv.personalInfo.firstName);
    setTextContent('previewLastName', cv.personalInfo.lastName);
    setTextContent('previewJobTitle', cv.personalInfo.jobTitle);
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','Driving License value:', cv.personalInfo.drivingLicense);
    
    updateInfoItem('previewLocationContainer', 'previewLocation', cv.personalInfo.location);
    updateInfoItem('previewEmailContainer', 'previewEmail', cv.personalInfo.email);
    updateInfoItem('previewPhoneContainer', 'previewPhone', cv.personalInfo.phone);
    updateInfoItem('previewDrivingLicenseContainer', 'previewDrivingLicense', cv.personalInfo.drivingLicense);
    updateInfoItem('previewLanguagesContainer', 'previewLanguages', cv.personalInfo.languages);
    updateInfoItem('previewAdditionalNoteContainer', 'previewAdditionalNote', cv.personalInfo.additionalNote);
    updateInfoItem('previewPersonalCommentContainer', 'previewPersonalComment', cv.personalInfo.personalComment);
    updateInfoItem('previewWebsiteContainer', 'previewWebsite', cleanUrl(cv.personalInfo.website));
    updateInfoItem('previewLinkedinContainer', 'previewLinkedin', cleanUrl(cv.personalInfo.linkedin));
    updateInfoItem('previewPortfolioContainer', 'previewPortfolio', cleanUrl(cv.personalInfo.portfolio));
    updateInfoItem('previewLink1Container', 'previewLink1', cleanUrl(cv.personalInfo.link1));
    updateInfoItem('previewLink2Container', 'previewLink2', cleanUrl(cv.personalInfo.link2));
    
    const previewPhoto = document.getElementById('previewPhoto');
    const photoContainer = document.querySelector('.cv-photo-container');
    const photoPlaceholder = document.querySelector('.cv-photo-placeholder');
    
    if (cv.photo) {
        if (previewPhoto) {
            previewPhoto.src = cv.photo;
            previewPhoto.style.display = 'block';
        }
        if (photoContainer) {
            photoContainer.style.display = 'block';
            photoContainer.classList.remove('no-photo');
        }
        if (photoPlaceholder) photoPlaceholder.style.display = 'none';
    } else {
        if (previewPhoto) previewPhoto.style.display = 'none';
        if (photoContainer) photoContainer.style.display = 'none';
        if (photoPlaceholder) photoPlaceholder.style.display = 'none';
    }
    
    updatePhotoSize();
    
    const summarySection = document.getElementById('previewSummarySection');
    const summaryContent = document.getElementById('previewSummaryContent') || document.getElementById('previewSummary');
    
    if (cv.summary && cv.summary.trim()) {
        if (summarySection) summarySection.style.display = 'block';
        if (summaryContent) summaryContent.innerHTML = cv.summary.replace(/\n/g, '<br>');
    } else {
        if (summarySection) summarySection.style.display = 'none';
    }
    
    updateSection('previewExtra1Section', 'previewExtra1Title', cv.extra1.title, 'previewExtra1Content', cv.extra1.content);
    updateSection('previewExtra2Section', 'previewExtra2Title', cv.extra2.title, 'previewExtra2Content', cv.extra2.content);
    
    updateExperiencesPreview(cv.experience || []);
    updateEducationPreview(cv.education || []);
    
    if (isLetterMode) {
        setTextContent('letterObject', cv.coverLetterTitle);
        setHTMLContent('letterBody', cv.coverLetterContent);
        setTextContent('letterSignature', `${cv.personalInfo.firstName} ${cv.personalInfo.lastName}`);
    }
}

function handleAddExperience() {
    openExperienceModal();
}

function handleAddEducation() {
    openEducationModal();
}

function createModal(id, title, formFields, onSubmit) {
    const existingModal = document.getElementById(id);
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.classList.remove('show')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <form id="${id}-form">
                    ${formFields}
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="this.parentElement.parentElement.parentElement.classList.remove('show')">${getTranslatedMessage('common.cancel')}</button>
                <button class="btn btn-primary" onclick="document.getElementById('${id}-form').dispatchEvent(new Event('submit'))">${getTranslatedMessage('common.save')}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            modal.classList.remove('show');
        }
    });
    
    const form = document.getElementById(`${id}-form`);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        onSubmit();
        modal.classList.remove('show');
    });
    
    return modal;
}

function openExperienceModal(index = -1) {
    const formFields = `
        <div class="form-group">
            <label>${getTranslatedMessage('cvBuilder.position')}</label>
            <input type="text" class="form-control" id="exp-position" required>
        </div>
        <div class="form-group">
            <label>${getTranslatedMessage('cvBuilder.company')}</label>
            <input type="text" class="form-control" id="exp-company" required>
        </div>
        <div class="form-group">
            <label>${getTranslatedMessage('profile.location')}</label>
            <input type="text" class="form-control" id="exp-location">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>${getTranslatedMessage('cvBuilder.startDate')}</label>
                <input type="date" class="form-control" id="exp-start-date">
            </div>
            <div class="form-group">
                <label>${getTranslatedMessage('cvBuilder.endDate')}</label>
                <input type="date" class="form-control" id="exp-end-date">
            </div>
        </div>
        <div class="form-group">
            <label>
                <input type="checkbox" id="exp-current"> ${getTranslatedMessage('cvBuilder.currentlyWorking')}
            </label>
        </div>
        <div class="form-group">
            <label>${getTranslatedMessage('cvBuilder.description')}</label>
            <textarea class="form-control" id="exp-description" rows="3"></textarea>
        </div>
    `;
    
    const modal = createModal('experience-modal', getTranslatedMessage('cvBuilder.experience'), formFields, () => saveExperience(index));
    
    if (index >= 0 && userPreferences.cvs[currentCV].experience[index]) {
        const exp = userPreferences.cvs[currentCV].experience[index];
        setTimeout(() => {
            document.getElementById('exp-position').value = exp.position || '';
            document.getElementById('exp-company').value = exp.company || '';
            document.getElementById('exp-location').value = exp.location || '';
            document.getElementById('exp-start-date').value = exp.startDate || '';
            document.getElementById('exp-end-date').value = exp.endDate || '';
            document.getElementById('exp-current').checked = exp.current || false;
            document.getElementById('exp-description').value = exp.description || '';
        }, 100);
    }
    
    modal.classList.add('show');
}

function openEducationModal(index = -1) {
    const formFields = `
        <div class="form-group">
            <label>${getTranslatedMessage('cvBuilder.degree')}</label>
            <input type="text" class="form-control" id="edu-degree" required>
        </div>
        <div class="form-group">
            <label>${getTranslatedMessage('cvBuilder.school')}</label>
            <input type="text" class="form-control" id="edu-school" required>
        </div>
        <div class="form-group">
            <label>${getTranslatedMessage('profile.location')}</label>
            <input type="text" class="form-control" id="edu-location">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>${getTranslatedMessage('cvBuilder.startDate')}</label>
                <input type="date" class="form-control" id="edu-start-date">
            </div>
            <div class="form-group">
                <label>${getTranslatedMessage('cvBuilder.endDate')}</label>
                <input type="date" class="form-control" id="edu-end-date">
            </div>
        </div>
        <div class="form-group">
            <label>
                <input type="checkbox" id="edu-current"> ${getTranslatedMessage('cvBuilder.currentlyStudying')}
            </label>
        </div>
        <div class="form-group">
            <label>${getTranslatedMessage('cvBuilder.description')}</label>
            <textarea class="form-control" id="edu-description" rows="3"></textarea>
        </div>
    `;
    
    const modal = createModal('education-modal', getTranslatedMessage('cvBuilder.education'), formFields, () => saveEducation(index));
    
    if (index >= 0 && userPreferences.cvs[currentCV].education[index]) {
        const edu = userPreferences.cvs[currentCV].education[index];
        setTimeout(() => {
            document.getElementById('edu-degree').value = edu.degree || '';
            document.getElementById('edu-school').value = edu.school || '';
            document.getElementById('edu-location').value = edu.location || '';
            document.getElementById('edu-start-date').value = edu.startDate || '';
            document.getElementById('edu-end-date').value = edu.endDate || '';
            document.getElementById('edu-current').checked = edu.current || false;
            document.getElementById('edu-description').value = edu.description || '';
        }, 100);
    }
    
    modal.classList.add('show');
}

async function saveExperience(index) {
    const getValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value : '';
    };
    const getChecked = (id) => {
        const element = document.getElementById(id);
        return element ? element.checked : false;
    };
    
    const experience = {
        id: index >= 0 ? userPreferences.cvs[currentCV].experience[index].id : Date.now(),
        position: getValue('exp-position'),
        company: getValue('exp-company'),
        location: getValue('exp-location'),
        startDate: getValue('exp-start-date'),
        endDate: getValue('exp-end-date'),
        current: getChecked('exp-current'),
        description: getValue('exp-description')
    };
    
    if (index >= 0) {
        userPreferences.cvs[currentCV].experience[index] = experience;
    } else {
        if (!userPreferences.cvs[currentCV].experience) {
            userPreferences.cvs[currentCV].experience = [];
        }
        userPreferences.cvs[currentCV].experience.push(experience);
    }
    
    renderExperiences();
    updatePreview();
    await saveCurrentCV();
    safeShowToast('cvBuilder.experienceSaved', 'success');
}

async function saveEducation(index) {
    const getValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value : '';
    };
    const getChecked = (id) => {
        const element = document.getElementById(id);
        return element ? element.checked : false;
    };
    
    const education = {
        id: index >= 0 ? userPreferences.cvs[currentCV].education[index].id : Date.now(),
        degree: getValue('edu-degree'),
        school: getValue('edu-school'),
        location: getValue('edu-location'),
        startDate: getValue('edu-start-date'),
        endDate: getValue('edu-end-date'),
        current: getChecked('edu-current'),
        description: getValue('edu-description')
    };
    
    if (index >= 0) {
        userPreferences.cvs[currentCV].education[index] = education;
    } else {
        if (!userPreferences.cvs[currentCV].education) {
            userPreferences.cvs[currentCV].education = [];
        }
        userPreferences.cvs[currentCV].education.push(education);
    }
    
    renderEducation();
    updatePreview();
    await saveCurrentCV();
    safeShowToast('cvBuilder.educationSaved', 'success');
}

function renderExperiences() {
    const container = document.getElementById('experiencesList');
    if (!container) return;
    
    const experiences = userPreferences.cvs[currentCV].experience || [];
    
    container.innerHTML = experiences.map((exp, index) => `
        <div class="experience-item">
            <div class="experience-content">
                <div class="experience-title">${exp.position || getTranslatedMessage('cvBuilder.untitledPosition')}</div>
                <div class="experience-company">${exp.company || ''}</div>
                <div class="experience-dates">${exp.startDate || ''} - ${exp.current ? getTranslatedMessage('cvBuilder.present') : exp.endDate || ''}</div>
            </div>
            <div class="experience-actions">
                <button class="btn btn-sm btn-outline" onclick="openExperienceModal(${index})" title="${getTranslatedMessage('common.edit')}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteExperience(${index})" title="${getTranslatedMessage('common.delete')}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderEducation() {
    const container = document.getElementById('educationList');
    if (!container) return;
    
    const education = userPreferences.cvs[currentCV].education || [];
    
    container.innerHTML = education.map((edu, index) => `
        <div class="education-item">
            <div class="education-content">
                <div class="education-degree">${edu.degree || getTranslatedMessage('cvBuilder.untitledDegree')}</div>
                <div class="education-school">${edu.school || ''}</div>
                <div class="education-dates">${edu.startDate || ''} - ${edu.current ? getTranslatedMessage('cvBuilder.present') : edu.endDate || ''}</div>
            </div>
            <div class="education-actions">
                <button class="btn btn-sm btn-outline" onclick="openEducationModal(${index})" title="${getTranslatedMessage('common.edit')}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteEducation(${index})" title="${getTranslatedMessage('common.delete')}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function deleteExperience(index) {
    const confirmed = await showConfirmDialog(
        getTranslatedMessage('cvBuilder.deleteExperience'),
        getTranslatedMessage('cvBuilder.confirmDeleteExperience')
    );
    if (confirmed) {
        userPreferences.cvs[currentCV].experience.splice(index, 1);
        renderExperiences();
        updatePreview();
        await saveCurrentCV();
        safeShowToast('cvBuilder.experienceDeleted', 'success');
    }
}

async function deleteEducation(index) {
    const confirmed = await showConfirmDialog(
        getTranslatedMessage('cvBuilder.deleteEducation'),
        getTranslatedMessage('cvBuilder.confirmDeleteEducation')
    );
    if (confirmed) {
        userPreferences.cvs[currentCV].education.splice(index, 1);
        renderEducation();
        updatePreview();
        await saveCurrentCV();
        safeShowToast('cvBuilder.educationDeleted', 'success');
    }
}

function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 class="modal-title">${title}</h2>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline" onclick="this.parentElement.parentElement.parentElement.remove(); window.confirmResult(false)">${getTranslatedMessage('common.cancel')}</button>
                    <button class="btn btn-danger" onclick="this.parentElement.parentElement.parentElement.remove(); window.confirmResult(true)">${getTranslatedMessage('common.delete')}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.classList.add('show');
        
        window.confirmResult = (result) => {
            delete window.confirmResult;
            resolve(result);
        };
        
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-backdrop')) {
                modal.remove();
                delete window.confirmResult;
                resolve(false);
            }
        });
    });
}

function toggleCVMode() {
    isLetterMode = !isLetterMode;
    updateModeUI();
}

function initializeEventListeners() {
    window.clientConfig&&window.clientConfig.smartLog('buffer','🔗 Initializing event listeners...');
    
    const cvSelector = document.getElementById('cvSelector');
    if (cvSelector && !cvSelector.hasAttribute('data-listener')) {
        cvSelector.setAttribute('data-listener', 'true');
        cvSelector.addEventListener('change', (e) => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','CV Selector changed to:', e.target.value);
            handleCVChange(e.target);
        });
    }
    
    const newCVBtn = document.getElementById('newCV');
    if (newCVBtn && !newCVBtn.hasAttribute('data-listener')) {
        newCVBtn.setAttribute('data-listener', 'true');
        newCVBtn.addEventListener('click', () => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','New CV button clicked');
            createNewCV();
        });
    }
    
    const deleteCVBtn = document.getElementById('deleteCV');
    if (deleteCVBtn && !deleteCVBtn.hasAttribute('data-listener')) {
        deleteCVBtn.setAttribute('data-listener', 'true');
        deleteCVBtn.addEventListener('click', () => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Delete CV button clicked');
            deleteCurrentCV();
        });
    }
    
    const cvModeToggle = document.getElementById('cvModeToggle');
    if (cvModeToggle && !cvModeToggle.hasAttribute('data-listener')) {
        cvModeToggle.setAttribute('data-listener', 'true');
        cvModeToggle.addEventListener('click', () => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','CV Mode toggle clicked');
            toggleCVMode();
        });
    }
    
    const photoUpload = document.getElementById('photoUpload');
    if (photoUpload && !photoUpload.hasAttribute('data-listener')) {
        photoUpload.setAttribute('data-listener', 'true');
        photoUpload.addEventListener('change', (e) => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Photo upload changed');
            handlePhotoUpload(e);
        });
    }
    
    const removePhoto = document.getElementById('removePhoto');
    if (removePhoto && !removePhoto.hasAttribute('data-listener')) {
        removePhoto.setAttribute('data-listener', 'true');
        removePhoto.addEventListener('click', () => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Remove photo clicked');
            handleRemovePhoto();
        });
    }

    const photoSizeSlider = document.getElementById('photoSizeSlider');
    if (photoSizeSlider && !photoSizeSlider.hasAttribute('data-listener')) {
        photoSizeSlider.setAttribute('data-listener', 'true');
        photoSizeSlider.addEventListener('input', (e) => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Photo size changed to:', e.target.value);
            photoSize = parseFloat(e.target.value);
            updatePhotoSize();
            updatePreview();
            debouncedSave();
        });
    }

    const addExperience = document.getElementById('addExperience');
    if (addExperience && !addExperience.hasAttribute('data-listener')) {
        addExperience.setAttribute('data-listener', 'true');
        addExperience.addEventListener('click', () => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Add experience clicked');
            handleAddExperience();
        });
    }
    
    const addEducation = document.getElementById('addEducation');
    if (addEducation && !addEducation.hasAttribute('data-listener')) {
        addEducation.setAttribute('data-listener', 'true');
        addEducation.addEventListener('click', () => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Add education clicked');
            handleAddEducation();
        });
    }

    const exportCV = document.getElementById('exportCV');
    if (exportCV && !exportCV.hasAttribute('data-listener')) {
        exportCV.setAttribute('data-listener', 'true');
        exportCV.addEventListener('click', () => {
            window.clientConfig&&window.clientConfig.smartLog('buffer','Export CV clicked');
            const exportModal = document.getElementById('exportModal');
            if (exportModal) {
                exportModal.classList.add('show');
                setTimeout(attachExportListeners, 100);
            }
        });
    }

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

    const inputs = document.querySelectorAll('input:not([type="file"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="checkbox"]), textarea');
    inputs.forEach(input => {
        if (!input.hasAttribute('data-listener')) {
            input.setAttribute('data-listener', 'true');
            
            input.addEventListener('input', (e) => {
                window.clientConfig&&window.clientConfig.smartLog('buffer',`Input changed: ${input.id} = ${e.target.value}`);
                const value = e.target.value;
                if (value.length > 1000 || /(.{1,3})\1{10,}/.test(value)) {
                    e.target.value = value.substring(0, 500);
                    safeShowToast('cvBuilder.textTruncated', 'warning');
                    return;
                }
                
                updatePreview();
                debouncedSave();
            });
        }
    });

    const modals = ['exportModal', 'photoCropModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && !modal.hasAttribute('data-listener')) {
            modal.setAttribute('data-listener', 'true');
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-backdrop')) {
                    modal.classList.remove('show');
                }
            });
        }
    });
    
    window.addEventListener('beforeunload', async () => {
        if (!isSaving) {
            await saveCurrentCV();
        }
    });
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','✅ Event listeners initialized');
    
    createRequiredElements();
}

function createRequiredElements() {
    if (!document.getElementById('experience-modal')) {
        const modal = document.createElement('div');
        modal.id = 'experience-modal';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }
    
    if (!document.getElementById('education-modal')) {
        const modal = document.createElement('div');
        modal.id = 'education-modal';
        modal.style.display = 'none';
        document.body.appendChild(modal);
    }
    
    if (!document.getElementById('preview-cv')) {
        const btn = document.createElement('button');
        btn.id = 'preview-cv';
        btn.style.display = 'none';
        document.body.appendChild(btn);
    }
    
    if (!document.getElementById('export-pdf')) {
        const btn = document.createElement('button');
        btn.id = 'export-pdf';
        btn.style.display = 'none';
        document.body.appendChild(btn);
    }
    
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
        `;
        document.head.appendChild(style);
    }
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','✅ Required elements created for main.js detection');
}

function attachExportListeners() {
    window.clientConfig&&window.clientConfig.smartLog('buffer','🔗 Attaching export listeners...');
    
    const exportModal = document.getElementById('exportModal');
    if (exportModal && !exportModal.hasAttribute('data-export-listeners')) {
        exportModal.setAttribute('data-export-listeners', 'true');
        
        exportModal.addEventListener('click', async (e) => {
            const button = e.target.closest('[data-format]');
            if (button) {
                e.preventDefault();
                e.stopPropagation();
                
                const format = button.getAttribute('data-format');
                window.clientConfig&&window.clientConfig.smartLog('buffer',`📄 Exporting CV as ${format}...`);
                
                try {
                    if (format === 'pdf') {
                        await exportToPDF();
                    } else if (format === 'jpg') {
                        await exportToJPG();
                    } else if (format === 'doc') {
                        await exportToDoc();
                    }
                    
                    safeShowToast('cvBuilder.exportSuccess', 'success', {format: format.toUpperCase()});
                } catch (error) {
                    window.clientConfig&&window.clientConfig.smartLog('fail',`Export ${format} error:`, error);
                    safeShowToast('cvBuilder.exportError', 'error', {format: format.toUpperCase()});
                }
                
                exportModal.classList.remove('show');
            }
        });
    }
}

async function exportToPDF() {
    try {
        await loadExportLibraries();
        
        const cvPreview = document.getElementById('cvPreview');
        if (!cvPreview) throw new Error('CV preview not found');
        
        const originalTransform = cvPreview.style.transform;
        const originalWidth = cvPreview.style.width;
        const originalHeight = cvPreview.style.height;
        
        cvPreview.style.transform = 'scale(1)';
        cvPreview.style.width = '800px';
        cvPreview.style.minHeight = '1100px';
        
        await new Promise(resolve => setTimeout(resolve, 100));
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = await html2canvas(cvPreview, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: 800,
            height: 1100,
            scrollX: 0,
            scrollY: 0
        });
        
        cvPreview.style.transform = originalTransform;
        cvPreview.style.width = originalWidth;
        cvPreview.style.height = originalHeight;
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgData = canvas.toDataURL('image/png');
        
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 5; 
        
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);
        
        const imgRatio = canvas.width / canvas.height;
        const pageRatio = availableWidth / availableHeight;
        
        let finalWidth, finalHeight;
        
        if (imgRatio > pageRatio) {
            finalWidth = availableWidth;
            finalHeight = availableWidth / imgRatio;
        } else {
            finalHeight = availableHeight;
            finalWidth = availableHeight * imgRatio;
        }
        
        const x = (pageWidth - finalWidth) / 2;
        const y = (pageHeight - finalHeight) / 2;
        
        pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
        
        const cv = userPreferences.cvs[currentCV];
        const docType = isLetterMode ? getTranslatedMessage('cvBuilder.coverLetter') : 'CV';
        const fileName = `${docType}_${cv.personalInfo.firstName || 'User'}_${cv.personalInfo.lastName || 'Document'}.pdf`;
        
        pdf.save(fileName.replace(/\s+/g, '_'));
        
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','PDF export error:', error);
        throw error;
    }
}

async function exportToJPG() {
    try {
        await loadExportLibraries();
        
        const cvPreview = document.getElementById('cvPreview');
        if (!cvPreview) throw new Error('CV preview not found');
        
        const originalTransform = cvPreview.style.transform;
        const originalWidth = cvPreview.style.width;
        const originalHeight = cvPreview.style.height;
        
        cvPreview.style.transform = 'scale(1)';
        cvPreview.style.width = '800px';
        cvPreview.style.minHeight = '1100px';
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = await html2canvas(cvPreview, {
            scale: 3, 
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: 800,
            height: 1100,
            scrollX: 0,
            scrollY: 0
        });
        
        cvPreview.style.transform = originalTransform;
        cvPreview.style.width = originalWidth;
        cvPreview.style.height = originalHeight;
        
        const link = document.createElement('a');
        const cv = userPreferences.cvs[currentCV];
        const docType = isLetterMode ? getTranslatedMessage('cvBuilder.coverLetter') : 'CV';
        const fileName = `${docType}_${cv.personalInfo.firstName || 'User'}_${cv.personalInfo.lastName || 'Document'}.jpg`;
        
        link.download = fileName.replace(/\s+/g, '_');
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        window.clientConfig&&window.clientConfig.smartLog('fail','JPG export error:', error);
        throw error;
    }
}

async function exportToDoc() {
    const cv = userPreferences.cvs[currentCV];
    
    let docContent;
    
    if (isLetterMode) {
        docContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${getTranslatedMessage('cvBuilder.coverLetter')} ${cv.personalInfo.firstName} ${cv.personalInfo.lastName}</title>
            </head>
            <body>
                <h1>${cv.personalInfo.firstName} ${cv.personalInfo.lastName}</h1>
                <p>${cv.personalInfo.email} | ${cv.personalInfo.phone}</p>
                <p>${cv.personalInfo.location}</p>
                <br>
                <h2>${getTranslatedMessage('cvBuilder.subject')} ${cv.coverLetterTitle}</h2>
                <br>
                <div>${cv.coverLetterContent.replace(/\n/g, '<br>')}</div>
                <br>
                <p>${getTranslatedMessage('cvBuilder.sincerely')},<br>${cv.personalInfo.firstName} ${cv.personalInfo.lastName}</p>
            </body>
            </html>
        `;
    } else {
        docContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>CV ${cv.personalInfo.firstName} ${cv.personalInfo.lastName}</title>
            </head>
            <body>
                <h1>${cv.personalInfo.firstName} ${cv.personalInfo.lastName}</h1>
                <h2>${cv.personalInfo.jobTitle}</h2>
                <p><strong>${getTranslatedMessage('profile.location')}:</strong> ${cv.personalInfo.location}</p>
                <p><strong>${getTranslatedMessage('profile.email')}:</strong> ${cv.personalInfo.email}</p>
                <p><strong>${getTranslatedMessage('profile.phone')}:</strong> ${cv.personalInfo.phone}</p>
                
                <h3>${getTranslatedMessage('cvBuilder.about')}</h3>
                <p>${cv.summary}</p>
                
                <h3>${getTranslatedMessage('cvBuilder.professionalExperience')}</h3>
        `;
        
        cv.experience.forEach(exp => {
            docContent += `
                <h4>${exp.position} - ${exp.company}</h4>
                <p><strong>${getTranslatedMessage('cvBuilder.period')}:</strong> ${exp.startDate} - ${exp.current ? getTranslatedMessage('cvBuilder.present') : exp.endDate}</p>
                <p><strong>${getTranslatedMessage('profile.location')}:</strong> ${exp.location}</p>
                <p>${exp.description}</p>
            `;
        });
        
        docContent += `<h3>${getTranslatedMessage('cvBuilder.education')}</h3>`;
        cv.education.forEach(edu => {
            docContent += `
                <h4>${edu.degree} - ${edu.school}</h4>
                <p><strong>${getTranslatedMessage('cvBuilder.period')}:</strong> ${edu.startDate} - ${edu.current ? getTranslatedMessage('cvBuilder.present') : edu.endDate}</p>
                <p><strong>${getTranslatedMessage('profile.location')}:</strong> ${edu.location}</p>
                <p>${edu.description}</p>
            `;
        });
        
        docContent += '</body></html>';
    }
    
    const blob = new Blob([docContent], { type: 'application/msword' });
    const link = document.createElement('a');
    const docType = isLetterMode ? getTranslatedMessage('cvBuilder.coverLetter') : 'CV';
    const fileName = `${docType}_${cv.personalInfo.firstName || 'User'}_${cv.personalInfo.lastName || 'Document'}.doc`;
    
    link.download = fileName.replace(/\s+/g, '_');
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

async function loadExportLibraries() {
    if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    if (!window.jspdf) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}

if (typeof window !== 'undefined') {
    window.initCVBuilder = initCVBuilder;
    window.handleCVChange = handleCVChange;
    window.createNewCV = createNewCV;
    window.deleteCurrentCV = deleteCurrentCV;
    window.openExperienceModal = openExperienceModal;
    window.openEducationModal = openEducationModal;
    window.deleteExperience = deleteExperience;
    window.deleteEducation = deleteEducation;
    window.toggleCVMode = toggleCVMode;
    
    window.clientConfig&&window.clientConfig.smartLog('buffer','🚀 CV Builder functions loaded into window');
    
    createRequiredElements();
    
    setTimeout(() => {
        window.clientConfig&&window.clientConfig.smartLog('buffer','🎯 Auto-initializing CV Builder...');
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCVBuilder);
        } else {
            initCVBuilder();
        }
    }, 200);
}