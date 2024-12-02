const mongoose = require('mongoose');

const EventSchema = mongoose.Schema({

    eventId : {
        type : String,
        required : true
    },

    title : {
        type : String,
        required : true
    },

    desc : {
        type : String,
        required : true
    },

    host : {
        type : mongoose.Types.ObjectId,
        ref : 'vibe-admins'
    },

    category : {
        type : String,
        required : true
    },

    chat : {
        type : Boolean,
        default : false
    },

    teams : {
        type : [String],
        required : true
    },

    startTime : {
        type : Date,
        required : true
    },

    endTime : {
        type : Date,
        required : true
    },

    isStreamed :{
        type : Boolean,
        default : false
    },

    isRecord : {
        type : Boolean,
        default : false
    },

    isLive : {
        type : Boolean,
        default : false
    },

    viewers: [
        {
            type: mongoose.Types.ObjectId,
            ref: 'vibe-users'
        }
    ],

    liveCount : {
        type : Number,
        default : 0
    },

    participants : [
        {
            type: mongoose.Types.ObjectId,
            ref: 'vibe-users'
        }
        
    ],

    participantCount : {
        type : Number,
        default : 0
    },

    channel_id : {
        type : String
    },

    playbackUrl : {
        type : String
    },

    rtmpEndpoint : {
        type : String
    }
},
    {timestamps : true}
);

const Event = mongoose.model('vibe-events', EventSchema);

module.exports = Event;
