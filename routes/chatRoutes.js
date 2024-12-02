const express = require('express');
const verifyToken = require('../verifyToken');

const liveChat = require('../controllers/chatController');

const router = express.Router();

router.post('/liveChat',  liveChat.liveChat);

router.get('/pastChat/:id', liveChat.pastChat);

module.exports = router;