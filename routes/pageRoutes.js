const express = require('express');
const PageController = require('../controllers/PageController');

const router = express.Router();

router.get('/', PageController.renderHomepage);
router.get('/app', PageController.renderApp);
router.get('/login', PageController.renderLogin);
router.get('/register', PageController.renderRegister);
router.get('/pricing', PageController.renderPricing);
router.get('/forgot-password', PageController.renderForgotPassword);

module.exports = router;