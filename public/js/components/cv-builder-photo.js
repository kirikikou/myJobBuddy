let cropImage = null;
let cropSettings = {
    imageX: 0,
    imageY: 0,
    imageScale: 1,
    circleRadius: CV_CONFIG.PHOTO.DEFAULT_RADIUS,
    circleX: CV_CONFIG.PHOTO.DEFAULT_POSITION.x,
    circleY: CV_CONFIG.PHOTO.DEFAULT_POSITION.y
};
let isDraggingImage = false;
let isDraggingCircle = false;
let isResizing = false;
let dragStart = { x: 0, y: 0 };
let resizeHandle = null;

async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        safeShowToast('cvBuilder.invalidImageFile', 'error');
        return;
    }

    if (file.size > CV_CONFIG.PHOTO.MAX_SIZE_BYTES) {
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
            }, CV_CONFIG.TIMING.MODAL_DELAY_MS);
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
    
    CV_LOGGING.service('photo_upload_start', { fileSize: file.size });
}

function initializeCropSettings() {
    if (!cropImage) return;
    
    const canvasSize = CV_CONFIG.PHOTO.CROP_CANVAS_SIZE;
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
        circleRadius: CV_CONFIG.PHOTO.DEFAULT_RADIUS,
        circleX: CV_CONFIG.PHOTO.DEFAULT_POSITION.x,
        circleY: CV_CONFIG.PHOTO.DEFAULT_POSITION.y,
        imgWidth: imgWidth,
        imgHeight: imgHeight
    };
}

async function handleRemovePhoto() {
    try {
        photoDataUrl = null;
        photoSize = 0;
        
        const photoUpload = document.getElementById('photoUpload');
        const photoSizeSlider = document.getElementById('photoSizeSlider');
        
        if (photoUpload) photoUpload.value = '';
        if (photoSizeSlider) photoSizeSlider.value = '0';
        
        updatePhotoVisibility();
        updatePreview();
        await saveCurrentCV();
        
        safeShowToast('cvBuilder.photoRemovedSuccessfully', 'success');
        CV_LOGGING.service('photo_removed');
    } catch (error) {
        CV_LOGGING.error('Error removing photo', { error: error.message });
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
    cropSettings.imageScale = Math.max(CV_CONFIG.PHOTO.MIN_SCALE, 
        Math.min(CV_CONFIG.PHOTO.MAX_SCALE, cropSettings.imageScale * scaleFactor));
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
        const maxX = CV_CONFIG.PHOTO.CROP_CANVAS_SIZE - maxRadius;
        const maxY = CV_CONFIG.PHOTO.CROP_CANVAS_SIZE - maxRadius;
        
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
            CV_CONFIG.PHOTO.CROP_CANVAS_SIZE - cropSettings.circleX,
            CV_CONFIG.PHOTO.CROP_CANVAS_SIZE - cropSettings.circleY
        );
        
        cropSettings.circleRadius = Math.max(CV_CONFIG.PHOTO.MIN_RADIUS, Math.min(maxRadius, newRadius));
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
    
    ctx.clearRect(0, 0, CV_CONFIG.PHOTO.CROP_CANVAS_SIZE, CV_CONFIG.PHOTO.CROP_CANVAS_SIZE);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CV_CONFIG.PHOTO.CROP_CANVAS_SIZE, CV_CONFIG.PHOTO.CROP_CANVAS_SIZE);
    
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
    const size = CV_CONFIG.PHOTO.PREVIEW_SIZE;
    
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

function updatePhotoSize() {
    const photoContainer = document.querySelector('.cv-photo-container');
    if (!photoContainer) return;
    
    photoContainer.className = photoContainer.className.replace(/cv-photo-size-\d+/g, '');
    
    if (photoSize > 0) {
        const sizeClass = Math.ceil(photoSize * 10);
        photoContainer.classList.add(`cv-photo-size-${sizeClass}`);
    }
}

window.confirmPhotoCrop = async function() {
    if (!cropImage) {
        safeShowToast('cvBuilder.noImageToCrop', 'error');
        return;
    }
    
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = CV_CONFIG.PHOTO.EXPORT_SIZE;
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
        
        photoDataUrl = canvas.toDataURL('image/jpeg', CV_CONFIG.PHOTO.JPEG_QUALITY);
        
        updatePhotoVisibility();
        updatePreview();
        await saveCurrentCV();
        
        safeShowToast('cvBuilder.photoCroppedSuccessfully', 'success');
        CV_LOGGING.service('photo_cropped');
    } catch (error) {
        CV_LOGGING.error('Error cropping photo', { error: error.message });
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

if (typeof window !== 'undefined') {
    window.handlePhotoUpload = handlePhotoUpload;
    window.handleRemovePhoto = handleRemovePhoto;
    window.updatePhotoSize = updatePhotoSize;
}