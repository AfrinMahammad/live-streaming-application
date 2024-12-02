const mongoose = require('mongoose')

const Events = require('../models/Events');
const muxEvents = require('./muxController');
const awsEvents = require('./awsController');

require('dotenv').config();

const collectionName = 'vibe-admins';
const db = mongoose.connection;

// console.log('======================++++', db);

const live = async (req, res) => {

    try{
   
        const uuid = req.body.id;
        console.log('uuid......', uuid);
        const eventData = await Events.findOne({ eventId: uuid });

        if (!eventData) {
            return res.status(404).json({ message: 'Event does not exist!' });
        }

        console.log('event data....', eventData)

       const channel_id = eventData.channel_id;
       const host = eventData.host;
       let service;

       if(!channel_id){
            const hostData = await db.collection(collectionName).findOne({_id : host});
            service = hostData.service;
            console.log('service....', service);
       }else if(channel_id.substr(0, 4) === 'arn:'){
            service = 'aws'
       }else{
            service = "mux"
       }

       if(service === 'aws'){
           return awsEvents.goLiveOnAws(req, res);
        }

        else{
            return muxEvents.goLiveOnMux(req, res);
        }

    }catch(error){

        console.log('error fetching the details about live data', error);
        res.status(500).json({message:'this event is not exist on live'});

    }
    
}

module.exports = {live};