import express from 'express';
import http from 'http';
import { Server as socketio } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);

// Configure Socket.IO for production
const io = new socketio(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*", // Configure this with your frontend URL
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Add basic middleware for production
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint for deployment platforms
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Store active users and their locations
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('send-location', (data) => {
    // Store user location
    activeUsers.set(socket.id, {
      ...data,
      lastSeen: new Date()
    });

    // Broadcast location to all users
    io.emit('receive-location', {
      id: socket.id,
      ...data
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from active users
    activeUsers.delete(socket.id);
    // Notify other users
    io.emit('user-disconnected', socket.id);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

app.get('/', (req, res) => {
  res.render("index.ejs");
});

// Get active users count (optional endpoint)
app.get('/api/users', (req, res) => {
  res.json({ 
    activeUsers: activeUsers.size,
    users: Array.from(activeUsers.keys())
  });
});

// Add this route to your server
app.get('/api/config', (req, res) => {
    res.json({
        openRouteApiKey: process.env.OPENROUTE_API_KEY
    });
});

// Use environment variable for port
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
