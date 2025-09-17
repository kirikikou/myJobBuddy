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

function cleanUrl(url) {
    if (!url || !url.toString().trim()) return '';
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '');
}

function updateInfoItem(containerId, contentId, value) {
    const container = document.getElementById(containerId);
    const content = document.getElementById(contentId);
    
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

if (typeof window !== 'undefined') {
    window.updatePreview = updatePreview;
}