// server.js
const http = require('http');
const app = require('./app');
const { Server } = require('socket.io');
const pool = require('./config/db');
const { initCronJobs } = require('./services/cronJobs');

require('dotenv').config();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`⚡ WebSocket client connected: ${socket.id}`);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
  });
});

// Export io instance so controllers/services can emit events
app.set('socketio', io);

// Verify DB connection before starting server
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Failed to connect to database on startup:', err);
    process.exit(1);
  }
  console.log('🕒 Database time check passed:', res.rows[0].now);

  server.listen(PORT, () => {
    console.log(`🚀 RMS Server running on http://localhost:${PORT}`);
  });
});

initCronJobs();
console.log('⏰ Automated Background Cron Jobs Initialized.');