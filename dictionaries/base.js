// Structure de base commune à tous les dictionnaires de langue
const BaseDictionary = {
  // Structure standard pour chaque catégorie
  showMore: {
    level1_specific: [],    // Sélecteurs très spécifiques
    level2_text: {          // Validation par texte
      exact: [],            // Textes exacts
      patterns: [],         // Regex patterns
      maxLength: 25         // Longueur max du texte
    },
    level3_fallback: []     // Fallback (à éviter)
  },
  
  cookies: {
    level1_frameworks: {},  // IDs/classes des frameworks connus
    level2_text: {
      primary: [],          // Textes principaux
      secondary: [],        // Textes secondaires
      maxLength: 25
    }
  },
  
  pagination: {
    level1_specific: [],
    level2_text: {
      next: [],
      previous: [],
      numbers: []
    }
  },
  
  filters: {
    departments: [],
    locations: [],
    types: [],
    keywords: []
  },
  
  jobTerms: [],
  
  navigation: {
    career: [],
    apply: []
  }
};

module.exports = BaseDictionary;