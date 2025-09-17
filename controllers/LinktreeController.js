const LinktreeService = require('../services/LinktreeService');

class LinktreeController {
  static async renderLinktree(req, res) {
    const { treeId, slug } = req.params;
    
    try {
      const result = await LinktreeService.renderLinktree(treeId, slug);
      
      if (!result.success) {
        return res.status(result.statusCode).send(result.message);
      }
      
      res.send(result.html);
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  }
}

module.exports = LinktreeController;