const express = require('express');
const adminEvents = require('../controllers/adminEventsController');
const verifyToken = require('../verifyToken');


const router = express.Router();

router.post('/createEvent',   adminEvents.createEvent);
 
router.delete('/deleteEvent/:id', adminEvents.deleteEvent);
 
router.put('/updateEvent/:id', adminEvents.updateEvent); 

router.put('/settings', adminEvents.adminSettings); 

module.exports = router;    