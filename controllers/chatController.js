const Events = require('../models/Events');
const Chat = require('../models/Chat');

const liveChat = async (req, res) => {

    const chatData = req.body;

    const uuid = req.body.id;

    const eventData = await Events.findOne({ eventId : uuid});
    const eventId = eventData._id;
 

    const chatDetails = await Chat.findOne({ eventId : eventId});

    if(chatDetails){

        const updateChat = await Chat.findOneAndUpdate(
            
                {eventId : eventId},
                {
                    ...chatData
                },
                { new : true }
            
        );

        if (updateChat) {
            console.log('updated chat....', updateChat);
            res.status(200).json({ success: "Chat added to database successfully", chatData : updateChat  });
        }
        else {
            res.status(401).json({ message: 'Failed to update the chat' });
        }

    }

    else{

        const newChat = new Chat({

            eventId : eventId,
            ...chatData
        });

        await newChat.save();

        if (newChat) {
            console.log('new chat....', newChat);
            res.status(200).json({ success: "chat details updated successfully", event : newChat  });
        }
        else {
            res.status(401).json({ message: 'Failed to update the chat' });
        }
    }

}

const pastChat = async (req, res) => {

    try{
        const uuid = req.params.id;
        const eventData = await Events.findOne({eventId : uuid});
        const id = eventData._id;
     
        const chatData = await Chat.findOne({ eventId : id}).select('-_id -eventId');
      

        if(!chatData){
           return  res.status(404).json({ message : 'Chat data not found' });
        }

        return res.status(200).json({ chatData : chatData });
    }
    catch(error){
        console.log('error', error);
        return res.status(500).json({ message : 'Internal server error'});
    }

}

module.exports = {liveChat, pastChat};
