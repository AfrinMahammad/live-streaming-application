const jwt = require('jsonwebtoken');
const User = require('../models/Users');
const Admins = require('../models/Admin');
const bcrypt = require('bcrypt')
const nodemailer = require('nodemailer');


require('dotenv').config();

const signup = async (req, res) => {
    const userData = req.body;
    const password = userData.password;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({
            ...userData,
            password: hashedPassword
        });
        await newUser.save();
        console.log('new user...', newUser);
        res.status(200).json({ success: "User created Successfully!" });
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: err.message });
    }
};

const login = async (req, res) => {

    try {
        const email = req.body.email;
        const password = req.body.password;
        const isAdmin = req.body.isAdmin;

        if (isAdmin) {

            const admin = await Admins.findOne({ email: email });
            if (!admin) return res.status(404).json({ message: "Admin not found" });
            const isCorrect = await bcrypt.compare(password, admin.password);
            if (!isCorrect) return res.status(404).json({ message: "Invalid credentials" });
            if (admin && isCorrect) {
                const token = jwt.sign({ isAdmin: true, email: email }, process.env.JWT_SECRET_KEY, { expiresIn: "24h" });
                res.status(200).json({ "token": token, "firstname": admin.firstname, "lastname": admin.lastname, "email": admin.email, "service": admin.service });
            }
        }
        else {

            const user = await User.findOne({ email: email });
            if (!user) return res.status(404).json({ message: "User not found!" });
            const isCorrect = await bcrypt.compare(password, user.password);
            if (!isCorrect) return res.status(404).json({ message: "Invalid credentials" });
            if (user && isCorrect) {
                const token = jwt.sign({ email: email }, process.env.JWT_SECRET_KEY, { expiresIn: "24h" });
                res.status(200).json({ "token": token, "firstname": user.firstname, "lastname": user.lastname, "email": user.email });
            }
        }

    }
    catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }

};


const sendOtp = async (req, res) => {

    const email = req.body.email;
    console.log(email);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        secure: false,
        auth: {
            user: process.env.SENDER_EMAIL_ID,
            pass: process.env.SENDER_PASSWORD,
        }
    });

    const mailOptions = {
        from: process.env.SENDER_EMAIL_ID,
        to: email,
        subject: 'Your OTP Code',
        text: `Your OTP Code is ${otp}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            return res.status(500).send('Error sending email');
        }
        console.log(otp);
        return res.status(200).send({ otp });
    });

}


module.exports = { signup, login, sendOtp };