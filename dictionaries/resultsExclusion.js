const config = require('../config');

const exclusionPatterns = {
  containsWords: [
    '@',
    'privacy policy',
    'our team',
    'privacy and cookies policy',
    'cookies policy',
    'privacy-policy',
    'filter by',
  ],
  
  exactTitles: [
    'team',
    'facebook',
    'instagram',
    'linkedin',
    'vancouver',
    'toronto',
    'la',
    'los angeles',
    'chicago',
    'new york',
    'new york city',
    'ny',
    'montreal',
    'quebec',
    'about',
    'contact',
    'data privacy',
    'data-privacy',
    'paris',
    'london',
    'munich',
    'tokyo',
    'japan',
    'china',
    'mumbai',
    'pune',
    'shenzhen',
    'privacy-policy',
    'france',
    'england',
    'canada',
    'usa',
    'united kingdom',
    'united states',
    'germany',
    'italy',
    'spain',
    'espagne',
    'france',
    'angleterre',
    'allemagne',
    'dutch',
    'pays bas',
    'hollande',
    'italie',
    'mexico',
    'bournemouth',
    'manchester',
    'montpellier',
    'berlin',
    'munchen',
    'kyoto',
    'lyon',
    'marseille',
    'lille',
    'bordeaux',
    'nantes',
    'angers',
    'rome',
    'turin',
    'torino',
    'legal notice',
    'england',
    'privacy notice',
    'workable',
    'AccessibilitySVGs not supported by this browser.',
    'Tell us about yourself!Rodeo FX - Parlez nous de vous / Tell us about yourselfMontreal, Quebec, Toronto, Paris, Los Angeles, OTHER',
    'audio',
    'salut',
    'start',
    'protomaps',
    'Data & Privacy',
    'Applicant tracking system by Teamtailor',
    'Candidate Connect login',
    'Careers',
    'Create alert',
    'Commercial Terms',
    'Standard Terms & Conditions',
    'Terms & Conditions',
    'Environmental Policy',
    'Drama',
    'Documentaries',
    'Games',
    'DIT & LAB',
    'Academy',
    'Innovation',
    'Location & Contact',
    'feature animation',
    'feature film',
    'CA Privacy Rights',
    'Ad Choices',
    'Your Privacy Choices',
    'Gallery',
    'Learning',
    'Challenges',
    'MarketplaceSale',
    'Schools and Training Centers',
    'PrintsSale',
    'Post a Job',
    'Find an Artist',
    'Find a Studio',
    'Find a Gallery',
    'About ArtStation',
    'About Company',
    'Sign Up with Epic Games',
    'Sign Up',
    'Sign In with Epic Games',
    'Sign In',
    'Forgot password?',
    'Read New Terms',
    'francais',
    'anglais',
    'italien',
    'espagnol',
    'Montréal, QC',
    'Toronto, ON',
    'Paris, France',
    'Los Angeles, CA',
    'OTHER',
    'Mumbai, Maharashtra',
    'Pune, Maharashtra',
    'Shenzhen, Guangdong',
    'Melbourne, Victoria',
    'Chicago, IL',
    'New York, NY',
    'San Francisco, CA',
    'Access VFX',
    'Speakers For Schools',
    'CA Privacy Rights',
    'OpenStreetMap',
    'Feature Series',
    'All Roles',
    'join us',
    'EMPLOYMENT OPPORTUNITIES',
    'APPLICATION TIPS',
    'EMPLOYEE RESOURCES',
    'Back',
    'twitter',
    'indeed',
    'vimeo',
    'youtube',
    'x',
    'behance',
    'signup',
    'skype',
    'signin',
    'subscribe',
    'Terms and Conditions',
    'rss',
    'work',
    'services',
    'news',
    'a propos',
    'equipe',
    'notre equipe',
    'actualite',
    'actualites',
    'Bangalore',
    'tiktok',
    'tik-tok',
    'tik tok',
    'archive',
    'back to top',
    'download',
    'cookies and similar technologies',
    'career',
    'locations',
    'kuala lumpur',
    'xiamen',
    'meet the team',
    'your candidate journey',
    'main',
    'bali',
    'labs',
    'legal & regulatory disclosures',
    'ai guidelines',
    'case studies',
    'glendale, california',
    'enterprise partner success manager',
    'brands',
    'faq',
    'programs',
    'recruitment fraud alert',
    'equal opportunity employer',
    'accessibility statement',
    'spanish',
    'french',
    'german',
    'latin america',
    'europe',
    'europe, the middle east & africa',
    'asia',
    'pacific',
    'asia pacific',
    'asia-pacific',
    'africa',
    'framestorehomepage',
    'return to the framestore website',
    '10,000 black interns',
    'see available positions',
    'applicant tracking system by teamtailor',
    'about us',
    'legal information',
    'carriere',
    'contactez-nous',
    '[email protected]',
    'conditions d\'utilisation',
    'parlons-nous ! parlons-nous',
    'environnement de travail',
    'mes annonces',
    'podcasts',
    'Tell us about yourself',
    'Tell us about yourself!',
    'parlez-nous de vous!',
    'awards',
    'privacy preference center',
    'back to all positions',
    'back to all projects',
    'espace nouvelles',
    'contact us',
    'contact us!',
    'close search',
    'skip to main content',
    'join the team',
    'legal notices',
    'obtain further informaiton',
    'obtain further information.',
    'search',
    'stay in touch',
    'contactcontact',
    'teamteam',
    'aboutusaboutus',
    'careerscareers',
    'privacy',
    'legal',
    'all jobs',
  ]
};

function normalizeText(text) {
  if (!text) return '';

  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[àáâãäåæ]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõöø]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c');
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function calculateSimilarityScore(jobTitle, linkText) {
  const normalizedJobTitle = normalizeText(jobTitle);
  const normalizedLinkText = normalizeText(linkText);

  if (normalizedLinkText.includes(normalizedJobTitle)) {
    return 100;
  }

  const jobWords = normalizedJobTitle.split(/\s+/).filter(word => word.length > 2);
  const linkWords = normalizedLinkText.split(/\s+/).filter(word => word.length > 2);

  if (jobWords.length === 0) return 0;

  let bestSequenceScore = 0;

  for (let i = 0; i <= linkWords.length - jobWords.length; i++) {
    const sequence = linkWords.slice(i, i + jobWords.length).join(' ');
    const distance = levenshteinDistance(normalizedJobTitle, sequence);
    const maxLength = Math.max(normalizedJobTitle.length, sequence.length);
    const similarity = ((maxLength - distance) / maxLength) * 100;
    bestSequenceScore = Math.max(bestSequenceScore, similarity);
  }

  let exactWordMatches = 0;
  let partialWordMatches = 0;

  for (const jobWord of jobWords) {
    let bestWordMatch = 0;
    
    for (const linkWord of linkWords) {
      if (linkWord === jobWord) {
        exactWordMatches++;
        bestWordMatch = 100;
        break;
      } else if (linkWord.includes(jobWord) || jobWord.includes(linkWord)) {
        const distance = levenshteinDistance(jobWord, linkWord);
        const maxLength = Math.max(jobWord.length, linkWord.length);
        const similarity = ((maxLength - distance) / maxLength) * 100;
        bestWordMatch = Math.max(bestWordMatch, similarity);
      }
    }
    
    if (bestWordMatch >= 70) {
      partialWordMatches++;
    }
  }

  const wordMatchScore = ((exactWordMatches * 2 + partialWordMatches) / (jobWords.length * 2)) * 100;

  return Math.max(bestSequenceScore, wordMatchScore);
}

function fuzzyMatchJobTitle(jobTitle, linkText, threshold = 80) {
  if (!jobTitle || !linkText) return false;

  const score = calculateSimilarityScore(jobTitle, linkText);
  return score >= threshold;
}

function shouldExcludeResult(linkText, linkUrl) {
  if (!linkText && !linkUrl) return false;

  const textNormalized = normalizeText(linkText || '');
  const urlNormalized = normalizeText(linkUrl || '');

  for (const word of exclusionPatterns.containsWords) {
    const wordNormalized = normalizeText(word);
    if (textNormalized.includes(wordNormalized) || urlNormalized.includes(wordNormalized)) {
      return true;
    }
  }

  for (const exactTitle of exclusionPatterns.exactTitles) {
    const titleNormalized = normalizeText(exactTitle);
    if (textNormalized === titleNormalized) {
      return true;
    }
  }

  return false;
}

function filterJobResults(results) {
  if (!Array.isArray(results)) return results;

  return results.filter(result => {
    const shouldExclude = shouldExcludeResult(result.title, result.url);
    
    if (shouldExclude) {
      config.smartLog('steps', `Filtered out: "${result.title}" from ${result.source}`);
    }
    
    return !shouldExclude;
  });
}

function filterJobResultsWithFuzzyMatching(results, jobTitles, threshold = 80) {
  if (!Array.isArray(results) || !Array.isArray(jobTitles)) return results;

  const filteredByExclusion = filterJobResults(results);

  const fuzzyFilteredResults = filteredByExclusion.filter(result => {
    let hasValidMatch = false;
    
    for (const jobTitle of jobTitles) {
      if (fuzzyMatchJobTitle(jobTitle, result.title, threshold)) {
        config.smartLog('win', `"${result.title}" matches "${jobTitle}" (score >= ${threshold}%)`);
        hasValidMatch = true;
        break;
      }
    }
    
    if (!hasValidMatch) {
      config.smartLog('steps', `"${result.title}" does not match any job title with ${threshold}% threshold`);
    }
    
    return hasValidMatch;
  });

  return fuzzyFilteredResults;
}

module.exports = {
  exclusionPatterns,
  shouldExcludeResult,
  filterJobResults,
  fuzzyMatchJobTitle,
  calculateSimilarityScore,
  filterJobResultsWithFuzzyMatching
};