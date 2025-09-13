const express = require('express');
const ApiController = require('../controllers/ApiController');

const router = express.Router();

router.get('/dictionaries/ui/locales.json', ApiController.getDictionaryLocales);

module.exports = router;