const mongoose = require('mongoose');
 
const Events = require('../models/Events');
const Users = require('../models/Users');
const Chat = require('../models/Chat');
const Admins = require('../models/Admin');
const muxEvents = require('../controllers/muxController');
const awsEvents = require('../controllers/awsController');
const { getVideoDurationInSeconds } = require('get-video-duration')
 
require('dotenv').config();
 
 
 
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
 
 
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
};
 
 
const s3Client = new S3Client(credentials);
 
 
 
function getISTDate() {
    const timestamp = Date.now();
    const date = new Date(timestamp);
    const IST_OFFSET = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + IST_OFFSET);
    console.log("Current Date:", istDate);
    return istDate;
}
 
 
// const fetchEvents = async (req, res) => {
 
//     const currentISTDate = getISTDate();
//     try{
 
//         const email = req.body.email;
//         const userData = await Users.findOne({ email : email});
//         if(!userData){
//             return res.status(404).json({ message : 'You are not authorised'});
//         }
 
//         const department = userData.department;
 
//         const eventsData = await Events.find({ teams: { $in: department } }).populate({
//             path : 'host',
//             select : '-password -_id'
//         }).exec();    
 
//         const pastEvents = []
//         const ongoingEvents = []
//         const futureEvents = []
//         eventsData.map(event => {
 
//             if (event.isStreamed || currentISTDate > event.endTime) {
//                 pastEvents.push(event)
//             }
//             else if(event.isLive){
//                 ongoingEvents.push(event)
//             }
//             else{
//                 futureEvents.push(event)
//             }
//         });
 
//         res.status(200).send({
//             events:{
//                 pastEvents,
//                 ongoingEvents,
//                 futureEvents
//             }
//         });
//     }
//     catch(error){
//     console.log(error)
//         res.status(500).json({ error : 'Internal server error'});
//     }
// }
 
const fetchEvents = async (req, res) => {
 
    const currentISTDate = getISTDate();
    try {
 
        const email = req.body.email;
        const userData = await Users.findOne({ email: email });
        if (!userData) {
            return res.status(404).json({ message: 'You are not authorised' });
        }
 
        const department = userData.department;
 
        const eventsData = await Events.find({ teams: { $in: department } }).populate({
            path: 'host',
            select: '-password -_id'
        }).exec();
 
        const pastEvents = []
        const ongoingEvents = []
        const futureEvents = []
        eventsData.map(event => {
 
            if (event.isStreamed || currentISTDate > event.endTime) {
                pastEvents.push(event)
            }
            else if (event.isLive || (event.startTime < currentISTDate && event.endTime > currentISTDate)) {
                ongoingEvents.push(event)
            }
            else {
                futureEvents.push(event)
            }
        });
 
        res.status(200).send({
            events: {
                pastEvents,
                ongoingEvents,
                futureEvents
            }
        });
    }
    catch (error) {
        console.log(error)
        res.status(500).json({ error: 'Internal server error' });
    }
 
}
 
 
 
 
const playbackUrl = async (req, res) => {
    try {
 
        const uuid = req.params.id;
        const eventData = await Events.findOne({ eventId: uuid });
 
        if (!eventData) {
            return res.status(404).json({ message: 'Event not found!' });
        }
 
        if (eventData.isStreamed) {
            return res.status(404).json({ message: 'Live Stream Ended' });
        }
        const id = eventData._id;
        console.log('id...====', id);
        const chatData = await Chat.findOne({ eventId: id }).select('-_id -eventId');
        console.log('eventData.....', eventData);
        console.log('chatData.....', chatData);
 
        const viewers = eventData.viewers;
 
        const viewersData = await Users.find({ _id: { $in: viewers } }).select('-password -_id');
 
        console.log('part/....', viewersData);
 
 
        const channelType = eventData.teams[0];
 
 
        let url = eventData.playbackUrl;
 
        let privateChannelUrl;
 
        if (channelType === 'private') {
 
            const channel_id = eventData.channel_id;
            const expiryTime = '1h';
            let token;
 
            if (channel_id.substr(0, 4) === 'arn:') {
                token = await awsEvents.generatePlaybackToken(channel_id, expiryTime);
                url = 'https://d23elikxbgl21s.cloudfront.net/api' + url.split('/api')[1];
                console.log('url======', url);
            }
 
            else {
                token = muxEvents.generateToken(url);
 
            }
 
            privateChannelUrl = `${url}?token=${token}`;
 
            console.log('Private Playback URL:', privateChannelUrl);
 
 
            return res.status(200).json({ playbackUrl: privateChannelUrl, viewers: viewersData, chatData: chatData });
        }
 
        else {
            return res.status(200).json({ playbackUrl: url, viewers: viewersData, chatData: chatData });
        }
 
 
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ error: 'internal server error' });
    }
}
 
const startBroadcasting = async (req, res) => {
    console.log('started broadcasting');
    try {
        const uuid = req.body.id;
        console.log('uuid......', uuid);
        const eventData = await Events.findOne({ eventId: uuid }).populate({
            path: 'host',
            select: '-_id -password'
        });
 
        if (!eventData) {
            return res.status(404).json({ message: 'Event does not exist!' });
        }
 
        console.log('event data...', eventData);
 
        let service;
        const channel_id = eventData.channel_id;
        if (channel_id.substr(0, 4) === 'arn:') {
            service = 'aws';
        }
        else {
            service = 'mux';
        }
 
        console.log('==================================', service);
        let isLive, updatedEvent;
        async function pollStatus() {
            if (service === "aws") {
                isLive = await awsEvents.getChannelStatus(channel_id);
            } else if (service === "mux") {
                isLive = await muxEvents.getChannelStatus(channel_id);
            }
            if (isLive === 'LIVE') {
                updatedEvent = await Events.findOneAndUpdate(
                    { eventId: uuid },
                    { isLive: true },
                    { new: true }
                );
 
                console.log('event data....', updatedEvent);
                return 1;
            } else {
                return 0;
            }
        }
 
        async function pollUntilLive() {
            const status = await pollStatus();
            if (status === 1) {
                console.log("live stareated successfully")
                return res.status(200).json({ message: 'Broadcasting started successfully!', eventData });
            } else {
                console.log("still waiting to go live");
                setTimeout(pollUntilLive, 5000);
            }
        }
 
        pollUntilLive();
 
    } catch (error) {
        console.log('internal server error', error);
        res.status(500).json({ message: 'Internal server error!' });
    }
};
 
const stopBroadcasting = async (req, res) => {
    let updatedEventData;
    try {
        const uuid = req.body.id;
 
        const eventData = await Events.findOne({ eventId: uuid }).populate({
            path: 'host',
            select: '-_id -password'
        });
 
        if (!eventData) {
            return res.status(404).json({ message: 'Event does not exist!' });
        }
 
 
        let service;
        const channel_id = eventData.channel_id;
        if (channel_id.substr(0, 4) === 'arn:') {
            service = 'aws';
        }
        else {
            service = 'mux';
        }
        let isLive, updatedEvent;
        async function pollStatus() {
            if (service === "aws") {
                isLive = await awsEvents.getChannelStatus(channel_id);
            } else {
                isLive = await muxEvents.getChannelStatus(channel_id);
            }
 
            if (isLive === 'NOT LIVE') {
                if (service === "mux" && eventData.isRecord) {
                    const response = await muxEvents.getChannelDetails(channel_id);
                    updatedEvent = await Events.findOneAndUpdate(
                        { eventId: uuid },
                        {
                            channel_id: response.data.data.recent_asset_ids.join(','),
                            isLive: false,
                            isStreamed: true
                        },
                        { new: true }
                    )
                    console.log('event data....', updatedEvent);
                } else {
                    updatedEvent = await Events.findOneAndUpdate(
                        { eventId: uuid },
                        {
                            isLive: false,
                            isStreamed: true
                        },
                        { new: true }
                    );
 
                }
 
                updatedEventData = await Events.findOne({ eventId: uuid }).populate({
                    path: 'host',
                    select: '-_id -password'
                });
 
                console.log('here',updatedEventData)
                return 1;
            } else {
                return 0;
            }
        }
 
        async function pollUntilLive() {
            const status = await pollStatus();
            if (status === 1) {
                console.log("Channel is now on live....!")
                let result;
                if (service === "aws") {
                    result = await awsEvents.deleteChannel(channel_id);
                } else {
                    result = await muxEvents.deleteChannel(channel_id);
                }
                console.log('result......', result);
 
                if (result) {
                    console.log('stop broadcast',eventData)
                    console.log("abhiteja samudrala",updatedEventData)
                    return res.status(200).json({ message: 'Broadcasting stopped successfully!', eventData: updatedEventData });
                }
 
            } else {
                console.log("Still fetching the status of channel...!");
                setTimeout(pollUntilLive, 5000);
            }
        }
 
        pollUntilLive();
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}
 
// const stopBroadcasting = async (req, res) => {
//     try {
//         const uuid = req.body.id;
 
//         const eventData = await Events.findOne({ eventId: uuid }).populate({
//             path: 'host',
//             select: '-_id -password'
//         });
 
//         if (!eventData) {
//             return res.status(404).json({ message: 'Event does not exist!' });
//         }
 
 
//         let service;
//         const channel_id = eventData.channel_id;
//         if (channel_id.substr(0, 4) === 'arn:') {
//             service = 'aws';
//         }
//         else {
//             service = 'mux';
//         }
//         let isLive, updatedEvent;
//         async function pollStatus() {
//             if (service === "aws") {
//                 isLive = await awsEvents.getChannelStatus(channel_id);
//             } else {
//                 isLive = await muxEvents.getChannelStatus(channel_id);
//             }
 
//             if (isLive === 'NOT LIVE') {
//                 if (service === "mux" && eventData.isRecord) {
//                     const response = await muxEvents.getChannelDetails(channel_id);
//                     updatedEvent = await Events.findOneAndUpdate(
//                         { eventId: uuid },
//                         {
//                             channel_id: response.data.data.recent_asset_ids.join(','),
//                             isLive: false,
//                             isStreamed: true
//                         },
//                         { new: true }
//                     )
//                     console.log('event data....', updatedEvent);
//                 } else {
//                     updatedEvent = await Events.findOneAndUpdate(
//                         { eventId: uuid },
//                         {
//                             isLive: false,
//                             isStreamed: true
//                         },
//                         { new: true }
//                     );
 
 
 
//                 }
//                 return 1;
//             } else {
//                 return 0;
//             }
//         }
 
//         async function pollUntilLive() {
//             const status = await pollStatus();
//             if (status === 1) {
//                 console.log("Channel is now on live....!")
//                 let result;
//                 if (service === "aws") {
//                     result = await awsEvents.deleteChannel(channel_id);
//                 } else {
//                     result = await muxEvents.deleteChannel(channel_id);
//                 }
//                 console.log('result......', result);
 
//                 if (result) {
//                     console.log('stop broadcast',eventData)
//                     return res.status(200).json({ message: 'Broadcasting stopped successfully!', eventData: eventData });
//                 }
 
//             } else {
//                 console.log("Still fetching the status of channel...!");
//                 setTimeout(pollUntilLive, 5000);
//             }
//         }
 
//         pollUntilLive();
//     } catch (error) {
//         res.status(500).json({ message: 'Internal server error' });
//     }
// }
 
 
function secondsToHMS(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
 
    const pad = (num) => String(num).padStart(2, '0');
 
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}
async function getVideoDuration(url) {
    try {
        const duration = await getVideoDurationInSeconds(url);
        console.log(duration);
        return secondsToHMS(duration);
    } catch (error) {
        console.error('Error getting video duration:', error);
    }
}
 
 
 
const viewRecording = async (req, res) => {
    try {
        const uuid = req.body.id;
        const eventData = await Events.findOne({ eventId: uuid });
        if (!eventData) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const channel_id = eventData.channel_id;
        let videoUrls;
        if (channel_id.substr(0, 4) === "arn:") {
            const arn = channel_id.split('/').pop();
            videoUrls = await awsEvents.listRecordings(arn);
        } else {
            videoUrls = await muxEvents.getRecentAssets(channel_id, eventData.teams[0]);
        }
 
        const chatData = await Chat.findOne({ eventId: eventData._id }).select('-_id -eventId');
        if (!chatData) {
            return res.status(200).json({ urls: videoUrls, eventData: eventData, chatData: { messages: [] } });
 
        }
 
        console.log("videoUrls:", videoUrls);
        let duration = await getVideoDuration(videoUrls[0])
       
        res.status(200).json({ urls: videoUrls, eventData: eventData, chatData: chatData ,duration: duration});
    } catch (error) {
        console.error('Error listing objects:', error);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
};
 
const deleteRecording = async (req, res) => {
 
    try {
        const eventId = req.params.id;
        console.log('id...', eventId);
        const eventData = await Events.findOne({ eventId: eventId });
        if (!eventData) {
            res.status(404).json({ message: 'Recording not found!' });
        }
 
        console.log('eventdata...', eventData);
        let response;
 
        if (eventData.isRecord) {
 
            const channel_id = eventData.channel_id;
            if (channel_id.substr(0, 3) === "arn") {
                const arn = channel_id.split('/').pop();
 
                const bucketName = process.env.RECORDING_BUCKET;
                const prefix = `ivs/v1/${process.env.AWS_ACCOUNT_ID}/${arn}/`;
 
                const s3Client = new S3Client({ region: process.env.AWS_REGION });
 
                const listParams = {
                    Bucket: bucketName,
                    Prefix: prefix
                };
 
                const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));
                const deleteParams = {
                    Bucket: bucketName,
                    Delete: { Objects: [] }
                };
 
                listedObjects.Contents.forEach(({ Key }) => {
                    deleteParams.Delete.Objects.push({ Key });
                });
 
                response = await s3Client.send(new DeleteObjectsCommand(deleteParams));
                console.log("Deleted objects:", response.Deleted);
 
            } else {
                response = await muxEvents.deleteRecordings(channel_id);
                if (!response) {
                    res.status(500).json({ error: "Failed to delete recordings" });
                }
 
            }
            if (response) {
 
                const updateEvent = await Events.findOneAndUpdate(
                    { eventId: eventId },
                    { isRecord: false },
                    { new: true }
                )
 
                console.log('updte event', updateEvent);
 
            }
            res.status(200).json({ message: "Recordings deleted successfully" });
        }
        else {
            console.log('wuop3457');
            res.status(404).json({ message: "cannot fetch recordings" });
        }
 
    } catch (error) {
        console.error('Error deleting objects:', error);
        res.status(500).json({ error: "Failed to delete recordings" });
    }
 
}
 
const live = async (req, res) => {
 
    try {
 
        const uuid = req.body.id;
 
        const eventData = await Events.findOne({ eventId: uuid });
 
        if (!eventData) {
            return res.status(404).json({ message: 'Event does not exist!' });
        }
 
 
        const host = eventData.host;
 
        const hostData = await Admins.findOne({ _id: host });
        service = hostData.service;
        console.log('service....', service);
 
        if (service === 'aws') {
            return awsEvents.goLiveOnAws(req, res);
        }
 
        else {
            return muxEvents.goLiveOnMux(req, res);
        }
 
    } catch (error) {
 
        console.log('error fetching the details about live data', error);
        res.status(500).json({ message: 'this event is not exist on live' });
 
    }
 
}
 
const analytics = async (req, res) => {
    try {
        const email = req.body.email;
        
        const hostData = await Admins.findOne({ email: email });    
        const events = await Events.find({ host: hostData._id, isStreamed: true });
        if (!events || events.length === 0) {
            return res.status(404).json({ message: 'Host has no past events.' });
        }
        
        let eventNames = [], participantCount = [], chatCount = [];
        
        for (const event of events) {
            eventNames.push(event.title);
            participantCount.push(event.participantCount);
            const chatData = await Chat.findOne({ eventId: event._id });
            if (!chatData) {
                chatCount.push(0);
            } else {
                chatCount.push(chatData.messages.length);
            }
        }
        res.status(200).json({ eventNames: eventNames, participantCount: participantCount, chatCount: chatCount });
    } catch (error) {
        console.error('Error fetching event analytics:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
 
module.exports = { fetchEvents, playbackUrl, startBroadcasting, stopBroadcasting, viewRecording, deleteRecording, live, analytics };