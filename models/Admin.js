const mongoose = require('mongoose');

const AdminSchema = mongoose.Schema({
    
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
    },
    service : {
        type : String,
        required : true
    }  
},
{timestamps: true}
);


const Admin = mongoose.model('vibe-admins', AdminSchema);


module.exports = Admin;