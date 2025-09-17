let exportLibrariesLoaded = false;

async function loadExportLibraries() {
    if (exportLibrariesLoaded) return;
    
    const libraries = [
        {
            name: 'html2canvas',
            url: CV_CONFIG.LIBRARIES.HTML2CANVAS,
            check: () => window.html2canvas
        },
        {
            name: 'jspdf',
            url: CV_CONFIG.LIBRARIES.JSPDF,
            check: () => window.jspdf
        }
    ];

    for (const lib of libraries) {
        if (!lib.check()) {
            try {
                await loadScript(lib.url);
                CV_LOGGING.service('library_loaded', { library: lib.name });
            } catch (error) {
                CV_LOGGING.error('Failed to load export library', { 
                    library: lib.name, 
                    error: error.message 
                });
            }
        }
    }
    
    exportLibrariesLoaded = true;
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function attachExportListeners() {
    const exportModal = document.getElementById('exportModal');
    if (exportModal && !exportModal.hasAttribute('data-export-listeners')) {
        exportModal.setAttribute('data-export-listeners', 'true');
        
        exportModal.addEventListener('click', async (e) => {
            const button = e.target.closest('[data-format]');
            if (button) {
                e.preventDefault();
                e.stopPropagation();
                
                const format = button.getAttribute('data-format');
                CV_LOGGING.service('export_start', { format });
                
                try {
                    if (format === 'pdf') {
                        await exportToPDF();
                    } else if (format === 'jpg') {
                        await exportToJPG();
                    } else if (format === 'doc') {
                        await exportToDoc();
                    }
                    
                    safeShowToast('cvBuilder.exportSuccess', 'success', { format: format.toUpperCase() });
                    CV_LOGGING.service('export_complete', { format });
                } catch (error) {
                    CV_LOGGING.error('Export failed', { format, error: error.message });
                    safeShowToast('cvBuilder.exportError', 'error', { format: format.toUpperCase() });
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
        cvPreview.style.width = CV_CONFIG.EXPORT.CANVAS_WIDTH + 'px';
        cvPreview.style.minHeight = CV_CONFIG.EXPORT.CANVAS_HEIGHT + 'px';
        
        await new Promise(resolve => setTimeout(resolve, CV_CONFIG.TIMING.CANVAS_UPDATE_DELAY_MS));
        
        const canvas = await html2canvas(cvPreview, {
            scale: CV_CONFIG.EXPORT.CANVAS_SCALE,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: CV_CONFIG.EXPORT.CANVAS_WIDTH,
            height: CV_CONFIG.EXPORT.CANVAS_HEIGHT,
            scrollX: 0,
            scrollY: 0
        });
        
        cvPreview.style.transform = originalTransform;
        cvPreview.style.width = originalWidth;
        cvPreview.style.height = originalHeight;
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        const imgData = canvas.toDataURL('image/png');
        
        const pageWidth = CV_CONFIG.EXPORT.PDF_PAGE.width;
        const pageHeight = CV_CONFIG.EXPORT.PDF_PAGE.height;
        const margin = CV_CONFIG.EXPORT.PDF_MARGIN;
        
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
        CV_LOGGING.error('PDF export error', { error: error.message });
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
        cvPreview.style.width = CV_CONFIG.EXPORT.CANVAS_WIDTH + 'px';
        cvPreview.style.minHeight = CV_CONFIG.EXPORT.CANVAS_HEIGHT + 'px';
        
        await new Promise(resolve => setTimeout(resolve, CV_CONFIG.TIMING.MODAL_DELAY_MS));
        
        const canvas = await html2canvas(cvPreview, {
            scale: CV_CONFIG.EXPORT.JPG_CANVAS_SCALE,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            width: CV_CONFIG.EXPORT.CANVAS_WIDTH,
            height: CV_CONFIG.EXPORT.CANVAS_HEIGHT,
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
        link.href = canvas.toDataURL('image/jpeg', CV_CONFIG.PHOTO.JPEG_QUALITY);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (error) {
        CV_LOGGING.error('JPG export error', { error: error.message });
        throw error;
    }
}

async function exportToDoc() {
    try {
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
            docContent = generateCVDocContent(cv);
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
        
    } catch (error) {
        CV_LOGGING.error('DOC export error', { error: error.message });
        throw error;
    }
}

function generateCVDocContent(cv) {
    let content = `
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
        content += `
            <h4>${exp.position} - ${exp.company}</h4>
            <p><strong>${getTranslatedMessage('cvBuilder.period')}:</strong> ${exp.startDate} - ${exp.current ? getTranslatedMessage('cvBuilder.present') : exp.endDate}</p>
            <p><strong>${getTranslatedMessage('profile.location')}:</strong> ${exp.location}</p>
            <p>${exp.description}</p>
        `;
    });
    
    content += `<h3>${getTranslatedMessage('cvBuilder.education')}</h3>`;
    cv.education.forEach(edu => {
        content += `
            <h4>${edu.degree} - ${edu.school}</h4>
            <p><strong>${getTranslatedMessage('cvBuilder.period')}:</strong> ${edu.startDate} - ${edu.current ? getTranslatedMessage('cvBuilder.present') : edu.endDate}</p>
            <p><strong>${getTranslatedMessage('profile.location')}:</strong> ${edu.location}</p>
            <p>${edu.description}</p>
        `;
    });
    
    content += '</body></html>';
    return content;
}

if (typeof window !== 'undefined') {
    window.loadExportLibraries = loadExportLibraries;
    window.attachExportListeners = attachExportListeners;
    window.exportToPDF = exportToPDF;
    window.exportToJPG = exportToJPG;
    window.exportToDoc = exportToDoc;
}