module.exports = {
    patterns: {
      ar: ['.sa/', '.ae/', '.qa/', '/ar/', 'lang=ar', 'language=arabic'],
      bn: ['.bd/', '/bn/', 'lang=bn', 'language=bengali'],
      cs: ['.cz/', '/cs/', 'lang=cs', 'language=czech'],
      da: ['.dk/', '/da/', 'lang=da', 'language=danish'],
      de: ['.de/', '.at/', '.ch/', '/de/', 'lang=de', 'sprache=de'],
      el: ['.gr/', '/el/', '/gr/', 'lang=el', 'language=greek'],
      en: ['.com/', '.org/', '.net/', '.uk/', '.us/', '.ca/', '.au/', '.nz/', '/en/', 'lang=en', 'language=en'],
      es: ['.es/', '.mx/', '.ar/', '.co/', '.cl/', '.pe/', '/es/', 'lang=es', 'idioma=es'],
      fi: ['.fi/', '/fi/', 'lang=fi', 'kieli=fi'],
      fr: ['.fr/', '.be/', '.ca/', '/fr/', 'lang=fr', 'langue=fr'],
      he: ['.il/', '/he/', 'lang=he', 'language=hebrew'],
      hi: ['.in/', '/hi/', 'lang=hi', 'language=hindi'],
      id: ['.id/', '/id/', 'lang=id', 'language=indonesian'],
      it: ['.it/', '/it/', 'lang=it', 'lingua=it'],
      ja: ['.jp/', '/ja/', 'lang=ja', 'language=japanese'],
      ko: ['.kr/', '/ko/', 'lang=ko', 'language=korean'],
      lb: ['.lu/', '/lb/', 'lang=lb', 'language=luxembourgish'],
      ms: ['.my/', '.sg/', '/ms/', 'lang=ms', 'language=malay'],
      nl: ['.nl/', '.be/', '/nl/', 'lang=nl', 'taal=nl'],
      no: ['.no/', '/no/', 'lang=no', 'sprak=no'],
      pl: ['.pl/', '/pl/', 'lang=pl', 'jezyk=pl'],
      pt: ['.pt/', '.br/', '/pt/', 'lang=pt', 'idioma=pt'],
      ro: ['.ro/', '/ro/', 'lang=ro', 'language=romanian'],
      ru: ['.ru/', '.by/', '.kz/', '/ru/', 'lang=ru', 'language=russian'],
      sv: ['.se/', '/sv/', 'lang=sv', 'sprak=sv'],
      sw: ['.ke/', '.tz/', '/sw/', 'lang=sw', 'language=swahili'],
      th: ['.th/', '/th/', 'lang=th', 'language=thai'],
      tr: ['.tr/', '/tr/', 'lang=tr', 'language=turkish'],
      uk: ['.ua/', '/uk/', 'lang=uk', 'mova=uk'],
      vi: ['.vn/', '/vi/', 'lang=vi', 'language=vietnamese'],
      zh: ['.cn/', '.tw/', '.hk/', '.sg/', '/zh/', '/cn/', 'lang=zh', 'language=chinese']
    },
  
    getLanguageFromURL(url) {
      const urlLower = url.toLowerCase();
      
      for (const [lang, patterns] of Object.entries(this.patterns)) {
        if (patterns.some(pattern => urlLower.includes(pattern))) {
          return lang;
        }
      }
      
      return null;
    },
  
    getPatternsForLanguage(lang) {
      return this.patterns[lang] || [];
    },
  
    getAllSupportedLanguages() {
      return Object.keys(this.patterns);
    },
  
    isCountrySpecific(url, lang) {
      const urlLower = url.toLowerCase();
      const patterns = this.patterns[lang] || [];
      
      return patterns
        .filter(pattern => pattern.startsWith('.') && pattern.length <= 4)
        .some(pattern => urlLower.includes(pattern));
    }
  };