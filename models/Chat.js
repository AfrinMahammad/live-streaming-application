const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    senderId: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required : true
    },
    time: {
        type: String
    }
});

const chatSchema = new mongoose.Schema({
    eventId: {
        type : mongoose.Types.ObjectId,
        ref : 'vibe-events'
    },
    messages: [messageSchema]
}, { timestamps: true });

const Chat = mongoose.model('vibe-chat', chatSchema);
module.exports = Chat;
