const mongoose = require('mongoose');
const Events = require('../models/Events');

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
 
const privateKeyPath = path.resolve(__dirname, '../private-key.pem');
 
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

require('dotenv').config();

const { IvsClient, CreateChannelCommand, DeleteChannelCommand, GetStreamCommand, GetChannelCommand, ListStreamKeysCommand, GetStreamKeyCommand } = require('@aws-sdk/client-ivs');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');


const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
};

const ivsClient = new IvsClient(credentials);
const s3Client = new S3Client(credentials);

async function getChannelStatus(channelArn) {
    try {
        const input = {
            channelArn: channelArn,
        };
        const command = new GetStreamCommand(input);
        const response = await ivsClient.send(command);

        if (response.stream) {
            return 'LIVE';
        }
    } catch (error) {
        if (error.name === 'ResourceNotFoundException' || error.name === 'ChannelNotBroadcasting') {
            return 'NOT LIVE';
        } else {
            console.error("Error fetching stream status:", error);
            return 'Error';
        }
    }
}

async function createChannel(isRecord, channelType, uuid) {

    let params = {
        latencyMode: 'LOW',
        type: 'STANDARD'
    };

    if (isRecord) {
        params.name = `stream-record_${uuid}`;
        if (channelType === 'private') {
            params.authorized = true;
            params.recordingConfigurationArn = process.env.IVS_RECORDINGCONFIG_ARN;
        } else {
            params.recordingConfigurationArn = process.env.IVS_RECORDINGCONFIG_ARN;
        }
    } else {
        params.name = `stream-Nonrecord_${uuid}`;
        if (channelType === 'private') {
            params.authorized = true;
        }
    }

    const command = new CreateChannelCommand(params);
    const response = await ivsClient.send(command);

    return {
        id: response.channel.arn,
        url: response.channel.playbackUrl,
        streamKey: response.streamKey.value,
        endPoint: response.channel.ingestEndpoint
    };

}

async function deleteChannel(channelArn) {
    try {
        const params = {
            arn: channelArn
        };
        const command = new DeleteChannelCommand(params);
        const response = await ivsClient.send(command);
        console.log('Delete channel response:', response);

        if (response) {
            return true;
        } else {
            console.error('Unexpected response while deleting channel:', response);
            return false;
        }
    } catch (error) {
        console.error('Error deleting channel:', error);
        return false;
    }
}

const goLiveOnAws = async (req, res) => {

    try {
        const uuid = req.body.id;
        const eventData = await Events.findOne({ eventId: uuid }).populate({
            path: 'host',
            select: '-password -_id'
        }).exec();

        console.log('event data....', eventData)


        if (!eventData) {
            return res.status(404).json({ message: 'Event does not exist!' });
        }

        const isRecord = eventData.isRecord;
        const channelType = eventData.teams[0];

        const channel_id = eventData.channel_id;
        console.log('channel id...', channel_id);
        let streamKey, endPoint;

        if (channel_id) {

            if (channel_id.substr(0, 4) === 'arn:') {
                const params_1 = {
                    arn: channel_id
                }
                const command_1 = new GetChannelCommand(params_1);
                const response_1 = await ivsClient.send(command_1);
                console.log('response_1........', response_1);

                endPoint = response_1.channel.ingestEndpoint;

                console.log('end point....', endPoint);

                const params_2 = {
                    channelArn: channel_id
                }

                const command_2 = new ListStreamKeysCommand(params_2);
                const response_2 = await ivsClient.send(command_2);

                console.log('response_2.......', response_2);

                const streamKeyArn = response_2.streamKeys[0].arn;

                console.log('stream key....', streamKeyArn);

                const command_3 = new GetStreamKeyCommand({ arn: streamKeyArn });
                const response_3 = await ivsClient.send(command_3);
                streamKey = response_3.streamKey.value;
                console.log('response_3.......', streamKey);
            }
            else {
                const response = await createChannel(isRecord, channelType, uuid);
                const channelArn = response.id;
                const playbackUrl = response.url;
                streamKey = response.streamKey;
                endPoint = response.endPoint;

                const updatedEvent = await Events.findOneAndUpdate(
                    { eventId: uuid },
                    {
                        channel_id: channelArn,
                        playbackUrl: playbackUrl,
                        rtmpEndpoint: "rtmps://123407cc05a0.global-contribute.live-video.net:443/app/" + streamKey
                    },
                    { new: true }
                );
                console.log('event data....', updatedEvent);
            }

        }
        else {
            const response = await createChannel(isRecord, channelType, uuid);
            const channelArn = response.id;
            const playbackUrl = response.url;
            streamKey = response.streamKey;
            endPoint = response.endPoint;

            const updatedEvent = await Events.findOneAndUpdate(
                { eventId: uuid },
                {
                    channel_id: channelArn,
                    playbackUrl: playbackUrl,
                    rtmpEndpoint: "rtmps://123407cc05a0.global-contribute.live-video.net:443/app/" + streamKey
                },
                { new: true }
            );
            console.log('event data....', updatedEvent);
        }
        res.status(200).json({ streamKey: streamKey, endPoint: endPoint, success: eventData });
    } catch (error) {
        console.error("Error starting broadcasting:", error);
        res.status(500).json({ error: "Failed to start broadcasting" });
    }
};

async function listRecordings(channelId) {
    try {
        const recordingPrefix = `ivs/v1/${process.env.AWS_ACCOUNT_ID}/${channelId}/`;
        const params = {
            Bucket: process.env.RECORDING_BUCKET,
            Prefix: recordingPrefix
        };

        let objects = [];
        let continuationToken = null;

        do {
            const data = await s3Client.send(new ListObjectsV2Command({ ...params, ContinuationToken: continuationToken }));
            objects = objects.concat(data.Contents);
            continuationToken = data.NextContinuationToken;
        } while (continuationToken);

        if (objects.length === 0) {
            console.log('No recordings found.');
            return;
        }

        const m3u8Files = objects.filter(obj => obj.Key.endsWith('master.m3u8'));
        let videoUrls = []
        if (m3u8Files.length > 0) {
            m3u8Files.forEach(file => {
                const m3u8Url = `https://d23elikxbgl21s.cloudfront.net/${file.Key}`;
                videoUrls.push(m3u8Url);
                console.log('M3U8 URL:', m3u8Url);
            });
        } else {
            console.log('No .m3u8 files found.');
        }
        return videoUrls;
    } catch (err) {
        console.error('Error listing recordings:', err);
    }
}

// const audioVideoData = async (req, res) => {
//     const AUDIO_DEVICE_NAME = 'defaultMicrophone';
//     const VIDEO_DEVICE_NAME = 'defaultCamera';

//     // Mute audio
//     let audioStream = ivsClient.getAudioInputDevice(AUDIO_DEVICE_NAME);
//     console.log('audio stream', audioStream);
//     if (audioStream) {
//         audioStream.getAudioTracks()[0].enabled = false;
//     }
//     //unmute
//     else if(!audioStream){
//         audioStream.getAudioTracks()[0].enabled = true;
//     }

//     // Hide video
//     let videoStream = ivsClient.getVideoInputDevice(VIDEO_DEVICE_NAME).source;
//     console.log('video stream', videoStream);
//     if (videoStream) {
//         videoStream.getVideoTracks()[0].enabled = false;
//     }

//     //un-hide video
//     else if(!videoStream){
//         videoStream.getVideoTracks()[0].enabled = true;
//     }


// }

// const audioVideoData = async (req, res) => {
//     const AUDIO_DEVICE_NAME = 'defaultMicrophone';
//     const VIDEO_DEVICE_NAME = 'defaultCamera';

//     try {
//         // Mute audio
//         const audioParams = {
//             channelArn: 'arn:aws:ivs:ap-south-1:058264369877:channel/C8BImZx2UF3D', // Replace with your actual channel ARN
//             audioMuted: true
//         };
//         await ivsClient.updateChannel(...audioParams).promise();

//         // Hide video
//         const videoParams = {
//             channelArn: 'arn:aws:ivs:ap-south-1:058264369877:channel/C8BImZx2UF3D', // Replace with your actual channel ARN
//             videoHidden: true
//         };
//         await ivsClient.updateChannel(...videoParams).promise();

//         // Respond to the client with success message
//         res.status(200).json({ message: 'Audio muted and video hidden successfully.' });
//     } catch (error) {
//         console.error('Error updating channel:', error);
//         res.status(500).json({ error: 'Failed to update channel state.' });
//     }
// };



const audioVideoData = async (req, res) => {
    const AUDIO_DEVICE_NAME = 'defaultMicrophone';
    const VIDEO_DEVICE_NAME = 'defaultCamera';

    try {
        // Example: Update channel to mute audio
        const audioParams = {
            channelArn: 'arn:aws:ivs:ap-south-1:058264369877:channel/C8BImZx2UF3D', // Replace with your actual channel ARN
            request: {
                audioConfiguration: {
                    muted: true
                }
            }
        };
        await ivsClient.putChannelSettings(audioParams).promise();

        // Example: Update channel to hide video
        const videoParams = {
            channelArn: 'arn:aws:ivs:ap-south-1:058264369877:channel/C8BImZx2UF3D', // Replace with your actual channel ARN
            request: {
                videoConfiguration: {
                    hidden: true
                }
            }
        };
        await ivsClient.putChannelSettings(videoParams).promise();

        // Respond to the client with success message
        res.status(200).json({ message: 'Audio muted and video hidden successfully.' });
    } catch (error) {
        console.error('Error updating channel:', error);
        res.status(500).json({ error: 'Failed to update channel state.' });
    }
};


function generatePlaybackToken(channelArn, expireTime) {
    const payload = {
        "aws:channel-arn": channelArn,
    };

    return jwt.sign(payload, privateKey, { algorithm: 'ES384', expiresIn: '1h' });
}

module.exports = { getChannelStatus, deleteChannel, goLiveOnAws, listRecordings, generatePlaybackToken, audioVideoData };


