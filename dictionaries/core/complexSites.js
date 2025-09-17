module.exports = {
    ats_platforms: [
      'workday',
      'lever.co',
      'greenhouse.io',
      'recruitee',
      'bamboohr',
      'icims',
      'workable',
      'jazzhr',
      'personio',
      'smartrecruiters',
      'taleo',
      'jobvite',
      'teamtailor',
      'ashby',
      'successfactors',
      'ultipro',
      'ukg',
      'applytojob',
      'brassring',
      'jobdiva',
      'bullhorn',
      'cornerstone'
    ],
  
    job_aggregators: [
      'linkedin.com',
      'indeed',
      'glassdoor',
      'monster.com',
      'careerbuilder.com'
    ],
  
    getAllComplexSites() {
      return [...this.ats_platforms, ...this.job_aggregators];
    },
  
    isComplexSite(url) {
      const urlLower = url.toLowerCase();
      return this.getAllComplexSites().some(domain => urlLower.includes(domain));
    },
  
    isATSPlatform(url) {
      const urlLower = url.toLowerCase();
      return this.ats_platforms.some(domain => urlLower.includes(domain));
    },
  
    isJobAggregator(url) {
      const urlLower = url.toLowerCase();
      return this.job_aggregators.some(domain => urlLower.includes(domain));
    }
  };