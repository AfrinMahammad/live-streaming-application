const mongoose = require("mongoose");
const Events = require("../models/Events");
require("dotenv").config();
const cron = require("node-cron");
const muxEvents = require("../controllers/muxController");
 
const { IvsClient, DeleteChannelCommand } = require("@aws-sdk/client-ivs");
 
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
};
 
const ivsClient = new IvsClient(credentials);
 
const connect = () => {
  mongoose
    .connect(process.env.MONGO)
    .then(() => {
      console.log("Connected to DB");
    })
    .catch((err) => {
      throw err;
    });
};
 
connect();
 
async function getISTDate() {
  const timestamp = Date.now();
  const date = new Date(timestamp);
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + IST_OFFSET);
  return istDate;
}
 
async function deleteInactiveChannels() {
  const currentTime = await getISTDate();
 
  try {
    const channels = await Events.find(
      {},
      { channel_id: 1, endTime: 1, isLive : 1 }
    ).exec();
    const twentyFourHoursAgo = new Date(currentTime - 24 * 60 * 60 * 1000);
 
    const inactiveChannels = channels.filter((channel) => {
      const endTime = channel.endTime;
      return currentTime > endTime && endTime > twentyFourHoursAgo && channel.channel_id && !channel.isLive && !channel.isStreamed; 
    });
 
    console.log("Inactive channels:", inactiveChannels);
 
    for (const channel of inactiveChannels) {
        if (channel.channel_id.substr(0, 4) === "arn:") {
          const deleteChannelCommand = new DeleteChannelCommand({
            arn: channel.channel_id,
          });
          await ivsClient.send(deleteChannelCommand);
          console.log(`Deleted channel: ${channel.channel_id}`);
        } else {
          await muxEvents.deleteChannel(channel.channel_id);
          console.log(`Deleted channel: ${channel.channel_id}`);
        }
      }
      console.log("All inactive channels deleted successfully");
    } catch (error) {
    console.error("Error fetching events:", error);
  }
}
 
cron.schedule("0 0 * * *", async () => {
  console.log("Running cron job to delete inactive channels...");
 
  await deleteInactiveChannels();
});