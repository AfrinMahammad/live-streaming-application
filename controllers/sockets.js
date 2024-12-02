const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8800 });
const { spawn } = require('child_process');
const Events = require('../models/Events');
 
let ffmpegProcess;
 
async function getRtmpEndpoint(eventId) {
  console.log('Fetching RTMP endpoint for eventId:', eventId);
  const eventData = await Events.findOne({ eventId });
  if (!eventData) {
    console.error('Event not found for eventId:', eventId);
    throw new Error('Event not found');
  }
  console.log('Found RTMP endpoint:', eventData.rtmpEndpoint);
  return eventData.rtmpEndpoint;
}
 
function sendDataToRTMPEndPoint() {
  console.log("Socket is on");
  wss.on('connection', (ws) => {
    console.log('Client connected');
 
    let eventId;
    ws.on('message', async (data) => {
      console.log('Received data:', data);
 
      if (isJsonString(data.toString())) {
        try {
          const message = JSON.parse(data.toString());
 
          if (message.eventId) {
            eventId = message.eventId;
            console.log('Received eventId:', eventId);
          }
 
          if (message.action === 'start') {
            if (!eventId) {
              throw new Error('No eventId specified in the start message.');
            }
 
            console.log('Starting stream for event:', eventId);
            try {
              const rtmpEndpoint = await getRtmpEndpoint(eventId);
              console.log('RTMP endpoint:', rtmpEndpoint);
              startFFmpeg(rtmpEndpoint);
            } catch (error) {
              console.error('Failed to start FFmpeg:', error);
            }
          } else if (message.action === 'stop') {
            console.log('Stopping FFmpeg');
            stopFFmpeg();
          } else {
            console.error('Unknown action received:', message.action);
          }
        } catch (err) {
          console.error('Error processing incoming message:', err);
        }
      } else {
        if (ffmpegProcess && ffmpegProcess.stdin.writable) {
          ffmpegProcess.stdin.write(data);
        } else {
          console.error('FFmpeg process is not running or stdin is not writable.');
        }
      }
    });
 
    ws.on('close', () => {
      console.log('Client disconnected');
      stopFFmpeg();
    });
 
    function startFFmpeg(rtmpEndpoint) {
      const args = [
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-f', 'flv',
        rtmpEndpoint
      ];
 
      console.log('Starting FFmpeg with args:', args);
 
      ffmpegProcess = spawn('ffmpeg', args);
 
      ffmpegProcess.stdin.on('error', (err) => {
        if (err.code === 'EPIPE') {
          console.error('EPIPE error: FFmpeg stdin closed unexpectedly');
          stopFFmpeg();
        } else {
          console.error('FFmpeg stdin error:', err);
        }
      });
 
      ffmpegProcess.stderr.on('data', (data) => {
        console.error(`FFmpeg stderr: ${data}`);
      });
 
      ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg process closed with code ${code}`);
        ffmpegProcess = null;
      });
 
      console.log('FFmpeg process started');
    }
 
    function stopFFmpeg() {
      if (ffmpegProcess) {
        console.log('Stopping FFmpeg process');
        ffmpegProcess.stdin.end();
        ffmpegProcess.kill('SIGINT');
        ffmpegProcess = null;
      }
    }
  });
 
  function isJsonString(str) {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }
}
 
module.exports = { sendDataToRTMPEndPoint };