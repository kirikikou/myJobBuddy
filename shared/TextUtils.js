class TextUtils {
    static stripHtml(html) {
      if (!html || typeof html !== 'string') return '';
      
      return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-zA-Z0-9]+;/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  
    static truncate(text, length = 100, suffix = '...') {
      if (!text || typeof text !== 'string') return '';
      if (text.length <= length) return text;
      
      const truncated = text.substring(0, length - suffix.length);
      const lastSpace = truncated.lastIndexOf(' ');
      
      if (lastSpace > 0 && lastSpace > length * 0.8) {
        return truncated.substring(0, lastSpace) + suffix;
      }
      
      return truncated + suffix;
    }
  
    static slugify(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .toLowerCase()
        .trim()
        .replace(/[àáâäçèéêëìíîïñòóôöùúûüýÿæœ]/g, match => {
          const map = {
            'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a',
            'ç': 'c',
            'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
            'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
            'ñ': 'n',
            'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o',
            'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
            'ý': 'y', 'ÿ': 'y',
            'æ': 'ae', 'œ': 'oe'
          };
          return map[match] || match;
        })
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
  
    static extractKeywords(text, language = 'en', limit = 10) {
      if (!text || typeof text !== 'string') return [];
      
      const cleaned = this.stripHtml(text).toLowerCase();
      const words = cleaned.match(/\b[a-z]{3,}\b/g) || [];
      
      const stopWords = this.getStopWords(language);
      const filtered = words.filter(word => !stopWords.includes(word));
      
      const frequency = {};
      filtered.forEach(word => {
        frequency[word] = (frequency[word] || 0) + 1;
      });
      
      return Object.entries(frequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, limit)
        .map(([word, count]) => ({ word, count }));
    }
  
    static getStopWords(language) {
      const stopWords = {
        en: ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now'],
        fr: ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir', 'que', 'pour', 'dans', 'ce', 'son', 'une', 'sur', 'avec', 'ne', 'se', 'pas', 'tout', 'plus', 'par', 'grand', 'ou', 'si', 'les', 'deux', 'même', 'lui', 'nous', 'comme', 'après', 'sans', 'autre', 'très', 'bien', 'où', 'encore', 'aussi', 'leur', 'temps', 'vie', 'aller', 'savoir', 'faire', 'voir', 'donner', 'prendre', 'venir', 'falloir', 'devoir', 'dire', 'rester', 'vouloir', 'parler', 'demander', 'chercher', 'passer', 'regarder', 'trouver', 'porter', 'croire'],
        es: ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'una', 'del', 'los', 'al', 'más', 'pero', 'sus', 'me', 'yo', 'todo', 'muy', 'mi', 'puede', 'bien', 'está', 'ya', 'sí', 'así', 'donde', 'cuando', 'como', 'estar', 'tener', 'hacer', 'poder', 'decir', 'este', 'ir', 'otro', 'ese', 'poco', 'mismo', 'también', 'año', 'algo', 'tiempo', 'caso', 'nada', 'hombre', 'tanto', 'mujer', 'agua', 'parte', 'vida', 'hora', 'mundo', 'país', 'trabajo']
      };
      
      return stopWords[language] || stopWords.en;
    }
  
    static removeAccents(text) {
      if (!text || typeof text !== 'string') return '';
      
      const accentMap = {
        'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A', 'Å': 'A',
        'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
        'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
        'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
        'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
        'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
        'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O', 'Ø': 'O',
        'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
        'Ù': 'U', 'Ú': 'U', 'Û': 'U', 'Ü': 'U',
        'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
        'Ý': 'Y', 'ý': 'y', 'ÿ': 'y',
        'Ñ': 'N', 'ñ': 'n',
        'Ç': 'C', 'ç': 'c',
        'Æ': 'AE', 'æ': 'ae',
        'Œ': 'OE', 'œ': 'oe'
      };
      
      return text.replace(/[À-ÿ]/g, match => accentMap[match] || match);
    }
  
    static normalizeWhitespace(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/ +/g, ' ')
        .replace(/\n +/g, '\n')
        .replace(/ +\n/g, '\n')
        .replace(/\n+/g, '\n')
        .trim();
    }
  
    static extractJobDescription(text, maxLength = 200) {
      if (!text || typeof text !== 'string') return '';
      
      const cleaned = this.stripHtml(text)
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleaned.length <= maxLength) return cleaned;
      
      const truncated = cleaned.substring(0, maxLength);
      const lastSentence = truncated.lastIndexOf('.');
      const lastSpace = truncated.lastIndexOf(' ');
      
      if (lastSentence > maxLength * 0.7) {
        return truncated.substring(0, lastSentence + 1);
      }
      
      if (lastSpace > maxLength * 0.8) {
        return truncated.substring(0, lastSpace) + '...';
      }
      
      return truncated + '...';
    }
  
    static countWords(text) {
      if (!text || typeof text !== 'string') return 0;
      
      const cleaned = this.stripHtml(text).trim();
      if (!cleaned) return 0;
      
      return cleaned.split(/\s+/).length;
    }
  
    static estimateReadingTime(text, wordsPerMinute = 200) {
      const wordCount = this.countWords(text);
      const minutes = Math.ceil(wordCount / wordsPerMinute);
      return Math.max(1, minutes);
    }
  
    static highlightKeywords(text, keywords, className = 'highlight') {
      if (!text || !keywords || !Array.isArray(keywords)) return text;
      
      let highlightedText = text;
      
      keywords.forEach(keyword => {
        if (!keyword || typeof keyword !== 'string') return;
        
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi');
        
        highlightedText = highlightedText.replace(regex, match => 
          `<span class="${className}">${match}</span>`
        );
      });
      
      return highlightedText;
    }
  
    static extractEmails(text) {
      if (!text || typeof text !== 'string') return [];
      
      const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const matches = text.match(emailRegex) || [];
      
      return [...new Set(matches.map(email => email.toLowerCase()))];
    }
  
    static extractPhones(text) {
      if (!text || typeof text !== 'string') return [];
      
      const phoneRegex = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
      const matches = text.match(phoneRegex) || [];
      
      return [...new Set(matches)];
    }
  
    static extractUrls(text) {
      if (!text || typeof text !== 'string') return [];
      
      const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
      const matches = text.match(urlRegex) || [];
      
      return [...new Set(matches)];
    }
  
    static calculateTextComplexity(text) {
      if (!text || typeof text !== 'string') return 0;
      
      const cleaned = this.stripHtml(text);
      const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const words = cleaned.split(/\s+/).filter(w => w.length > 0);
      
      if (sentences.length === 0 || words.length === 0) return 0;
      
      const avgWordsPerSentence = words.length / sentences.length;
      const avgCharsPerWord = words.reduce((sum, word) => sum + word.length, 0) / words.length;
      
      const complexityScore = (avgWordsPerSentence * 0.6) + (avgCharsPerWord * 0.4);
      
      return Math.min(10, Math.max(1, Math.round(complexityScore)));
    }
  
    static generateExcerpt(text, length = 160, preserveWords = true) {
      if (!text || typeof text !== 'string') return '';
      
      const cleaned = this.stripHtml(text).trim();
      if (cleaned.length <= length) return cleaned;
      
      if (!preserveWords) {
        return cleaned.substring(0, length - 3) + '...';
      }
      
      const truncated = cleaned.substring(0, length - 3);
      const lastSpace = truncated.lastIndexOf(' ');
      
      if (lastSpace > length * 0.8) {
        return truncated.substring(0, lastSpace) + '...';
      }
      
      return truncated + '...';
    }
  
    static cleanFileName(fileName) {
      if (!fileName || typeof fileName !== 'string') return '';
      
      return fileName
        .replace(/[^a-zA-Z0-9\-_.]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
    }
  
    static formatBytes(bytes, decimals = 2) {
      if (bytes === 0) return '0 Bytes';
      
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
  
    static isValidJson(text) {
      if (!text || typeof text !== 'string') return false;
      
      try {
        JSON.parse(text);
        return true;
      } catch (error) {
        return false;
      }
    }
  
    static sanitizeForHtml(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  
    static capitalizeWords(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text.replace(/\b\w/g, letter => letter.toUpperCase());
    }
  
    static camelCase(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
    }
  
    static kebabCase(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
    }
  
    static snakeCase(text) {
      if (!text || typeof text !== 'string') return '';
      
      return text
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
    }
  }
  
  module.exports = TextUtils;