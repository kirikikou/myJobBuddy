(function() {
    function initHelp() {
        initializeComponentI18n();
    }

    window.getComponentData = function() {
        return {
            helpViewed: true
        };
    };

    window.setComponentData = function(data) {
        // Help page doesn't have specific data to restore
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
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHelp);
    } else {
        initHelp();
    }

    window.helpModule = {
        initHelp
    };
})();