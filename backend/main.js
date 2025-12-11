import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Gateway } from './classes/Gateway';
import { Database } from './classes/Database';
import { Shop } from './classes/Shop';

// --- Constants ---
const serverPort = Number(process.env.SERVER_PORT || 3004);
const clientAddr = Number(process.env.CLIENT_ADDR || "localhost:8080");

// --- App setup ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create a new instance of the Database class
const db = new Database();
db.init();

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

const shop = new Shop(db);
const gateway = new Gateway(io, db, shop);

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
      const response = await gateway.start_game(socket, data);
      callback && callback(response);
    });

    socket.on('player_kick', async (data, callback) => {
      const response = await gateway.player_kick(socket, data);
      callback && callback(response);
    });
    
    socket.on('handle_key_press', async (data, callback) => {
      const response = await gateway.handle_key_press(socket, data);
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

    socket.on('room_settings_get', async (data, callback) => {
      const response = await gateway.get_room_settings(socket, data);
      callback && callback(response);
    });

    socket.on('insert_user', async (data, callback) => {
      const response = await gateway.insert_user(socket, data);
      callback && callback(response);
    });

    socket.on('get_user_by_player_name', async (data, callback) => {
      const response = await gateway.get_user_by_player_name(socket, data);
      callback && callback(response);
    });

    socket.on('get_all_users', async (data, callback) => {
      const response = await gateway.get_all_users(socket, data);
      callback && callback(response);
    });

    socket.on('get_rates_by_player_name', async (data, callback) => {
      const response = await gateway.get_rates_by_player_name(socket, data);
      callback && callback(response);
    });

    socket.on('get_history_by_player_name', async (data, callback) => {
      const response = await gateway.get_history_by_player_name(socket, data);
      callback && callback(response);
    });

    socket.on('update_rates_by_player_name', async (data, callback) => {
      
      const response = await gateway.update_rates_by_player_name(socket, data);
      callback && callback(response);
    });

    socket.on('update_inventory', async (data, callback) => {
      const response = await gateway.update_inventory(socket, data);
      callback && callback(response);
    });

    socket.on('shop_buy', async (data, callback) => {
      const response = await gateway.shop_buy(socket, data);
      callback && callback(response);
    });

    socket.on('shop_trade', async (data, callback) => {
      const response = await gateway.shop_trade(socket, data);
      callback && callback(response);
    });

    socket.on('shop_craft', async (data, callback) => {
      const response = await gateway.shop_craft(socket, data);
      callback && callback(response);
    });
});


// --- Start server ---
server.listen(serverPort, () => {
  console.log(`Server running`);
  console.log(`Socket.IO server running`);
});
