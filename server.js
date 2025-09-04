// File: notification-server/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"]
  }
});

// MongoDB setup
mongoose.connect(process.env.MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Notification schema
const notificationSchema = new mongoose.Schema({
  title: String,
  message: String,
  userId: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// ==== AUTH REMOVED FOR SIMPLICITY ====
// io.use((socket, next) => {
//   const token = socket.handshake.auth.token;
//   if (!token) return next(new Error('Authentication error'));
//   socket.userId = token;
//   next();
// });

io.on('connection', (socket) => {
  console.log('✅ New client connected');

  // For testing, let the frontend manually assign userId (not secure)
  socket.on('register', (userId) => {
    socket.userId = userId;
    socket.join(userId);
    console.log(`🟢 Registered userId: ${userId}`);
  });

  socket.on('send-notification', async (data) => {
    try {
      const notification = new Notification({ ...data, read: false });
      await notification.save();
      io.to(data.userId).emit('notification', notification);
      console.log('✅ Notification sent:', notification.title);
    } catch (error) {
      console.error('❌ Error sending notification:', error);
    }
  });

  socket.on('mark-read', async (notificationId) => {
    try {
      await Notification.findByIdAndUpdate(notificationId, { read: true });
      console.log('✅ Notification marked as read:', notificationId);
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected');
  });
});

// REST endpoints

// Get notifications for a user
app.get('/api/notifications', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    
    const userNotifications = await Notification.find({ userId }).sort({ createdAt: -1 });
    res.json(userNotifications);
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Send a new notification
app.post('/api/send-notification', async (req, res) => {
  try {
    const { title, message, userId } = req.body;
    if (!title || !message || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const notification = new Notification({ title, message, userId });
    await notification.save();
    io.to(userId).emit('notification', notification);
    res.json({ success: true, notification });
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Delete a notification
app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedNotification = await Notification.findByIdAndDelete(id);
    
    if (!deletedNotification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true, message: 'Notification deleted successfully' });
    console.log('✅ Notification deleted:', id);
  } catch (error) {
    console.error('❌ Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Mark notification as read (REST endpoint)
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedNotification = await Notification.findByIdAndUpdate(
      id, 
      { read: true }, 
      { new: true }
    );
    
    if (!updatedNotification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true, notification: updatedNotification });
    console.log('✅ Notification marked as read:', id);
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`🚀 Notification server running on port ${PORT}`);
});