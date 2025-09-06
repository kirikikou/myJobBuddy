module.exports = {
  jobSelectors: [
    '.job', '.job-item', '.job-listing', '.job-card', '.job-post', '.job-opening',
    '.position', '.position-item', '.position-listing', '.position-card', '.position-post',
    '.career', '.career-item', '.career-listing', '.career-card', '.career-post',
    '.vacancy', '.vacancy-item', '.vacancy-listing', '.vacancy-card', '.vacancy-post',
    '.opening', '.opening-item', '.opening-listing', '.opening-card', '.opening-post',
    '.opportunity', '.opportunity-item', '.opportunity-listing', '.opportunity-card',
    '.employment', '.employment-item', '.employment-listing', '.employment-card',
    '[data-job]', '[data-job-id]', '[data-position]', '[data-career]',
    '[data-vacancy]', '[data-opening]', '[data-opportunity]',
    '[data-job-title]', '[data-position-title]', '[data-role-title]',
    '#jobs-list', '#job-board', '#careers-list', '#positions-list',
    '.jobs-container .item', '.careers-section article',
    'ul.jobs > li', 'ul.careers > li', 'ul.positions > li',
    '.job-board-wrapper .posting', '.career-portal .listing',
    'li:has(a[href*="job"])', 'li:has(a[href*="career"])', 'li:has(a[href*="position"])',
    'tr:has(a[href*="job"])', 'tr:has(a[href*="career"])', 'tr:has(a[href*="position"])',
    '[role="listitem"]:has(a[href*="job"])',
    '[role="listitem"]:has(a[href*="career"])',
    '[role="listitem"]:has(a[href*="position"])',
    '.search-result', '.search-item', '.search-entry',
    '.listing-item', '.listings-item', '.list-entry',
    '.opportunity', '.opening', '.role', '.position',
    'section[class*="job"]', 'section[id*="job"]',
    'div[class*="job"]', 'div[id*="job"]',
    'li[class*="job"]', 'li[id*="job"]',
    '[role="article"]', '[role="region"]',
    'article', '.card', '.item', '.result', '.listing', '.post',
    '.tile', '.block', '.entry', '.record', '.row-item',
    '[data-testid="job-card"]',
    '[data-testid*="job"]', '[class*="job-card"]', '[class*="job-row"]',
    'tbody tr', 'table.jobs tr', 'table.careers tr', 'table.positions tr'
  ],

  paginationSelectors: [
    '.pagination', '.pager', '.page-navigation', '.page-links',
    'nav[role="navigation"]', 'nav[aria-label*="pagination"]',
    '.pagination-wrapper', '.paging-controls',
    'ul.pagination', 'ol.pagination',
    '.wp-pagenavi', '.page-numbers',
    '.pagination a[href*="page="]', '.pagination a[href*="p="]',
    '.pager a[href*="page="]', '.pager a[href*="p="]',
    'nav[aria-label="Pagination"] a', 'nav[aria-label="Page navigation"] a',
    '[class*="pagination"] a', '[class*="pager"] a', '[class*="page-nav"] a',
    '[id*="pagination"] a', '[id*="pager"] a', '[id*="page-nav"] a',
    'ul.pagination li:not(.disabled):not(.active) a',
    '[data-testid*="next"]', '[data-testid*="pagination"]', '[data-testid*="prev"]',
    '[aria-label*="next"]', '[aria-label*="Next"]',
    '[aria-label*="previous"]', '[aria-label*="Previous"]',
    '[aria-label*="page"]', '[aria-label*="Page"]',
    'button[class*="pagination"]', 'button[class*="next"]', 'button[class*="prev"]'
  ],

  loadingSelectors: [
    '.loading', '.loader', '.spinner', '.progress',
    '[aria-busy="true"]', '[aria-live="polite"]', '[aria-live="assertive"]',
    '.skeleton', '.skeleton-loader', '.shimmer', '.shimmer-effect',
    '.loading-indicator', '.ajax-loader', '.loading-animation', '.pulse-animation',
    '[data-loading="true"]', '[data-state="loading"]', '[data-status="loading"]',
    '[data-loader]', '[data-spinner]', '[data-progress]',
    '.fa-spinner', '.fa-circle-o-notch', '.fa-refresh', '.fa-cog',
    '.material-icons', '.icon-loading', '.icon-spinner', '.icon-refresh',
    '.load-more-loading', '.show-more-loading', '.pagination-loading',
    '.placeholder', '.loading-placeholder', '.content-placeholder',
    '.ghost-content', '.pulse-loader', '.dots', '.ellipsis', '.wave',
    '[class*="spin"]', '[class*="rotate"]', '[class*="bounce"]', '[class*="pulse"]',
    '[class*="fade"]', '[class*="blink"]', '[class*="flash"]', '[class*="animate"]'
  ],

  contentZones: [
    'main', 'article', '#main', '#content',
    '.main-content', '.primary-content', '.content-area',
    '[role="main"]', '[role="article"]',
    '.entry-content', '.post-content', '.page-content',
    '.content', '.main-content', '.primary-content'
  ],

  elementsToRemove: [
    'script', 'style', 'noscript', 'iframe[src*="google-analytics"]',
    '.advertisement', '.ads', '.sponsor',
    'nav', 'header', 'footer', '.sidebar',
    '.cookie-notice', '.newsletter-popup'
  ],

  dynamicIndicators: [
    '[data-react]', '[data-vue]', '[data-angular]', '[data-reactroot]', 
    '[data-react-root]', '[id="root"]', '[id="app"]', '[id="__next"]',
    '[ng-app]', '[ng-controller]', '[data-angular]',
    '[v-app]', '[data-vue]', '[data-svelte]', '[data-ember]',
    '[data-component]', '[data-widget]', '[data-module]', '[data-controller]',
    '.vue-component', '.react-component', '.angular-component', '.svelte-component',
    '.ember-view', '.ng-scope', '.v-application',
    '[data-turbo]', '[data-turbolinks]', '[data-pjax]',
    '.lazy-load', '[data-lazy]', '[loading="lazy"]', '[data-lazy-src]',
    '[data-infinite]', '[data-auto-load]', '[data-lazy-load]', '[data-infinite-scroll]',
    '[data-ajax]', '[data-fetch]', '[data-load]', '[data-url]', '[data-remote]',
    '[data-page]', '[data-route]', '[data-view]', '[data-state]',
    '.lazy', '.lazyload', '.lazy-load', '.defer', '.deferred',
    '.progressive-image', '.lazy-image', '.async-image',
    '.infinite-scroll', '.infinite-loading', '.auto-load', '.endless-scroll',
    '.load-on-scroll', '.scroll-trigger', '.scroll-loader',
    '.ajax-content', '.fetch-content', '.dynamic-content', '.async-content',
    '.live-update', '.real-time', '.auto-refresh',
    '.progressive', '.enhanced', '.interactive', '.dynamic',
    '.client-render', '.ssr-content', '.hydrated',
    '.spa-content', '.router-view', '.outlet'
  ],

  errorSelectors: [
    '.text-danger', '.text-error', '.text-red', '.text-warning',
    '.bg-danger', '.bg-error', '.bg-red', '.bg-warning',
    '.border-danger', '.border-error', '.border-red', '.border-warning',
    '.message-error', '.error-message', '.validation-error', '.form-error', '.field-error',
    '.alert-error', '.alert-danger', '.exception', '.critical', '.fatal', '.severe',
    '[role="alert"]', '[aria-live="assertive"]', '[aria-invalid="true"]',
    '[data-error]', '[data-alert]', '[data-warning]', '[data-fail]',
    '[data-validation="error"]', '[data-status="error"]', '[data-state="error"]',
    '.error', '.alert-error', '.alert-danger', '.danger', '.warning',
    '.fail', '.failure', '.problem', '.invalid'
  ],

  emptyContentSelectors: [
    '.no-results', '.no-jobs', '.no-positions', '.no-openings', '.no-vacancies',
    '.empty-results', '.empty-jobs', '.empty-positions', '.empty-state',
    '.zero-results', '.nothing-found', '.not-found', '.no-matches',
    '.no-data', '.no-content', '.empty-content', '.empty-list',
    '[data-testid*="empty"]', '[data-testid*="no-results"]', '[data-testid*="zero"]',
    '.illustration-empty', '.empty-illustration', '.no-data-illustration',
    '.empty-state-image', '.zero-state', '.placeholder-empty'
  ],

  searchFilterSelectors: [
    '.search-filters', '.job-filters', '.filter-panel', '.filter-sidebar',
    '.advanced-search', '.search-options', '.filter-options', '.refinement-panel',
    '.facets', '.facet-list', '.filter-facets', '.search-facets',
    '[data-testid*="filter"]', '[data-testid*="search"]', '[data-testid*="facet"]',
    '.location-filter', '.salary-filter', '.experience-filter', '.type-filter',
    '.category-filter', '.industry-filter', '.company-filter', '.date-filter',
    '.remote-filter', '.contract-filter', '.level-filter', '.department-filter',
    'select[name*="location"]', 'select[name*="salary"]', 'select[name*="experience"]',
    'input[name*="location"]', 'input[name*="salary"]', 'input[name*="keyword"]',
    '.filter-chips', '.filter-tags', '.active-filters', '.applied-filters',
    '.selected-filters', '.current-filters', '.filter-breadcrumb',
    '.clear-filters', '.reset-filters', '.remove-filter'
  ],

  complexDomains: [
    'linkedin.com', 'indeed', 'glassdoor', 'monster.com', 'careerbuilder.com',
    'workday', 'lever.co', 'greenhouse.io', 'recruitee', 'jobs.', 'careers',
    'taleo', 'jobvite', 'smartrecruiters', 'brassring', 'bamboohr', 'icims',
    'workable', 'jazzhr', 'personio', 'jobdiva', 'bullhorn', 'cornerstone',
    'teamtailor', 'ashby', 'successfactors', 'ultipro', 'ukg', 'applytojob',
    'xing', 'stepstone', 'pôle-emploi', 'apec', 'cadremploi', 'meteojob',
    'jobup', 'jobscout24', 'arbeitsagentur', 'trovit', 'infojobs', 'infoempleo',
    'jobrapido', 'jooble', 'neuvoo', 'careerjet', 'simplyhired', 'ziprecruiter'
  ],

  templateIndicators: [
    '{{', '}}', '{%', '%}', '<%', '%>', '${', '}',
    'ng-repeat', 'ng-if', 'ng-for', 'v-for', 'v-if', 
    '*ngFor', '*ngIf', 'x-for', 'x-if',
    'data-bind', 'data-ng-', 'data-v-',
    'handlebars', 'mustache', 'twig', 'jinja',
    'template-', 'tmpl-', 'tpl-'
  ],

  jobLinkSelectors: [
    'a[href*="/job/"]', 'a[href*="/jobs/"]', 'a[href*="/career/"]', 'a[href*="/careers/"]',
    'a[href*="/position/"]', 'a[href*="/positions/"]', 'a[href*="/vacancy/"]', 'a[href*="/vacancies/"]',
    'a[href*="/opening/"]', 'a[href*="/openings/"]', 'a[href*="/opportunity/"]', 'a[href*="/opportunities/"]',
    'a[href*="/apply/"]', 'a[href*="/application/"]', 'a[href*="/role/"]', 'a[href*="/roles/"]',
    'a[href*="/employ/"]', 'a[href*="/employment/"]', 'a[href*="/work/"]', 'a[href*="/hiring/"]',
    'a[href*="/recruitment/"]', 'a[href*="/join/"]', 'a[href*="/team/"]',
    
    'a[href*="/emploi/"]', 'a[href*="/emplois/"]', 'a[href*="/poste/"]', 'a[href*="/postes/"]',
    'a[href*="/carriere/"]', 'a[href*="/carrieres/"]', 'a[href*="/recrutement/"]',
    'a[href*="/candidature/"]', 'a[href*="/offre/"]', 'a[href*="/offres/"]',
    
    'a[href*="/empleo/"]', 'a[href*="/empleos/"]', 'a[href*="/trabajo/"]', 'a[href*="/trabajos/"]',
    'a[href*="/vacante/"]', 'a[href*="/vacantes/"]', 'a[href*="/oportunidad/"]',
    
    'a[href*="/stelle/"]', 'a[href*="/stellen/"]', 'a[href*="/karriere/"]', 'a[href*="/bewerbung/"]',
    'a[href*="/arbeit/"]', 'a[href*="/stellenangebot/"]',
    
    'a[href*="/lavoro/"]', 'a[href*="/lavori/"]', 'a[href*="/carriera/"]', 'a[href*="/posto/"]',
    
    'a[href*="/praca/"]', 'a[href*="/prace/"]', 'a[href*="/stanowisko/"]', 'a[href*="/oferta/"]',
    
    'a[href*="/vaga/"]', 'a[href*="/vagas/"]', 'a[href*="/emprego/"]', 'a[href*="/cargo/"]',
    
    'a[href*="/baan/"]', 'a[href*="/vacature/"]', 'a[href*="/sollicitatie/"]',
    
    'a[href*="/jobb/"]', 'a[href*="/stilling/"]', 'a[href*="/tjanst/"]',
    
    'a[href*="/tyo/"]', 'a[href*="/tyopaikka/"]',
    
    'a[href*="/robota/"]', 'a[href*="/vakansiya/"]',
    
    'a[href*="jobId="]', 'a[href*="job_id="]', 'a[href*="positionId="]', 'a[href*="req="]',
    'a[href*="requisition="]', 'a[href*="posting="]', 'a[href*="postingId="]',
    
    'a[href*="/jobs/details/"]', 'a[href*="/apply/jobs/details/"]', 'a[href*="/careers/job/"]',
    'a[href*="/positions/view/"]', 'a[href*="/openings/show/"]',
    
    '.job-title a', '.job-link a', '.position-title a', '.career-link a',
    '.job-listing a', '.job-item a', '.job-card a', '.job-post a',
    '.position-listing a', '.position-item a', '.position-card a',
    '.career-listing a', '.career-item a', '.career-card a',
    '.vacancy-listing a', '.vacancy-item a', '.opening-item a',
    
    '[data-job-url]', '[data-position-url]', '[data-career-url]', '[data-apply-url]',
    '[data-job-link]', '[data-position-link]', '[data-role-link]'
  ],

  cookieFrameworkSelectors: [
    '[data-cky-tag="accept-button"]', '[data-cky-tag="detail-accept-button"]',
    '[data-cky-tag="reject-button"]', '[data-cky-tag="detail-reject-button"]',
    'button.cky-btn-accept', '.cky-btn-accept', 'button.cky-btn-reject', '.cky-btn-reject',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#CybotCookiebotDialogBodyButtonAccept',
    '.trustarc-banner-container .call', '.trustarc-accept-btn', '.didomi-continue-without-agreeing',
    '.qc-cmp-button', '.usercentrics-banner button', '[data-testid="uc-accept-all-button"]',
    '.klaro .cm-btn-accept', '.cmplz-accept', '.cc-compliance .cc-btn', '.cc-allow',
    '#onetrust-accept-btn-handler', '.optanon-allow-all', '.accept-button', '.cookie-accept',
    '.consent-accept', '.privacy-accept', 'button[id*="cookie"][id*="accept"]',
    'button[class*="cookie"][class*="accept"]', 'button[aria-label*="accept"]'
  ],

  popupCloseSelectors: [
    'button:has-text("Close")', 'button:has-text("×")', 'button:has-text("X")',
    '[class*="close-button"]', '[class*="modal-close"]', '.career-helper-close',
    '[class*="popup"] button', '[class*="modal"] button', '[class*="dialog"] button',
    'button[class*="close"]', 'a[class*="close"]', '[role="button"][aria-label*="close"]',
    '.modal-backdrop', '[class*="overlay"]', '[class*="backdrop"]'
  ],

  localeMapping: {
    'fr': 'fr-FR', 'es': 'es-ES', 'de': 'de-DE', 'it': 'it-IT',
    'pt': 'pt-PT', 'nl': 'nl-NL', 'sv': 'sv-SE', 'no': 'nb-NO',
    'fi': 'fi-FI', 'uk': 'uk-UA', 'ru': 'ru-RU', 'pl': 'pl-PL',
    'cs': 'cs-CZ', 'da': 'da-DK', 'el': 'el-GR', 'he': 'he-IL',
    'hi': 'hi-IN', 'id': 'id-ID', 'ja': 'ja-JP', 'ko': 'ko-KR',
    'ms': 'ms-MY', 'ro': 'ro-RO', 'th': 'th-TH', 'tr': 'tr-TR',
    'vi': 'vi-VN', 'zh': 'zh-CN', 'ar': 'ar-SA', 'bn': 'bn-BD'
  },

  languageHeaders: {
    'fr': 'fr-FR,fr;q=0.9,en;q=0.8',
    'es': 'es-ES,es;q=0.9,en;q=0.8',
    'de': 'de-DE,de;q=0.9,en;q=0.8',
    'it': 'it-IT,it;q=0.9,en;q=0.8',
    'pt': 'pt-PT,pt;q=0.9,en;q=0.8',
    'nl': 'nl-NL,nl;q=0.9,en;q=0.8',
    'sv': 'sv-SE,sv;q=0.9,en;q=0.8',
    'no': 'nb-NO,no;q=0.9,en;q=0.8',
    'fi': 'fi-FI,fi;q=0.9,en;q=0.8',
    'uk': 'uk-UA,uk;q=0.9,en;q=0.8',
    'ru': 'ru-RU,ru;q=0.9,en;q=0.8',
    'pl': 'pl-PL,pl;q=0.9,en;q=0.8',
    'cs': 'cs-CZ,cs;q=0.9,en;q=0.8',
    'da': 'da-DK,da;q=0.9,en;q=0.8',
    'el': 'el-GR,el;q=0.9,en;q=0.8',
    'he': 'he-IL,he;q=0.9,en;q=0.8',
    'hi': 'hi-IN,hi;q=0.9,en;q=0.8',
    'id': 'id-ID,id;q=0.9,en;q=0.8',
    'ja': 'ja-JP,ja;q=0.9,en;q=0.8',
    'ko': 'ko-KR,ko;q=0.9,en;q=0.8',
    'ms': 'ms-MY,ms;q=0.9,en;q=0.8',
    'ro': 'ro-RO,ro;q=0.9,en;q=0.8',
    'th': 'th-TH,th;q=0.9,en;q=0.8',
    'tr': 'tr-TR,tr;q=0.9,en;q=0.8',
    'vi': 'vi-VN,vi;q=0.9,en;q=0.8',
    'zh': 'zh-CN,zh;q=0.9,en;q=0.8',
    'ar': 'ar-SA,ar;q=0.9,en;q=0.8',
    'bn': 'bn-BD,bn;q=0.9,en;q=0.8'
  }
};