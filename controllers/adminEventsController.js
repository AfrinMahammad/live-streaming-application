const Events = require('../models/Events');
const Admins = require('../models/Admin');



function getISTDate() {
    const timestamp = Date.now();
    const date = new Date(timestamp);
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + IST_OFFSET);
    console.log("Current Date:", istDate);
    return istDate;
}


function dateTime(date, time) {
    const strDate = "0000-00-00T00:00:00.000Z";
    console.log(strDate);
    const d = date.includes("/") ? date.split('/') : date.split('-');
    const r = d[2] + '-' + d[1] + '-' + d[0] + 'T' + time + ":00.000Z";
    console.log(r);
    const resDate = new Date(r);
    return resDate;
}

const createEvent = async (req, res) => {
  
    try {
        const eventData = req.body.eventData;
        const hostEmail = eventData.host;

        const startDate = eventData.startDate
        const startTime = eventData.startTime;
        const start = dateTime(startDate, startTime);

        const endDate = eventData.endDate;
        const endTime = eventData.endTime;
        const end = dateTime(endDate, endTime);

        const hostData = await Admins.findOne({ email : hostEmail });
  
        if (!hostData) {
            return res.status(404).json({ error: "Host not found" });
        }
        const newEvent = new Events({
            ...eventData,
            startTime: start,
            endTime: end,
            host: hostData._id
        });

        await newEvent.save();
        console.log('created event.....', newEvent);
        res.status(200).json({ success: "Event created successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

const updateEvent = async(req, res) => {
    try {
        const uuid = req.params.id;

        const eventData = req.body.eventData;
    
        const startDate = eventData.startDate
        const startTime = eventData.startTime;
        const start = dateTime(startDate, startTime)

        const endDate = eventData.endDate;
        const endTime = eventData.endTime;
        const end = dateTime(endDate, endTime);


        const updatedEvent = await Events.findOneAndUpdate(
            { eventId: uuid },
            {
                ...eventData,
                startTime : start,
                endTime : end
            },
            { new: true }
        ).populate({
            path: 'host',
            select: '-password -_id'
        }).exec();
    


        if (updatedEvent) {
            console.log('updated Event....', updatedEvent);
            res.status(200).json({ success: "Event details updated successfully", event : updatedEvent  });
        }
        else {
            res.status(401).json({ message: 'Failed to update the event' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

const deleteEvent = async (req, res) => {
    const uuid = req.params.id;
    try {
        const eventData = await Events.findOne({ eventId: uuid });

        if (!eventData) {
            res.status(404).json({ message: 'Event not found!' });
        }
        else {
            const event_id = eventData._id;
            const deleteMongoEvent = await Events.findByIdAndDelete({ _id: event_id });
            if (deleteMongoEvent) {
                console.log('event deleted successfully', deleteMongoEvent);
                res.status(200).json({ message: 'Event deleted successfully!' });
            }
            else {
                res.status(401).json({ message: 'Failed to delete the event' });
            }
        }
    } catch (error) {
        res.status(500).json({ message: 'Internal Server error!' });
    }
}

const adminSettings = async (req, res) => {
    
    try{
        const adminEmail = req.body.email;
        const service = req.body.service;
    
        
        const adminData = await Admins.findOne({ email : adminEmail });

     
        let serviceOpted = "";
        if(service===1){
            serviceOpted  = 'aws';
          
        }
        else if(service===2){
            serviceOpted = 'mux';
          
        }
       
        if(!adminData){
            return res.status(404).json({ error : 'Admin not found'});
        }

        const updateAdminData = await Admins.findOneAndUpdate(

            {email : adminEmail},
            {
                $set: {
                  service: serviceOpted
                }
              },
            {new : true}
        );

        if (updateAdminData) {
            
            res.status(200).json({ success: "admin details updated successfully", event : updateAdminData});

        }
        else {
            res.status(401).json({ message: 'Failed to update the admin details' });
        }
    } catch (error) {
        console.log('error.......', error);
        res.status(500).json({ message: 'Internal server error' });
    }

}


const myEvents = async (req, res) => {

    const currentISTDate = getISTDate();
    try{
 
        const email = req.body.email;
        const userData = await Users.findOne({ email : email});
        if(!userData){
            return res.status(404).json({ message : 'You are not authorised'});
        }
 
        const department = userData.department;
      
        const eventsData = await Events.find({ teams: { $in: department } }).populate({
            path : 'host',
            select : '-password -_id'
        }).exec();    
 
        const pastEvents = []
        const ongoingEvents = []
        const futureEvents = []
        eventsData.map(event => {

            if (event.isStreamed || currentISTDate > event.endTime) {
                pastEvents.push(event)
            }
            else if(event.isLive || (event.startTime < currentISTDate && event.endTime > currentISTDate)){
                ongoingEvents.push(event)
            }
            else{
                futureEvents.push(event)
            }
        });
        
        res.status(200).send({
            events:{
                pastEvents,
                ongoingEvents,
                futureEvents
            }
        });
    }
    catch(error){
    console.log(error)
        res.status(500).json({ error : 'Internal server error'});
    }

}


module.exports = {createEvent, deleteEvent, updateEvent, adminSettings, myEvents};