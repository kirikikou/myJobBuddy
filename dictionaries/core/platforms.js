module.exports = {
  knownJobPlatforms: [
    { 
      name: 'Jobvite', 
      patterns: ['jobvite.com', '/jobvite/', 'jobs.jobvite.com', 'app.jobvite.com', 'hire.jobvite.com'],
      indicators: [
        'jv-careersite', 'data-careersite', 'jobvite-careers-iframe', 'jv-job-list', 'jv-', 'jobvite-widget',
        'jv-desktop', 'jv-page-jobs', 'ng-app="jv.careersite.desktop.app"', 'jv.careersite.desktop.app',
        'jv-button-primary', 'jv-search-form', 'jv-wrapper', 'jv-page-header', 'jv-form-field',
        'jv-job-list-name', 'jv-job-list-location'
      ],
      iframeMethod: true,
      apiPatterns: ['/CompanyJobs/Xml', '/api/v2/jobs', 'jvWebApi', '/jobvite/api', '/jv/api']
    },
    { 
      name: 'Recruitee', 
      patterns: ['recruitee.com', 'd10zminp1cyta8.cloudfront.net', 'recruitee-careers', '.recruitee.com'],
      indicators: ['RTWidget', 'recruitee-careers-widget', 'recruitee-job-list', 'recruitee-offers', 'data-recruitee', 'recruitee-embed', 'rt-widget', 'rt-job-list', 'rt-careers'],
      directMethod: true,
      apiPatterns: ['/api/offers/public', '/api/offers', '/api/v1/offers']
    },
    { 
      name: 'BambooHR', 
      patterns: ['bamboohr.com', '.bamboohr.com', 'bamboo.hr'],
      indicators: [
        'BambooHR-ATS-Jobs', 'BambooHR-ATS-Jobs-Item', 'BambooHR-ATS-Jobs-List', 
        'BambooHR-ATS-Department', 'BambooHR-ATS-Department-List', 'BambooHR-ATS-Department-Header',
        'BambooHR-ATS-Location', 'BambooHR-ATS-board', 'BambooHR-ATS-Department-Item',
        'block-bamboo-hr', 'bamboo-app', 'bamboo-hr-container', 'bamboo-datafeed',
        'bamboo-ats', 'bamboohr-jobs', 'bamboohr-embed', 'bamboohr-widget',
        'BambooHR', 'bamboo-hr', 'bamboohr-ats-jobs', 'bamboohr-ats-department',
        'bamboohr.com/jobs', 'bamboohr.com/careers', 'bamboohr.com/jobs/embed',
        '.bamboohr.com/careers/', '.bamboohr.com/jobs/',
        'bamboo-hr-jobs', 'bamboohr-api', 'bamboo-jobs-api'
      ],
      iframeMethod: true,
      apiPatterns: ['/jobs/embed', '/jobs/api', '/careers/api', '/jobs/embed2.php']
    },
    {
      name: 'Powershift',
      patterns: ['powershift.co.uk', 'powered by powershift'],
      indicators: [
        'powered by powershift', 'powershift.co.uk', 'powershift-main.js', 'powershift-scripts',
        'powershift.js', 'powershift-styles', 'powershift-widget',
        'block-bamboo-hr', 'bamboo-app', 'bamboo-datafeed'
      ],
      directMethod: true,
      apiPatterns: ['/jobs/api', '/careers/api']
    },
    { 
      name: 'Lever', 
      patterns: ['lever.co', 'jobs.lever.co', '.lever.co'],
      indicators: [
        'lever-jobs', 'lever-application', 'lever-postings', 'lever-careers', 
        'lever-careers-embed', 'Jobs powered by', 'lever.co/job-seeker-support',
        'Location typeAll', 'Work typeAll', 'TeamAll', 'workplaceType=',
        'department=', 'commitment=', 'location=', 'team='
      ],
      directMethod: true,
      apiPatterns: ['/_postings', '/v0/postings', '/v1/postings']
    },
    { 
      name: 'Workday', 
      patterns: ['workday.com', 'myworkday.com', '.wd5.myworkdayjobs.com', '.wd3.myworkdayjobs.com', '.wd1.myworkdayjobs.com'],
      indicators: ['workday-jobs', 'wd-', 'WLWO', 'WLLC', 'workday-application', 'workdayjobs'],
      iframeMethod: true,
      apiPatterns: ['/wday/cxs', '/REST/recruiting', '/services/recruiting']
    },
    { 
      name: 'Greenhouse', 
      patterns: ['greenhouse.io', 'boards.greenhouse.io', 'job-boards.greenhouse.io', 'api.greenhouse.io'],
      indicators: ['greenhouse-jobs', 'posting', 'opening', 'gh-', 'greenhouse-board'],
      directMethod: true,
      apiPatterns: ['/embed/job_board', '/api/job_board', '/v1/boards']
    },
    {
      name: 'ZohoRecruit',
      patterns: [
        'zohorecruit.com', '.zohorecruit.com', '/zohorecruit/',
        'recruit.zoho.com', 'recruit.zoho.eu', 'recruit.zoho.in'
      ],
      indicators: [
        'zohorecruit', 'zohocorp', 'zoho-recruit', 'zoho_recruit', 'zr-',
        'recruit-widget', 'zoho-careers', 'zr-job-list', 'zr-job-item', 'zr-apply',
        'zoho-job-board', 'zrwidget', 'zr-container', 'zohoform', 'zoho-form',
        'zr-postings', 'recruit-postings', 'zoho-application', 'zr-career-site',
        'powered by zoho recruit', 'zoho recruit', 'zr-iframe', 'zohoRecruit', 'ZohoRecruit'
      ],
      directMethod: true,
      iframeMethod: true,
      apiPatterns: [
        '/jobs/api', '/careers/api', '/recruit/api', '/jobs.json', '/postings.json',
        '/api/jobs', '/api/postings', '/zohorecruit/api', '/zr/api',
        '/careers/feed', '/jobs/feed'
      ]
    },
    { 
      name: 'Taleo', 
      patterns: ['taleo.net', 'tbe.taleo.net', 'oracle.taleo.net'],
      indicators: ['taleo-jobs', 'requisition', 'tbe-', 'taleo-careersection'],
      iframeMethod: true,
      apiPatterns: ['/careersection', '/dispatcher', '/taleoservices']
    },
    { 
      name: 'Smartrecruiters', 
      patterns: [
        'smartrecruiters.com', 'jobs.smartrecruiters.com', 'careers.smartrecruiters.com',
        'smartrecruiterscareers.com', 'attrax.co.uk', 'smartattrax'
      ],
      indicators: [
        'smartrecruiters-jobs', 'sr-job', 'sr-apply', 'smartrecruiters-widget',
        'smartrecruiters-careers', 'smartrecruiters attrax', 'smartrecruiters.com',
        'attrax.co.uk', 'smartattrax', 'powered by smartrecruiters',
        'sr-job-board', 'smartrecruiters.com/embed', 'smartrecruiters-application',
        'smartrecruiters-portal', 'sr-widget', 'smartrecruiters-iframe',
        'jobs.smartrecruiters.com', 'careers.smartrecruiters.com', 'smartrecruiterscareers.com'
      ],
      directMethod: true,
      apiPatterns: [
        '/api/v1/jobs', '/api/public/jobs', '/widget/api',
        '/api/v1/postings', '/api/postings', '/smartrecruiters/api'
      ]
    },
    { 
      name: 'Brassring', 
      patterns: ['brassring.com', 'kenexa.brassring.com', 'ibm.brassring.com'],
      indicators: ['brassring-jobs', 'kenexa', 'tgwebhost', 'brassring-gateway'],
      iframeMethod: true,
      apiPatterns: ['/TGWebHost', '/TGNewUI', '/TgNewUI']
    },
    { 
      name: 'ADP', 
      patterns: [
        'adp.com', 'recruiting.adp.com', 'workforcenow.adp.com',
        'jobs.adp.com', '.adp.com/jobs', '.adp.com/careers',
        'adp.com/en/jobs', 'workforcenow.adp.com/mascsr'
      ],
      indicators: [
        'adp-jobs', 'adp-recruiting', 'wfn-jobs', 'adp-workforce',
        'workforcenow.adp.com', 'recruiting.adp.com', 'jobs.adp.com',
        '/mascsr', '/selfservice', 'adp.com', 'adp-portal', 'adp-application',
        'workforce now', 'adp workforce', 'adp-careers', 'adp-jobs-widget',
        'adp-job-list', 'adp-job-board', 'adp-recruitment', 'adp-hiring',
        'adp-postings', 'workforcenow', 'workforce-now', 'adp-talent', 'adp-hr',
        'mascsr/default/mdf/recruitment', 'selectedMenuKey=CareerCenter',
        'selectedMenuKey=CurrentOpenings', 'cxs.adp.com', 'adp-embed',
        'adp-iframe', 'powered by adp'
      ],
      iframeMethod: true,
      directMethod: true,
      apiPatterns: [
        '/mascsr', '/selfservice', '/recruiting', '/api/jobs',
        '/mascsr/api/jobs', '/selfservice/api/jobs', '/recruiting/api/jobs',
        '/api/v1/jobs', '/api/v2/jobs', '/api/postings', '/jobs.json',
        '/api/careers', '/careers.json', '/mascsr/default/mdf/recruitment',
        '/workforcenow/api'
      ]
    },
    { 
      name: 'iCIMS', 
      patterns: [
        'icims.com', 'jobs.icims.com', 'careers.icims.com', 'careers-',
        '.icims.com', 'icims', '/jobs/search', '/careers-home', 'careers-home/jobs'
      ],
      indicators: [
        'icims-jobs', 'iCIMS', 'icims-content-container', 'icims-portal',
        'icims-content', 'icims-widget', 'icims-career', 'icims-search',
        'icims-job-list', 'icims-posting', 'icims-application',
        'data-icims', 'icims-embed', 'icims-iframe', 'icims-board',
        'powered by icims', 'icims.com/jobs', 'careers.icims.com',
        'icims-search-results', 'icims-table', 'icimsJobs', 'icims-requisition',
        'careers-home', 'icims-candidates', 'icims-external-api',
        'in_iframe=1', 'icims_content_iframe', 'icims_handlepostmessage',
        'noscript_icims_content_iframe', 'icims_iframe_span',
        'iCIMS_JobsTable', 'iCIMS_Table', 'iCIMS_JobListingRow',
        'iCIMS_JobContainer', 'iCIMS_MainWrapper'
      ],
      directMethod: true,
      apiPatterns: [
        '/jobs/search', '/jobs/api', '/external-api', '/careers-home/jobs', '/jobs/candidates',
        '/api/jobs', '/jobs/search.json', '/careers-home/jobs.json',
        '/api/candidates/jobs', '/jobs/', '/careers/', 'jobId=', 'requisition'
      ],
      specialSelectors: {
        jobCards: [
          '.icims-job-item', '.job-item', '.job-listing', '.position-item',
          'tr.icimsJobs', 'div[data-job-id]', '.icims-posting', '.job-row',
          '.iCIMS_JobListingRow', '.iCIMS_JobContainer', 'table.iCIMS_Table tr',
          '.search-results-list tr', '.job-search-results .job-item'
        ],
        loadMore: [
          'button[class*="load-more"]', 'button[class*="show-more"]',
          '.pagination-next', '.icims-load-more'
        ],
        jobLinks: [
          'a[href*="/jobs/"]', 'a[href*="/careers/"]', 'a[href*="jobId="]',
          'a[href*="requisition"]', '.icims-job-item a', 'tr.icimsJobs a',
          '.iCIMS_JobsTable a', '.iCIMS_Table a', 'table.iCIMS_Table a'
        ]
      }
    },
    { 
      name: 'JazzHR', 
      patterns: ['jazzhr.com', 'applytojob.com', 'hire.withgoogle.com'],
      indicators: [
        'jazz-jobs', 'google-hire', 'jazzhr-widget', 'jazz-apply',
        'jazz-career', 'job-application-form', 'jazz-job-board',
        'application-widget', 'apply to job', 'powered by jazzhr'
      ],
      directMethod: true,
      apiPatterns: ['/api/jobs', '/widget/jobs', '/public/jobs', '/api/v1/jobs', '/jobs.json', '/feed.json']
    },
    {
      name: 'Workable',
      patterns: ['workable.com', 'apply.workable.com', 'careers-page.workable.com', 'jobs.workable.com'],
      indicators: ['workable-jobs', 'workable-application', 'wk-', 'workable-shortlist', 'data-testid="job-card"', 'workable-widget', 'workable-careers-iframe'],
      directMethod: true,
      iframeMethod: false,
      apiPatterns: ['/api/v1/jobs', '/api/v2/jobs', '/external/jobs', '/workable/jobs'],
      specialSelectors: {
        jobCards: ['[data-testid="job-card"]', '[class*="job-item"]', '[class*="job-row"]', '[class*="position"]'],
        loadMore: ['button[class*="load-more"]', 'button[class*="show-more"]', '[data-testid="load-more"]'],
        jobLinks: ['a[href*="/job/"]', 'a[href*="/position/"]', 'a[href*="/apply/"]']
      }
    },
    { 
      name: 'TeamTailor', 
      patterns: ['teamtailor.com', 'career.teamtailor.com', '.teamtailor.com'],
      indicators: ['teamtailor-jobs', 'tt-', 'teamtailor-container', 'career-site-component'],
      directMethod: true,
      apiPatterns: ['/api/v1/jobs', '/api/public/jobs']
    },
    { 
      name: 'Personio', 
      patterns: ['personio.de', 'personio.com', 'jobs.personio.de'],
      indicators: ['personio-jobs', 'personio-position', 'personio-widget'],
      directMethod: true,
      apiPatterns: ['/api/recruiting/positions', '/xml/positions']
    },
    { 
      name: 'Ashby', 
      patterns: ['ashbyhq.com', 'jobs.ashbyhq.com'],
      indicators: ['ashby-jobs', 'ashby-job-board', 'ashby-application'],
      directMethod: true,
      apiPatterns: ['/api/jobs', '/api/postings']
    },
    { 
      name: 'Cornerstone', 
      patterns: ['csod.com', 'cornerstoneondemand.com', '.csod.com'],
      indicators: ['cornerstone-jobs', 'csod-', 'cornerstone-careers'],
      iframeMethod: true,
      apiPatterns: ['/ats/careersite', '/services/requisition']
    },
    { 
      name: 'SuccessFactors', 
      patterns: ['successfactors.com', 'successfactors.eu', 'sapsf.com'],
      indicators: ['successfactors-jobs', 'sf-', 'sapsf-', 'bizx-'],
      iframeMethod: true,
      apiPatterns: ['/career', '/xi/services', '/odata/v2']
    },
    { 
      name: 'Ultipro', 
      patterns: ['ultipro.com', 'ukg.com', 'recruiting.ultipro.com'],
      indicators: ['ultipro-jobs', 'ukg-', 'ultipro-careers'],
      iframeMethod: true,
      apiPatterns: ['/CandidateSelfService', '/api/jobs']
    },
    { 
      name: 'ApplyToJob', 
      patterns: ['applytojob.com', 'apply.to'],
      indicators: ['applytojob', 'atj-', 'apply-widget'],
      directMethod: true,
      apiPatterns: ['/api/jobs', '/a/jobs']
    }
  ],

  csvColumnMappings: {
    name: [
      'company', 'company name', 'company_name', 'companyname',
      'name', 'enterprise', 'organization', 'firm', 'business',
      'employer', 'corp', 'corporation', 'inc', 'ltd'
    ],
    location: [
      'location', 'city', 'town', 'address', 'country', 'region', 'state', 'province',
      'geographic', 'geographical', 'place', 'office', 'site', 'headquarters'
    ],
    website: [
      'website', 'web', 'site', 'url', 'link', 'homepage',
      'web site', 'site_web', 'siteweb', 'webpage',
      'portal', 'domain', 'www', 'http'
    ],
    linkedin: [
      'linkedin', 'linked in', 'linked_in', 'linkedin url', 'linkedin_url',
      'linkedinurl', 'linkedin link', 'linkedin_link', 'linkedinlink',
      'profile', 'social', 'professional network'
    ],
    email: [
      'email', 'e-mail', 'e_mail', 'mail', 'contact', 'contact email',
      'contact_email', 'contactemail', 'email address', 'email_address',
      'emailaddress', 'electronic mail', 'correspondence', 'communication'
    ],
    appliedDate: [
      'applied', 'applied date', 'applied_date', 'applieddate',
      'application date', 'application_date', 'applicationdate',
      'date applied', 'date_applied', 'dateapplied',
      'submission', 'sent', 'date', 'when', 'submitted', 'apply date', 'apply_date'
    ],
    comments: [
      'comments', 'comment', 'notes', 'note', 'remarks',
      'observations', 'observation', 'description', 'details',
      'info', 'information', 'additional info', 'additional_info', 'additionalinfo',
      'memo', 'status', 'feedback'
    ]
  },

  csvFieldLabels: {
    name: 'Company Name',
    location: 'Location',
    website: 'Website',
    linkedin: 'LinkedIn',
    email: 'Contact Email',
    appliedDate: 'Applied Date',
    comments: 'Comments'
  },

  csvRequiredFields: ['name'],

  csvValidationRules: {
    name: {
      required: true,
      minLength: 1,
      maxLength: 255
    },
    location: {
      required: false,
      maxLength: 255
    },
    website: {
      required: false,
      pattern: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
      maxLength: 500
    },
    linkedin: {
      required: false,
      pattern: /^(https?:\/\/)?(www\.)?linkedin\.com\/.*$/,
      maxLength: 500
    },
    email: {
      required: false,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      maxLength: 255
    },
    appliedDate: {
      required: false,
      pattern: /^\d{4}-\d{2}-\d{2}$/
    },
    comments: {
      required: false,
      maxLength: 2000
    }
  },

  workableSpecificSelectors: {
    jobCards: [
      '[data-testid="job-card"]',
      '[class*="job-item"]',
      '[class*="job-row"]',
      '[class*="position"]',
      '.wk-job-card',
      '.workable-job'
    ],
    jobTitles: [
      '[data-testid*="title"]',
      '[data-testid*="name"]',
      '[class*="title"]',
      '[class*="name"]',
      '[class*="position-title"]',
      'h1, h2, h3'
    ],
    jobLocations: [
      '[data-testid*="location"]',
      '[class*="location"]',
      '[class*="city"]',
      '[class*="office"]'
    ],
    loadMoreButtons: [
      'button[class*="load-more"]',
      'button[class*="show-more"]',
      '[data-testid="load-more"]',
      '[data-testid="show-more"]',
      'button[aria-label*="Load more"]',
      'button[aria-label*="Show more"]'
    ],
    jobLinks: [
      'a[href*="/job/"]',
      'a[href*="/position/"]',
      'a[href*="/apply/"]',
      'a[href*="/career/"]'
    ],
    companyInfo: [
      '[class*="company-info"]',
      '[class*="about"]',
      '[data-testid*="company"]',
      '[class*="company-description"]'
    ]
  },

  workableDetectionPatterns: {
    urlPatterns: [
      /apply\.workable\.com/i,
      /careers-page\.workable\.com/i,
      /workable\.com\/careers/i,
      /jobs\.workable\.com/i
    ],
    htmlIndicators: [
      'data-testid="job-card"',
      'workable-application',
      'workable-jobs',
      'workable-widget',
      'wk-',
      'workable-shortlist'
    ],
    apiEndpoints: [
      '/api/v1/jobs',
      '/api/v2/jobs', 
      '/external/jobs',
      '/workable/jobs'
    ]
  },
    seniority: {
      'senior': ['sr', 'sr.', 'lead', 'principal', 'chief'],
      'junior': ['jr', 'jr.', 'trainee', 'intern'],
      'lead': ['manager', 'head', 'chief', 'principal', 'supervisor'],
      'head': ['lead', 'chief', 'director', 'manager'],
      'principal': ['senior', 'lead', 'chief', 'main']
    },
    positions: {
      'developer': ['engineer', 'programmer', 'coder'],
      'engineer': ['developer', 'programmer', 'specialist'],
      'designer': ['artist', 'creative', 'specialist'],
      'artist': ['designer', 'creative', 'specialist'],
      'manager': ['supervisor', 'lead', 'director'],
      'supervisor': ['manager', 'lead', 'director'],
      'specialist': ['expert', 'professional', 'consultant'],
      'consultant': ['advisor', 'expert', 'specialist'],
      'analyst': ['specialist', 'expert', 'researcher'],
      'coordinator': ['organizer', 'manager', 'administrator']
    },
    technical: {
      '3d': ['three-dimensional', 'three dimensional', 'tridimensional'],
      'vfx': ['visual effects', 'visual fx'],
      'ui': ['user interface'],
      'ux': ['user experience'],
      'qa': ['quality assurance'],
      'devops': ['development operations']
    }
  }
;