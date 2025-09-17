module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  plugins: [
    'security'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'security/detect-unsafe-regex': 'warn',
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'warn',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'warn',
    'security/detect-non-literal-fs-filename': 'off',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-require': 'warn',
    'security/detect-object-injection': 'off',
    'security/detect-possible-timing-attacks': 'warn',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-bidi-characters': 'error',
    'no-unused-vars': 'warn',
    'no-irregular-whitespace': 'warn'
  },
  ignorePatterns: [
    'node_modules/**',
    'public/js/**',
    'exports/**',
    'cache/**',
    'logs/**',
    'debug/**',
    'scrapers/**',
    'dictionaries/**',
    'utils/**',
    'services/**',
    'controllers/**',
    'routes/**'
  ]
};