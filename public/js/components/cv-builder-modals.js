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
        }, CV_CONFIG.TIMING.MODAL_DELAY_MS);
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
        }, CV_CONFIG.TIMING.MODAL_DELAY_MS);
    }
    
    modal.classList.add('show');
}

async function saveExperience(index) {
    try {
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
        
        CV_LOGGING.service('experience_saved', { index });
    } catch (error) {
        CV_LOGGING.error('Failed to save experience', { error: error.message });
        safeShowToast('messages.saveError', 'error');
    }
}

async function saveEducation(index) {
    try {
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
        
        CV_LOGGING.service('education_saved', { index });
    } catch (error) {
        CV_LOGGING.error('Failed to save education', { error: error.message });
        safeShowToast('messages.saveError', 'error');
    }
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
    try {
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
            
            CV_LOGGING.service('experience_deleted', { index });
        }
    } catch (error) {
        CV_LOGGING.error('Failed to delete experience', { error: error.message });
        safeShowToast('messages.deleteError', 'error');
    }
}

async function deleteEducation(index) {
    try {
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
            
            CV_LOGGING.service('education_deleted', { index });
        }
    } catch (error) {
        CV_LOGGING.error('Failed to delete education', { error: error.message });
        safeShowToast('messages.deleteError', 'error');
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

if (typeof window !== 'undefined') {
    window.handleAddExperience = handleAddExperience;
    window.handleAddEducation = handleAddEducation;
    window.openExperienceModal = openExperienceModal;
    window.openEducationModal = openEducationModal;
    window.deleteExperience = deleteExperience;
    window.deleteEducation = deleteEducation;
    window.renderExperiences = renderExperiences;
    window.renderEducation = renderEducation;
}