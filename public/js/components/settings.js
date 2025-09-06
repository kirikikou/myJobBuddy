(function() {
    function initSettings() {
        window.clientConfig&&window.clientConfig.smartLog('buffer','🔧 Settings initialization started');
        setupEventListeners();
        populateSettings();
        initializeLanguageSelector();
        initializeComponentI18n();
        window.clientConfig&&window.clientConfig.smartLog('buffer','✅ Settings initialization completed');
    }

    window.getComponentData = function() {
        return {
            settings: userData.settings || {}
        };
    };

    window.setComponentData = function(data) {
        if (data.settings) {
            userData.settings = data.settings;
            populateSettings();
        }
    };

    function initializeComponentI18n() {
        window.clientConfig&&window.clientConfig.smartLog('buffer','🌐 Initializing component i18n...');
        
        if (window.uiManager) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','✅ UIManager found, current language:', window.uiManager.getCurrentLanguage());
            window.clientConfig&&window.clientConfig.smartLog('buffer','📋 Available translations:', Object.keys(window.uiManager.translations));
            
            setTimeout(() => {
                window.uiManager.translatePage();
                window.clientConfig&&window.clientConfig.smartLog('buffer','🔄 Page translation applied');
            }, 100);
            
            window.uiManager.onLanguageChange((newLang) => {
                window.clientConfig&&window.clientConfig.smartLog('buffer','🔄 Language changed to:', newLang);
                setTimeout(() => {
                    window.uiManager.translatePage();
                    updateSelectOptions();
                    window.clientConfig&&window.clientConfig.smartLog('buffer','🔄 UI updated for new language');
                }, 100);
            });
        } else {
            window.clientConfig&&window.clientConfig.smartLog('buffer','❌ UIManager not found, waiting...');
            setTimeout(initializeComponentI18n, 500);
        }
    }

    function showLocalizedToast(type, messageKey, params = {}) {
        const message = window.uiManager ? 
            window.uiManager.translate(messageKey, params) : 
            messageKey;
        showToast(type, message);
    }

    function setupEventListeners() {
        const saveNotificationSettingsBtn = document.getElementById('save-notification-settings-btn');
        if (saveNotificationSettingsBtn) {
            saveNotificationSettingsBtn.addEventListener('click', saveNotificationSettings);
        }
        
        const saveAppearanceSettingsBtn = document.getElementById('save-appearance-settings-btn');
        if (saveAppearanceSettingsBtn) {
            saveAppearanceSettingsBtn.addEventListener('click', saveAppearanceSettings);
        }
        
        const saveToFileBtn = document.getElementById('save-to-file-btn');
        if (saveToFileBtn) {
            saveToFileBtn.addEventListener('click', saveToFile);
        }
        
        const resetDataBtn = document.getElementById('reset-data-btn');
        if (resetDataBtn) {
            resetDataBtn.addEventListener('click', openResetConfirmModal);
        }
    }

    function populateLanguageOptions() {
        const languageSelector = document.getElementById('language-selector');
        if (!languageSelector || !window.uiManager) return;

        languageSelector.innerHTML = '';

        const supportedLanguages = window.uiManager.getSupportedLanguages();
        const languageNames = window.uiManager.getLanguageNames();
        const currentLang = window.uiManager.getCurrentLanguage();

        supportedLanguages.forEach(langCode => {
            const option = document.createElement('option');
            option.value = langCode;
            option.textContent = languageNames[langCode] || langCode;
            option.selected = langCode === currentLang;
            languageSelector.appendChild(option);
        });

        window.clientConfig&&window.clientConfig.smartLog('buffer',`🌐 Populated ${supportedLanguages.length} language options`);
    }

    function initializeLanguageSelector() {
        if (!window.uiManager || !window.uiManager.isInitialized) {
            window.clientConfig&&window.clientConfig.smartLog('buffer','⏳ UIManager not ready, retrying in 100ms...');
            setTimeout(initializeLanguageSelector, 100);
            return;
        }

        populateLanguageOptions();
        
        const languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            const currentLang = window.uiManager.getCurrentLanguage();
            languageSelector.value = currentLang;
            window.clientConfig&&window.clientConfig.smartLog('buffer','🌐 Language selector initialized with:', currentLang);
            
            languageSelector.addEventListener('change', function(e) {
                const selectedLanguage = e.target.value;
                window.clientConfig&&window.clientConfig.smartLog('buffer','🔄 Language selector changed to:', selectedLanguage);
                
                if (window.uiManager.setLanguage(selectedLanguage)) {
                    showLocalizedToast('success', 'messages.saveSuccess');
                    
                    setTimeout(() => {
                        updateSelectOptions();
                        window.uiManager.translatePage();
                        window.clientConfig&&window.clientConfig.smartLog('buffer','✅ Language change completed');
                    }, 200);
                } else {
                    showLocalizedToast('error', 'messages.saveError');
                    languageSelector.value = window.uiManager.getCurrentLanguage();
                    window.clientConfig&&window.clientConfig.smartLog('fail','❌ Failed to change language');
                }
            });
        } else {
            window.clientConfig&&window.clientConfig.smartLog('buffer','❌ Language selector not found');
        }
    }
      
    function populateSettings() {
        const settings = userData.settings || {};
        
        const reminder15Days = document.getElementById('reminder-15-days');
        const reminder30Days = document.getElementById('reminder-30-days');
        
        if (reminder15Days) reminder15Days.checked = settings.reminderSettings?.reminder15Days !== false;
        if (reminder30Days) reminder30Days.checked = settings.reminderSettings?.reminder30Days !== false;
        
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) themeSelector.value = settings.appearance?.theme || 'dark';
        
        if (window.uiManager && window.uiManager.isInitialized) {
            const currentLang = window.uiManager.getCurrentLanguage();
            
            if (settings.language !== currentLang) {
                window.clientConfig&&window.clientConfig.smartLog('buffer',`🔄 Synchronizing language in userData: ${settings.language} -> ${currentLang}`);
                if (!userData.settings) userData.settings = {};
                userData.settings.language = currentLang;
                if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
            }
            
            const languageSelector = document.getElementById('language-selector');
            if (languageSelector) {
                languageSelector.value = currentLang;
                window.clientConfig&&window.clientConfig.smartLog('buffer','🌐 Language selector populated with:', currentLang);
            }
        }
        
        window.clientConfig&&window.clientConfig.smartLog('buffer','⚙️ Settings populated:', {
            reminder15Days: reminder15Days?.checked,
            reminder30Days: reminder30Days?.checked,
            theme: themeSelector?.value,
            language: window.uiManager?.getCurrentLanguage()
        });
    }

    function updateSelectOptions() {
        if (!window.uiManager) return;
        
        const themeSelector = document.getElementById('theme-selector');
        if (themeSelector) {
            const currentValue = themeSelector.value;
            const options = themeSelector.querySelectorAll('option');
            
            options.forEach(option => {
                const key = option.getAttribute('data-i18n');
                if (key) {
                    const translation = window.uiManager.translate(key);
                    option.textContent = translation;
                    window.clientConfig&&window.clientConfig.smartLog('buffer',`🔄 Updated option ${key} to: ${translation}`);
                }
            });
            
            themeSelector.value = currentValue;
        }
    }

    function saveNotificationSettings() {
        const reminder15Days = document.getElementById('reminder-15-days');
        const reminder30Days = document.getElementById('reminder-30-days');
        
        if (!userData.settings) userData.settings = {};
        if (!userData.settings.reminderSettings) userData.settings.reminderSettings = {};
        
        userData.settings.reminderSettings = {
            reminder15Days: reminder15Days ? reminder15Days.checked : true,
            reminder30Days: reminder30Days ? reminder30Days.checked : true
        };
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        showLocalizedToast('success', 'messages.saveSuccess');
    }

    function saveAppearanceSettings() {
        const themeSelector = document.getElementById('theme-selector');
        
        if (!userData.settings) userData.settings = {};
        if (!userData.settings.appearance) userData.settings.appearance = {};
        
        userData.settings.appearance = {
            theme: themeSelector ? themeSelector.value : 'dark'
        };
        
        if (window.safeSaveUserPreferences) {
    window.safeSaveUserPreferences(userData);
};
        showLocalizedToast('success', 'messages.saveSuccess');
    }

    function saveToFile() {
        const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `myJobBuddy_data_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showLocalizedToast('success', 'messages.saveSuccess');
    }

    function openResetConfirmModal() {
        if (window.modalsModule && window.modalsModule.openResetConfirmModal) {
            window.modalsModule.openResetConfirmModal();
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettings);
    } else {
        initSettings();
    }
})();