(function() {
    function initProfile() {
        setupEventListeners();
        populateProfile();
        initializeComponentI18n();
    }

    window.getComponentData = function() {
        return {
            profile: userData.profile || {}
        };
    };

    window.setComponentData = function(data) {
        if (data.profile) userData.profile = data.profile;
        populateProfile();
    };

    function initializeComponentI18n() {
        if (window.uiManager && window.uiManager.isInitialized) {
            window.uiManager.translatePage();
            window.uiManager.onLanguageChange(() => {
                setTimeout(() => {
                    window.uiManager.translatePage();
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

    function setupEventListeners() {
        const saveBtn = document.getElementById('save-profile-btn');
        if (saveBtn) saveBtn.addEventListener('click', saveProfile);

        const copyBtn = document.getElementById('copyProfileButton');
        if (copyBtn) copyBtn.addEventListener('click', copyProfile);
    }

    function populateProfile() {
        const profile = userData.profile || {};
        const nameInput     = document.getElementById('profile-name');
        const titleInput    = document.getElementById('profile-title');
        const emailInput    = document.getElementById('profile-email');
        const locationInput = document.getElementById('profile-location');
        const bioInput      = document.getElementById('profile-bio');

        if (nameInput)     nameInput.value     = profile.name     || '';
        if (titleInput)    titleInput.value    = profile.title    || '';
        if (emailInput)    emailInput.value    = profile.email    || '';
        if (locationInput) locationInput.value = profile.location || '';
        if (bioInput)      bioInput.value      = profile.bio      || '';
    }

    function saveProfile() {
        const nameInput     = document.getElementById('profile-name');
        const titleInput    = document.getElementById('profile-title');
        const emailInput    = document.getElementById('profile-email');
        const locationInput = document.getElementById('profile-location');
        const bioInput      = document.getElementById('profile-bio');

        userData.profile = {
            name:     nameInput     ? nameInput.value.trim()     : '',
            title:    titleInput    ? titleInput.value.trim()    : '',
            email:    emailInput    ? emailInput.value.trim()    : '',
            location: locationInput ? locationInput.value.trim() : '',
            bio:      bioInput      ? bioInput.value.trim()      : ''
        };

        if (window.safeSaveUserPreferences) {
            window.safeSaveUserPreferences(userData);
        };
        showLocalizedToast('success', 'profile.saveSuccess');
    }

    function copyProfile() {
        const p = userData.profile || {};
        const text = `
${p.name || ''}
${p.title || ''}
${p.email || ''}
${p.location || ''}

${p.bio || ''}
        `.trim();

        navigator.clipboard.writeText(text)
          .then(() => showLocalizedToast('success', 'profile.copySuccess'))
          .catch(() => showLocalizedToast('error', 'profile.copyError'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfile);
    } else {
        initProfile();
    }
})();