import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Gateway } from './classes/Gateway';

// --- Constants ---
const serverPort = Number(process.env.SERVER_PORT || 3004);
const clientAddr = Number(process.env.CLIENT_ADDR || "localhost:8080");

// --- App setup ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create HTTP server for Express + Socket.IO
const server = http.createServer(app);

// Create Socket.IO server (attached to the HTTP server)
const io = new SocketIOServer(server, {
  cors: {
    origin: clientAddr,
    credentials: true
  },
});

const gateway = new Gateway();

// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
    console.log('New Socket.IO connection:', socket.id);

    socket.emit('welcome', {
      message: 'Connected to Socket.IO server',
      timestamp: new Date().toISOString()
    });

    socket.on('disconnect', (reason) => { gateway.disconnect(socket, reason) });

    socket.on('createRoom', (data, callback) => { gateway.create_room(socket, data, callback) });
    
    socket.on('joinRoom', (data, callback) => { gateway.join_room(socket, data, callback) });

    socket.on('new_game', (data, callback) => {gateway.new_game(socket, data, io)});
    
    socket.on('handle_key_press', (data, callback) => { gateway.handle_key_press(socket, data) });

});


// --- Start server ---
server.listen(serverPort, () => {
  console.log(`Server running`);
  console.log(`Socket.IO server running`);
});
