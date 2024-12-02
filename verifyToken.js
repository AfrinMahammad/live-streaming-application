const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ message: 'Token is required' });
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY, (error, decoded) => {
        if (error) {
            return res.status(401).json({ message: 'Token is invalid' });
        }

        console.log(decoded);

        req.user = { isAdmin: decoded.isAdmin, email: decoded.email };

        next();
    });
};

module.exports = verifyToken;
