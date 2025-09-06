const config = require('../config');
// Tester les limites
fetch('/plan/limits')
  .then(r => r.json())
  .then(data => config.smartLog('buffer',data.restrictions));