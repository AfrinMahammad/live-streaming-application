const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
    firstname : {
        type : String,
        required : true
    },
    lastname : {
        type : String,
        required : true
    },
    email : {
        type : String,
        required : true,
        unique : true,
    },
    department : {
        type : String,
        required : true
    },
    password : {
        type : String,
        required : true
    }
    
},
{timestamps: true}
);


const User = mongoose.model('vibe-users', UserSchema);


module.exports = User;