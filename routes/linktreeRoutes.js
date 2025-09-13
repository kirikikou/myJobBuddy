const express = require('express');
const LinktreeController = require('../controllers/LinktreeController');

const router = express.Router();

router.get('/:treeId/:slug', LinktreeController.renderLinktree);

module.exports = router;