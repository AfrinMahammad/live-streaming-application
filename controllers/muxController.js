// process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
const Mux = require('@mux/mux-node');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Events = require('../models/Events');
require('dotenv').config();
 
const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_TOKEN_SECRET
});
  
const privateKey = fs.readFileSync('mux-private-key.pem', 'utf8');
 
const auth = {
  username: process.env.MUX_TOKEN_ID,
  password: process.env.MUX_TOKEN_SECRET
}
 
function generateToken(playbackUrl) {
  const playbackId = playbackUrl.split('/').pop().split('.')[0];
  console.log("mux-playback-id",playbackId);
  return jwt.sign(
    {
      sub: playbackId,
      aud: "v",
      exp: Math.floor(Date.now() / 1000) + (60 * 60),
      kid: process.env.MUX_SIGNING_KEY_ID
    },
    privateKey,
    { algorithm: 'RS256' }
  );
}
 
async function createChannel(isRecord, channelType) {
  try{
    const liveStreamOptions = {
      playback_policy: channelType === 'public' ? 'public' : 'signed',
      new_asset_settings: { playback_policy: channelType === 'public' ? 'public' : 'signed' },
      reconnect_window: 15,
      latency_mode: "reduced",
      record: isRecord
    };
  
    const liveStream = await mux.video.liveStreams.create(liveStreamOptions);
    console.log(liveStream);
    return {
      id: liveStream.id,
      url: `https://stream.mux.com/${liveStream.playback_ids[0].id}.m3u8`,
      streamKey: liveStream.stream_key,
      endPoint: `rtmps://global-live.mux.com:443/app/${liveStream.stream_key}`
    };
  }catch(error){
    console.log('Error creating a channel:', error);
    return error;
  }
}
 
async function deleteChannel(liveStreamId){
    try {
      const url = `https://api.mux.com/video/v1/live-streams/${liveStreamId}`;
      await axios.delete(url, {
        headers: {
          'Content-Type': 'application/json'
        },
        auth: auth
      });
      return true;
    } catch (error) {
      console.error('Error deleting live stream:', error);
      return false;
    }
}
 
async function getChannelDetails(liveStreamId){
  try{
    const response = await axios.get(`https://api.mux.com/video/v1/live-streams/${liveStreamId}`, {
      headers: {
        'Content-Type': 'application/json'
      },
      auth: auth
    });
    return response;
  }catch{
    console.log('Error fetch Channel Details', error);
    return error;
  }
}
 
async function getChannelStatus(liveStreamId){
  try{
    const response = await getChannelDetails(liveStreamId);
    const status = response.data.data.status;
    if(status === 'active'){
      return 'LIVE';
    }else{
      return 'NOT LIVE';
    }
  }catch(error){
    console.log('Error fetch Channel Status', error);
    return error;
  }
}
 
async function getAssetDetails(assetId){
  try {
    const response = await axios.get(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: {
        'Content-Type': 'application/json'
      },
      auth: auth
    });
    return response.data.data;
  } catch (error) {
    console.error('Error fetching asset info:', error);
    return error;
  }
}
 
async function getRecentAssets(channelId, channelType){
  try {
    const assets = channelId.split(",");
    console.log("assets:", assets);
    let recordings = [];
 
    for (const asset of assets) {
      console.log("asset:", asset);
      const res = await getAssetDetails(asset);
      console.log("res:", res);
      const playbackUrl = `https://stream.mux.com/${res.playback_ids[0].id}.m3u8`;
      if(channelType === "public"){
        recordings.push(playbackUrl);
      }else{
        const token = generateToken(playbackUrl);
        recordings.push(`${playbackUrl}?token=${token}`);
      }
    }
    console.log(recordings);
    return recordings;
  } catch(error) {
    console.log('Error fetching Recordings', error);
    return error;
  }
}

 
async function deleteAsset(assetId){
  try {
    const response = await axios.delete(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      auth: auth
    });
    console.log('Asset deleted successfully');
    return 1;
  } catch (error) {
    console.error('Error deleting asset:', error);
    return 0;
  }
}
 
async function deleteRecordings(channelId){
  try{
    const assets = channelId.split(",");
    if(assets){
      assets.forEach((asset) => {
        const res = deleteAsset(asset);
        if(!res){
          return 0;
        }
      });    
    }
    return 1;
  }catch(error){
    return 0;
  }
}
 
const goLiveOnMux = async (req, res) => {
  try{
    const uuid = req.body.id;
    console.log('uuid:', uuid);
    const eventData = await Events.findOne({ eventId: uuid });
    if(!eventData){
      return res.status(404).json({ message: 'Event does not exist!' });
    }
    console.log('event data:', eventData);
    const isRecord = eventData.isRecord;
    const channelType = eventData.teams[0];
    let channel_id = eventData.channel_id;
    console.log('channel_id:', channel_id);
 
    let streamKey, endPoint;
    if(channel_id){
      if(channel_id.substr(0, 4)!== 'arn:'){
        console.log('1234567890');
          const channel = await getChannelDetails(channel_id);
          streamKey = channel.data.data.stream_key;
          endPoint = "rtmps://global-live.mux.com:443/app";
      }
      else{
            const response = await createChannel(isRecord, channelType);
            console.log("channel created: ", response);
            channel_id = response.id;
            const playbackUrl = response.url;
            streamKey = response.streamKey;
            endPoint = response.endPoint;
     
            const updatedEvent = await Events.findOneAndUpdate(
              { eventId: uuid },
              {
                  channel_id: channel_id,
                  playbackUrl: playbackUrl,
                  rtmpEndpoint : endPoint
              },
              { new: true }
          );
          console.log('event data:', updatedEvent);
        }
  }else{
   
        const response = await createChannel(isRecord, channelType);
        console.log("channel created: ", response);
        channel_id = response.id;
        const playbackUrl = response.url;
        streamKey = response.streamKey;
        endPoint = response.endPoint;
 
        const updatedEvent = await Events.findOneAndUpdate(
          { eventId: uuid },
          {
              channel_id: channel_id,
              playbackUrl: playbackUrl,
              rtmpEndpoint : endPoint
          },
          { new: true }
      );
      console.log('event data:', updatedEvent);
    }
    res.status(200).json({ streamKey: streamKey, endPoint: endPoint, success: eventData });
  }catch(error){
    console.error("Error while trying to go live:", error);
    res.status(500).json({ error: "Failed to go live" });
  }
}
 
module.exports = { createChannel, deleteChannel, getChannelStatus, getRecentAssets, goLiveOnMux, deleteRecordings, getChannelDetails, getAssetDetails, generateToken };