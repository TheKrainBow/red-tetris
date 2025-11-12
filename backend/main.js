import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

// --- Constants ---
const serverPort = Number(process.env.SERVER_PORT || 3004);
const clientAddr = Number(process.env.CLIENT_ADDR || "loaclahost:8080");

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

// Track rooms manually
const rooms = new Map();

// --- Socket.IO connection handling ---
io.on('connection', (socket) => {
    console.log('New Socket.IO connection:', socket.id);

    socket.emit('welcome', {
      message: 'Connected to Socket.IO server',
      timestamp: new Date().toISOString()
    });

    socket.on('disconnect', (reason) => {
        console.log(`Socket disconnected ${socket.id}, reason: ${reason}`);
        rooms.forEach((playersMap, roomName) => {
            if (playersMap.has(socket.id)) {
                playersMap.delete(socket.id);
                console.log(`Removed socket ${socket.id} from room ${roomName}`);

                if (playersMap.size === 0) {
                    rooms.delete(roomName);
                    console.log(`Deleted room ${roomName} because no players left`);
                }
            }
        });
    });

    socket.on('createRoom', (data, callback) => {
        const room = crypto.createHash('md5').update(String(Date.now())).digest('hex');
        if (rooms.has(room)) {
          return callback({ error: "Room already exists" });
        }
        rooms.add(room);
        socket.join(room);
        callback({
          success: true,
          room
        });
    });

    socket.on('joinRoom', (data, callback) => {
      const { room, playerName } = data;
      if (!room || typeof playerName !== 'string') {
        return callback({ error: 'Invalid room or playerName' });
      }

      if (!rooms.has(room)) {
        return callback({ error: `Room ${room} does not exist` });
      }

      const playersMap = rooms.get(room);
      playersMap.set(socket.id, playerName);

      socket.join(room);

      return callback({ success: true, room, playerName });
    });

});


// --- Start server ---
server.listen(serverPort, () => {
  console.log(`Server running on port ${serverPort}`);
  console.log(`Socket.IO server running on http://localhost:${serverPort}/ (default path)`);
});
