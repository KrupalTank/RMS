// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken } = require('../middlewares/authMiddleware');

// All chat operations require authentication
router.use(verifyToken);

router.post('/getOrCreateConversation', chatController.getOrCreateConversation);
router.get('/myConversations', chatController.getMyConversations);
router.get('/messages/:conversationId', chatController.getMessages);
router.post('/sendMessage', chatController.sendMessage);

module.exports = router;