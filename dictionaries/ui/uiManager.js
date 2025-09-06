(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['clientConfig'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.clientConfig || window.clientConfig);
  } else {
    root.UIManager = factory(root.clientConfig || window.clientConfig);
  }
}(typeof self !== 'undefined' ? self : this, function (clientConfig) {

  const config = clientConfig || window.clientConfig || {
    smartLog: (category, message, data) => console.log(`[${category.toUpperCase()}] ${message}`, data),
    i18n: {
      defaultLocale: 'en',
      storageKey: 'myJobBuddy_language',
      endpoint: '/dictionaries/ui/',
      timeoutMs: 5000,
      retry: { max: 3, delayMs: 1000 }
    },
    memoryCache: {
      set: () => {},
      get: () => null,
      has: () => false,
      delete: () => {},
      clear: () => {}
    }
  };

  class UIManager {
    constructor() {
      this.currentLanguage = config.i18n.defaultLocale;
      this.fallbackLanguage = config.i18n.defaultLocale;
      this.supportedLanguages = this._getInitialSupportedLanguages();
      this.translations = {};
      this.observers = [];
      this.storageKey = config.i18n.storageKey;
      this.isInitialized = false;
      this.loadingPromises = new Map();
      this._initializationPromise = null;
      this._supportedLanguagesLoaded = false;
      this._lastSavedPayloadHash = null;
      this._saveInProgress = false;
    }

    _getInitialSupportedLanguages() {
      if (typeof window !== 'undefined' && window.AVAILABLE_UI_LANGS) {
        return window.AVAILABLE_UI_LANGS;
      }
      return [config.i18n.defaultLocale];
    }

    async initialize() {
      if (this.isInitialized) {
        return;
      }
    
      if (this._initializationPromise) {
        return await this._initializationPromise;
      }

      this._initializationPromise = this._performInitialization();
      return await this._initializationPromise;
    }

    async _performInitialization() {
      try {
        config.smartLog('langue', 'Starting UI initialization');
        
        if (typeof document !== 'undefined') {
          document.body.classList.add('i18n-loading');
        }
        
        await this._loadSupportedLanguages();
        
        config.smartLog('langue', 'Waiting for userData availability');
        await this._waitForUserData();
        
        this.currentLanguage = this.detectLanguage();
        config.smartLog('langue', `Language detected: ${this.currentLanguage}`);
        
        await this._loadTranslations();
        config.smartLog('langue', 'Translations loaded successfully');
        
        this._setupLanguageObserver();
        
        this.isInitialized = true;
        config.smartLog('win', `UI initialized successfully with language: ${this.currentLanguage}`);
        
        this.translatePage();
        
        if (typeof document !== 'undefined') {
          setTimeout(() => {
            document.body.classList.remove('i18n-loading');
            document.body.classList.add('i18n-ready');
          }, 50);
        }
        
        this._logLanguageDetectionSummary();
        
      } catch (error) {
        config.smartLog('fail', `UI initialization error: ${error.message}`);
        this.currentLanguage = this.fallbackLanguage;
        this.isInitialized = true;
        if (typeof document !== 'undefined') {
          document.body.classList.remove('i18n-loading');
          document.body.classList.add('i18n-ready');
        }
      }
    }

    async _loadSupportedLanguages(){
      if(this._supportedLanguagesLoaded) return;
      
      this._supportedLanguagesLoaded = true;
      
      if(this.supportedLanguages.length > 1) return;
      
      try{
        const r=await this._fetchWithTimeout('/dictionaries/ui/locales.json',config.i18n.timeoutMs);
        if(r.ok){
          const j=await r.json();
          const a=Array.isArray(j)?j:(Array.isArray(j.languages)?j.languages:[]);
          if(a.length){this.supportedLanguages=a;config.smartLog('langue',`Loaded ${a.length} supported languages from locales.json`);return;}
        }
      }catch(e){config.smartLog('langue',`Failed to load locales.json: ${e.message}`)}
      this.supportedLanguages=[config.i18n.defaultLocale];
      config.smartLog('langue','Using minimal fallback languages');
    }

    async _waitForUserData(){
      if(typeof window==='undefined')return;
      const u=(config.i18n&&config.i18n.userData)||{};
      const maxAttempts=typeof u.maxAttempts==='number'?u.maxAttempts:5;
      const intervalMs=typeof u.intervalMs==='number'?u.intervalMs:100;
      const logEvery=Math.max(1,typeof u.logEvery==='number'?u.logEvery:maxAttempts);
      
      config.smartLog('langue','Checking userData availability');
      
      for(let i=0;i<maxAttempts;i++){
        if(window.userData&&typeof window.safeSaveUserPreferences==='function'){
          config.smartLog('win',`userData available after ${i} attempts`);
          return;
        }
        
        if(window.userData){
          config.smartLog('win','userData available, safeSaveUserPreferences will be checked later');
          return;
        }
        
        if(i%logEvery===0&&i>0){
          config.smartLog('langue',`Waiting for userData attempt ${i}/${maxAttempts}`);
        }
        
        await new Promise(r=>setTimeout(r,intervalMs));
      }
      
      config.smartLog('langue',`userData not immediately available, proceeding without it`);
    }

    _logLanguageDetectionSummary() {
      const summary = {
        finalLanguage: this.currentLanguage,
        userDataLanguage: (typeof window !== 'undefined' && window.userData?.settings?.language) || 'none',
        localStorageLanguage: (typeof localStorage !== 'undefined' && localStorage.getItem(this.storageKey)) || 'none',
        browserLanguage: (typeof navigator !== 'undefined' && navigator.language) || 'none',
        browserLanguages: (typeof navigator !== 'undefined' && navigator.languages?.slice(0, 3)) || [],
        supportedLanguages: this.supportedLanguages,
        translationsLoaded: Object.keys(this.translations),
        userDataAvailable: typeof window !== 'undefined' && !!window.userData,
        safeSaveUserPreferencesAvailable: typeof window !== 'undefined' && !!window.safeSaveUserPreferences
      };
      
      config.smartLog('langue', 'Language detection summary', summary);
    }

    async _loadTranslations() {
      const languagesToLoad = [this.currentLanguage];
      if (this.currentLanguage !== this.fallbackLanguage) {
        languagesToLoad.push(this.fallbackLanguage);
      }
      
      config.smartLog('langue', `Loading translations for: ${languagesToLoad.join(', ')}`);
      
      let loadedCount = 0;
      let failedCount = 0;
      
      for (const lang of languagesToLoad) {
        try {
          const translation = await this._loadLanguageWithRetry(lang);
          if (translation) {
            this.translations[lang] = translation;
            loadedCount++;
            config.memoryCache.set(`translation_${lang}`, translation, 3600000);
          } else {
            failedCount++;
          }
        } catch (error) {
          config.smartLog('fail', `Error loading ${lang} translations: ${error.message}`);
          failedCount++;
        }
      }
      
      config.smartLog('win', `Loaded ${loadedCount} translations, ${failedCount} failed`);
    }

    async _loadLanguageWithRetry(lang) {
      const cacheKey = `translation_${lang}`;
      const cached = config.memoryCache.get(cacheKey);
      if (cached) {
        config.smartLog('langue', `Using cached translation for ${lang}`);
        return cached;
      }

      if (this.loadingPromises.has(lang)) {
        config.smartLog('langue', `Waiting for ongoing translation load: ${lang}`);
        return await this.loadingPromises.get(lang);
      }

      const loadPromise = this._loadSingleLanguage(lang);
      this.loadingPromises.set(lang, loadPromise);
      
      try {
        const result = await loadPromise;
        this.loadingPromises.delete(lang);
        return result;
      } catch (error) {
        this.loadingPromises.delete(lang);
        throw error;
      }
    }

    async _loadSingleLanguage(lang) {
      for (let attempt = 0; attempt < config.i18n.retry.max; attempt++) {
        try {
          const response = await this._fetchWithTimeout(
            `${config.i18n.endpoint}${lang}.js?v=${Date.now()}`, 
            config.i18n.timeoutMs
          );
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const code = await response.text();
          return this._parseTranslationFile(code, lang);
          
        } catch (error) {
          if (attempt === config.i18n.retry.max - 1) {
            config.smartLog('fail', `Failed to load ${lang} after ${config.i18n.retry.max} attempts: ${error.message}`);
            return null;
          }
          
          await new Promise(resolve => 
            setTimeout(resolve, config.i18n.retry.delayMs * (attempt + 1))
          );
        }
      }
      
      return null;
    }

    _parseTranslationFile(code, lang) {
      try {
        const tempWindow = {};
        const tempModule = { exports: {} };
        
        const safeCode = code.replace(/require\s*\([^)]+\)/g, '{}');
        
        const wrappedCode = `
          (function(window, module, exports) {
            ${safeCode}
          })(tempWindow, tempModule, tempModule.exports);
        `;
        
        eval(wrappedCode);
        
        const translations = tempWindow[`uiTranslations_${lang}`] || 
                           tempModule.exports || 
                           tempWindow.default ||
                           {};
        
        if (translations && typeof translations === 'object' && Object.keys(translations).length > 0) {
          return translations;
        } else {
          config.smartLog('fail', `${lang} translations object is empty or invalid`);
          return null;
        }
      } catch (error) {
        config.smartLog('fail', `Error parsing ${lang} translations: ${error.message}`);
        return null;
      }
    }

    async _fetchWithTimeout(url, timeoutMs) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(url, { 
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    }

    detectLanguage() {
      if (typeof window !== 'undefined' && window.userData?.settings?.language) {
        const savedLang = window.userData.settings.language;
        if (this.supportedLanguages.includes(savedLang)) {
          config.smartLog('langue', `Language from userData: ${savedLang}`);
          return savedLang;
        }
      }
      
      if (typeof localStorage !== 'undefined') {
        const localStorageLang = localStorage.getItem(this.storageKey);
        if (localStorageLang && this.supportedLanguages.includes(localStorageLang)) {
          config.smartLog('langue', `Language from localStorage: ${localStorageLang}`);
          return localStorageLang;
        }
      }

      if (typeof navigator !== 'undefined') {
        const browserLanguages = [
          navigator.language,           
          ...(navigator.languages || []),
          navigator.userLanguage,       
          navigator.browserLanguage     
        ].filter(Boolean);

        config.smartLog('langue', `Browser languages detected: ${browserLanguages.join(', ')}`);

        for (const fullLang of browserLanguages) {
          if (this.supportedLanguages.includes(fullLang)) {
            config.smartLog('langue', `Browser language match (full): ${fullLang}`);
            return fullLang;
          }
          
          const shortLang = fullLang.split('-')[0];
          if (this.supportedLanguages.includes(shortLang)) {
            config.smartLog('langue', `Browser language match (short): ${shortLang}`);
            return shortLang;
          }
        }
      }

      config.smartLog('langue', `Using fallback language: ${this.fallbackLanguage}`);
      return this.fallbackLanguage;
    }

    async setLanguage(language) {
      if (!this.supportedLanguages.includes(language)) {
        config.smartLog('fail', `Unsupported language: ${language}`);
        return false;
      }

      const previousLanguage = this.currentLanguage;
      this.currentLanguage = language;
      
      config.smartLog('langue', `Changing language from ${previousLanguage} to ${language}`);
      
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, language);
        config.smartLog('langue', `Language saved to localStorage: ${language}`);
      }
      
      if (!this.translations[language]) {
        config.smartLog('langue', `Loading missing translation for ${language}`);
        try {
          const translation = await this._loadLanguageWithRetry(language);
          if (translation) {
            this.translations[language] = translation;
            config.smartLog('win', `Translation loaded for ${language}`);
          }
        } catch (error) {
          config.smartLog('fail', `Failed to load translation for ${language}: ${error.message}`);
        }
      }
      
      if (typeof window !== 'undefined' && window.userData) {
        config.smartLog('langue', 'Saving to userData');
        
        if (!window.userData.settings) {
          window.userData.settings = {};
          config.smartLog('langue', 'Created userData.settings object');
        }
        
        window.userData.settings.language = language;
        config.smartLog('langue', `Language set in userData.settings: ${language}`);
        
        if (typeof window.safeSaveUserPreferences === 'function') {
          try {
            window.safeSaveUserPreferences();
            config.smartLog('win', 'safeSaveUserPreferences() called successfully');
          } catch (error) {
            config.smartLog('fail', `safeSaveUserPreferences() failed: ${error.message}`);
            await this._safeFallbackSaveToServer(language);
          }
        } else {
          config.smartLog('fail', 'safeSaveUserPreferences function not available, trying fallback');
          await this._safeFallbackSaveToServer(language);
        }
      } else {
        config.smartLog('fail', 'userData not available');
      }
      
      this.translatePage();
      this._notifyLanguageChange(language);
      
      config.smartLog('win', `Language change completed: ${previousLanguage} → ${language}`);
      return true;
    }

    _hashPayload(payload) {
      let hash = 0;
      const str = JSON.stringify(payload);
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString();
    }

    async _safeFallbackSaveToServer(language) {
      const payload = {
        ...(typeof window !== 'undefined' && window.userData || {}),
        settings: {
          ...(typeof window !== 'undefined' && window.userData?.settings || {}),
          language: language
        }
      };
      
      const payloadHash = this._hashPayload(payload);
      
      if (this._lastSavedPayloadHash === payloadHash) {
        config.smartLog('langue', 'Payload unchanged, skipping save');
        return;
      }
      
      if (this._saveInProgress) {
        config.smartLog('langue', 'Save already in progress, skipping');
        return;
      }
      
      this._saveInProgress = true;
      config.smartLog('langue', 'Attempting safe fallback save to server');
      
      try {
        if (typeof fetch === 'undefined') {
          throw new Error('fetch not available');
        }
        
        const response = await fetch('/api/save-user-preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.success) {
          this._lastSavedPayloadHash = payloadHash;
          config.smartLog('win', 'Language saved to server via fallback');
        } else {
          config.smartLog('fail', `Server save failed: ${data.message}`);
        }
      } catch (error) {
        config.smartLog('fail', `Fallback save error: ${error.message}`);
      } finally {
        this._saveInProgress = false;
      }
    }

    _fallbackSaveToServer(language) {
      this._safeFallbackSaveToServer(language);
    }

    getCurrentLanguage() {
      return this.currentLanguage;
    }

    getSupportedLanguages() {
      return [...this.supportedLanguages];
    }

    getLanguageNames() {
      return {
        ar: 'العربية', bn: 'বাংলা', cs: 'Čeština', da: 'Dansk', de: 'Deutsch',
        el: 'Ελληνικά', en: 'English', es: 'Español', fi: 'Suomi', fr: 'Français',
        he: 'עברית', hi: 'हिन्दी', id: 'Bahasa Indonesia', it: 'Italiano', ja: '日本語',
        ko: '한국어', lb: 'Lëtzebuergesch', ms: 'Bahasa Melayu', nl: 'Nederlands', no: 'Norsk',
        pl: 'Polski', pt: 'Português', ro: 'Română', ru: 'Русский', sv: 'Svenska',
        sw: 'Kiswahili', th: 'ไทย', tr: 'Türkçe', uk: 'Українська', vi: 'Tiếng Việt', zh: '中文'
      };
    }

    translate(key, params = {}) {
      if (!this.isInitialized) {
        config.smartLog('fail', 'Not initialized, returning key');
        return key;
      }

      const keys = key.split('.');
      let translation = this.translations[this.currentLanguage];

      for (const k of keys) {
        if (translation && typeof translation === 'object' && k in translation) {
          translation = translation[k];
        } else {
          translation = null;
          break;
        }
      }

      if (!translation && this.currentLanguage !== this.fallbackLanguage) {
        let fallback = this.translations[this.fallbackLanguage];
        for (const k of keys) {
          if (fallback && typeof fallback === 'object' && k in fallback) {
            fallback = fallback[k];
          } else {
            fallback = null;
            break;
          }
        }
        translation = fallback;
        if (!translation && this.currentLanguage !== 'en') {
          let enFallback = this.translations['en'];
          for (const k of keys) {
            if (enFallback && typeof enFallback === 'object' && k in enFallback) {
              enFallback = enFallback[k];
            } else {
              enFallback = null;
              break;
            }
          }
          translation = enFallback;
        }
      }

      if (typeof translation !== 'string') {
        config.smartLog('fail', `Translation not found: ${key}`);
        return key;
      }

      return this._interpolate(translation, params);
    }

    _interpolate(text, params) {
      return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return params[key] || match;
      });
    }

    translatePage() {
      if (!this.isInitialized || typeof document === 'undefined') return;

      const elements = document.querySelectorAll('[data-i18n]');
      elements.forEach(element => this._translateElement(element));

      const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
      placeholderElements.forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = this.translate(key);
      });

      const titleElements = document.querySelectorAll('[data-i18n-title]');
      titleElements.forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = this.translate(key);
      });

      const valueElements = document.querySelectorAll('[data-i18n-value]');
      valueElements.forEach(element => {
        const key = element.getAttribute('data-i18n-value');
        element.value = this.translate(key);
      });
    }

    _translateElement(element) {
      const key = element.getAttribute('data-i18n');
      const params = this._getElementParams(element);
      const translation = this.translate(key, params);
      
      if (element.tagName === 'INPUT' && (element.type === 'button' || element.type === 'submit')) {
        element.value = translation;
      } else {
        element.textContent = translation;
      }
    }

    _getElementParams(element) {
      const paramsAttr = element.getAttribute('data-i18n-params');
      if (!paramsAttr) return {};
      
      try {
        return JSON.parse(paramsAttr);
      } catch (error) {
        config.smartLog('fail', `Invalid i18n params: ${paramsAttr}`);
        return {};
      }
    }

    _setupLanguageObserver() {
      if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (element.hasAttribute && element.hasAttribute('data-i18n')) {
                this._translateElement(element);
              }
              
              if (element.querySelectorAll) {
                const i18nElements = element.querySelectorAll('[data-i18n]');
                i18nElements.forEach(el => this._translateElement(el));

                const placeholderElements = element.querySelectorAll('[data-i18n-placeholder]');
                placeholderElements.forEach(el => {
                  const key = el.getAttribute('data-i18n-placeholder');
                  el.placeholder = this.translate(key);
                });
              }
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    onLanguageChange(callback) {
      this.observers.push(callback);
    }

    offLanguageChange(callback) {
      const index = this.observers.indexOf(callback);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    }

    _notifyLanguageChange(language) {
      this.observers.forEach(callback => {
        try {
          callback(language);
        } catch (error) {
          config.smartLog('fail', `Error in language change observer: ${error.message}`);
        }
      });
    }

    createLanguageSelector(containerId, options = {}) {
      if (typeof document === 'undefined') return;

      const container = document.getElementById(containerId);
      if (!container) {
        config.smartLog('fail', `Container not found: ${containerId}`);
        return;
      }

      const select = document.createElement('select');
      select.className = options.className || 'language-selector';
      select.style.cssText = options.style || '';

      const languageNames = this.getLanguageNames();
      this.supportedLanguages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = languageNames[lang];
        option.selected = lang === this.currentLanguage;
        select.appendChild(option);
      });

      select.addEventListener('change', (e) => {
        this.setLanguage(e.target.value);
      });

      container.appendChild(select);
      return select;
    }

    formatMessage(key, type = 'info') {
      const message = this.translate(key);
      return {
        text: message,
        type: type,
        language: this.currentLanguage
      };
    }

    getNavigationTranslations() {
      return this.translate('navigation') || {};
    }

    getDashboardTranslations() {
      return this.translate('dashboard') || {};
    }

    getCommonTranslations() {
      return this.translate('common') || {};
    }

    getMessagesTranslations() {
      return this.translate('messages') || {};
    }

    updateComponentTexts(componentName) {
      setTimeout(() => {
        this.translatePage();
      }, 100);
    }

    syncLanguagePreferences() {
      if (typeof window !== 'undefined' && window.userData?.settings?.language) {
        const userLang = window.userData.settings.language;
        if (this.supportedLanguages.includes(userLang) && userLang !== this.currentLanguage) {
          this.setLanguage(userLang);
        }
      }
    }

    reset() {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.storageKey);
      }
      this.currentLanguage = this.detectLanguage();
      this.translatePage();
    }

    debug() {
      return {
        currentLanguage: this.currentLanguage,
        supportedLanguages: this.supportedLanguages,
        isInitialized: this.isInitialized,
        translationsLoaded: Object.keys(this.translations),
        observersCount: this.observers.length,
        boot: this._initializationPromise !== null,
        supportedLanguagesLoaded: this._supportedLanguagesLoaded,
        saveInProgress: this._saveInProgress,
        lastSavedHash: this._lastSavedPayloadHash,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        userData: typeof window !== 'undefined' && window.userData ? 'available' : 'not available'
      };
    }

    exportDebugToJSON(filename = null) {
      const debugData = this.debug();
      const jsonString = JSON.stringify(debugData, null, 2);
      
      if (typeof document !== 'undefined') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `uimanager-debug-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        config.smartLog('win', `Debug data exported to ${a.download}`);
        return true;
      }
      
      return jsonString;
    }

    getDebugJSON() {
      return JSON.stringify(this.debug(), null, 2);
    }
  }

  if (typeof window !== 'undefined') {
    const uiManager = new UIManager();
    window.uiManager = uiManager;
    
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          uiManager.initialize().then(() => {
            uiManager.translatePage();
          });
        });
      } else {
        uiManager.initialize().then(() => {
          uiManager.translatePage();
        });
      }
    }
  }

  return UIManager;
}));