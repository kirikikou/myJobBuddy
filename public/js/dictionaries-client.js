window.dictionaries = {
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

  csvDateFormats: [
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    /(\d{1,2})\/(\d{1,2})\/(\d{2})/,
    /(\d{1,2})-(\d{1,2})-(\d{4})/,
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
    /(\d{1,2}) (\d{1,2}) (\d{4})/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
    /(\d{1,2})-(\w{3})-(\d{4})/,
    /(\w{3}) (\d{1,2}), (\d{4})/
  ],

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
  }
};