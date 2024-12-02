const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const cors = require('cors')
const bodyParser = require('body-parser');

const adminRoutes = require('./routes/adminEventsRoutes');

const authRoutes = require('./routes/authRoutes');

const eventsRoutes = require('./routes/eventsRoutes');

const liveChat = require('./routes/chatRoutes');



const Users = require('./models/Users');
const Events = require('./models/Events');
const Chat = require('./models/Chat');

const sockets = require("./controllers/sockets");
require('./controllers/deleteInactiveChannelsController');

const app = express();
const http = require('http')
const { Server } = require('socket.io');

const server = http.createServer(app);

require('dotenv').config();

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
  }
})

require('dotenv').config();

app.use(bodyParser.json());

app.use(session({
  secret: process.env.SESSION_SECRET_KEY,
  resave: false,
  saveUninitialized: true
}));

app.use(express.json())

app.use(cors({
  origin: "*"
}));

app.post('/joinLive', async (req, res) => {

  try {
    const uuid = req.body.id;
   
    const email = req.body.email;
    const viewer = await Users.findOne({ email: email });
  
    if (!viewer) {
      res.status(404).json({ message: 'User not found' });
    }

    const viewerId = viewer._id;
    const viewerdata = {
      email: viewer.email,
      firstname: viewer.firstname,
      lastname: viewer.lastname,
      department: viewer.department
    }

    const liveEvent = await Events.findOne({ eventId: uuid });
    if (!liveEvent) {
      return res.status(404).json({ error: "Live event data not found" });
    }
    
    let liveCount = liveEvent.liveCount;
    let participantCount = liveEvent.participantCount;
    const isLive = liveEvent.isLive;
    let eventData = await Events.findOne({ eventId: uuid });
    if (isLive) {
      const isViewerPresent = liveEvent.viewers.includes(viewerId);

      if (!isViewerPresent) {
        eventData = Events.findOneAndUpdate(
          { eventId: uuid },
          {
            liveCount: liveCount + 1,
            participantCount: Math.max(participantCount, liveCount + 1),
            $addToSet: { viewers: viewerId, participants: viewerId }
          },
          { new: true }
        ).then(event => {
          
            io.to(uuid).emit('participantJoined', {eventId : uuid, viewerdata})
          
            res.status(200).json({ eventId: uuid, viewerdata: viewerdata, viewCount: eventData.liveCount });
        })  


      }
      else {

        res.status(200).json({ eventId: uuid, viewerdata: null, viewCount: eventData.liveCount });
      }
    }
    else {
      return res.status(400).json({ error: "Event is not live" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Internal server error' });
  }
})

app.post('/exitLive', async (req, res) => {
  try {
    const uuid = req.body.id;
  
    const email = req.body.email;
    const viewer = await Users.findOne({ email: email });

    const viewerId = viewer._id;


    const viewerdata = {
      email: viewer.email,
      firstname: viewer.firstname,
      lastname: viewer.lastname,
      department: viewer.department
    }

    const liveEvent = await Events.findOne({ eventId: uuid });
    if (!liveEvent) {
      return res.status(404).json({ error: "Event not found" });
    }
    let liveCount = liveEvent.liveCount;

    const isLive = liveEvent.isLive;
    let eventData = await Events.findOne({ eventId: uuid });
    if (isLive) {

      const isViewerPresent = liveEvent.viewers.includes(viewerId);

      console.log("--------------not live-----------------");
      if (isViewerPresent) {
        console.log("------------ not present-----------");
        eventData = Events.findOneAndUpdate(
          { eventId: uuid },
          {
            liveCount: liveCount - 1,
            $pull: { viewers: viewerId }
          },
          { new: true }
        ).then(event => {
          io.to(uuid).emit('participantLeft', {eventId : uuid, viewerdata})
          res.status(200).json({eventId: uuid,viewerdata,viewCount: event.liveCount})
          }) 

      }

      
    }
    else {
      return res.status(400).json({ error: "Event is not live" });
    }
  } catch (error) {
    console.error('Error exiting live event:', error);
    return res.status(500).json({ error: "Failed to exit live event" });
  }
});

PORT = process.env.PORT || 3300;

io.on('connection', (socket) => {
  console.log('New client connected')

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId)
    console.log('socket', roomId)
  })

  socket.on('message', async (roomId, data) => {
    console.log(roomId, data)
    try {

  
      const uuid = roomId;
  

      const email = data.email;
      const name = data.name;
      const senderId = data.senderId;
      const message = data.message;
      const time = data.time;

      const eventData = await Events.findOne({ eventId: uuid });
      const eventId = eventData._id;
    

      const chatDetails = await Chat.findOne({ eventId });

      const messageData = {
        email,
        name,
        senderId,
        message,
        time
      };

      if (chatDetails) {

        chatDetails.messages.push(messageData);

        const updatedChat = await Chat.findOneAndUpdate(
          { eventId: eventId },
          { $push: { messages: messageData } },
          { new: true, upsert: true }
        );
        io.to(roomId).emit('message', data)


        console.log('Updated chat:', updatedChat);

      } else {
        const newChat = new Chat({
          eventId: eventId,
          messages: [messageData]
        });

        await newChat.save();
        io.to(roomId).emit('message', data)

        if (newChat) {
          console.log('New chat created:', newChat);
        } else {
          console.error('Failed to create a new chat');
        }
      }
    } catch (error) {
      console.error('Error handling chat message:', error);
      io.to(roomId).emit('error', { message: error })
    }
  });

  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId)
  })

  socket.on('disconnect', () => {
    console.log('Client disconnect')
  })
})

const connect = () => {
  mongoose.connect(process.env.MONGO)
    .then(() => {
      console.log("Connected to DB");
    })
    .catch((err) => {
      throw err;
    });
}

app.use('/admin', adminRoutes);

app.use('/auth', authRoutes);

app.use('/events', eventsRoutes);

app.use('/chat', liveChat);

sockets.sendDataToRTMPEndPoint();

server.listen(PORT, () => {
  try {
    connect();
    console.log("Connected to server");
    console.log(`http://localhost:${PORT}`);
  } catch (err) {
    console.log(err);
  }
});

