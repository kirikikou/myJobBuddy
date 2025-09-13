const fs = require('fs');
const path = require('path');
const serverConfig = require('../config/server');

class ApiController {
  static getDictionaryLocales(req, res) {
    try {
      const dir = path.join(__dirname, '../', serverConfig.PATHS.DICTIONARIES_UI_PATH);
      const langs = fs.readdirSync(dir)
        .filter(f => f.endsWith('.js'))
        .map(f => path.basename(f, '.js'))
        .filter(x => x !== 'uiManager');
      
      res.setHeader('Cache-Control', `public, max-age=${serverConfig.STATIC_FILES.DICTIONARIES_CACHE_MAX_AGE}`);
      res.json({ languages: langs });
    } catch (error) {
      res.status(200).json({ languages: [] });
    }
  }
}

module.exports = ApiController;