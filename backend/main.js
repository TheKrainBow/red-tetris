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
  pingInterval: 25000,
  pingTimeout: 60000,
  cors: {
    origin: clientAddr,
    credentials: true
  },
});

const gateway = new Gateway(io);

// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
    console.log('New Socket.IO connection:', socket.id);

    socket.emit('welcome', {
      message: 'Connected to Socket.IO server',
      timestamp: new Date().toISOString()
    });

    socket.on('disconnect', (reason) => { gateway.disconnect(socket, reason) });
    
    socket.on('join_room', async (data, callback) => {
      const response = await gateway.join_room(socket, data);
      callback && callback(response);
    });

    socket.on('start_game', async (data, callback) => {
      const response = await gateway.start_game(socket, data, io);
      callback && callback(response);
    });

    socket.on('player_kick', async (data, callback) => {
      const response = await gateway.player_kick(socket, data, io);
      callback && callback(response);
    });
    
    socket.on('handle_key_press', async (data, callback) => {
      const response = await gateway.handle_key_press(socket, data, io);
      callback && callback(response);
    });

    socket.on('leave_room', async (data, callback) => {
      const response = await gateway.leave_room(socket, data);
      callback && callback(response);
    });

    socket.on('room_list', async (data, callback) => {
      const response = await gateway.room_list(socket, data);
      callback && callback(response);
    });

    socket.on('subscribe_lobby', async (data, callback) => {
      const response = await gateway.subscribe_lobby(socket, data);
      callback && callback(response);
    });

    socket.on('unsubscribe_lobby', async (data, callback) => {
      const response = await gateway.unsubscribe_lobby(socket, data);
      callback && callback(response);
    });

    socket.on('update_room_settings', async (data, callback) => {
      const response = await gateway.update_room_settings(socket, data);
      callback && callback(response);
    });
});


// --- Start server ---
server.listen(serverPort, () => {
  console.log(`Server running`);
  console.log(`Socket.IO server running`);
});
