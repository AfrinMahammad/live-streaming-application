const express = require('express');
const events = require('../controllers/eventsController');
const awsEvents = require('../controllers/awsController');
const verifyToken = require('../verifyToken');

const router = express.Router();

router.post('/scheduledEvents',  events.fetchEvents);

// router.post('/adminEvents',  events.adminEvents);

router.get('/playbackUrl/:id',  events.playbackUrl);

router.post('/startBroadcasting', events.startBroadcasting); 
 
router.post('/stopBroadcasting', events.stopBroadcasting); 

router.post('/viewRecording', events.viewRecording); 
 
router.delete('/deleteRecording/:id', events.deleteRecording); 

router.post('/goLive',events.live);

router.post('/audioVideo', awsEvents.audioVideoData);

router.post('/analytics', events.analytics);

module.exports = router;