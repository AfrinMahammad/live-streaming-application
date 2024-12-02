const express = require('express');
const userAuth = require('../controllers/authController');


const router = express.Router();


router.post('/signup', userAuth.signup);

router.post('/login', userAuth.login);

router.post('/sendOtp', userAuth.sendOtp);

module.exports = router;