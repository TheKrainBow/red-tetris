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
  // path: '/socket.io'
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

});

// --- Express routes ---
app.get('/', (req, res) => res.send('Red‑Tetrix is running'));

app.post('/createRoom', (req, res) => {
  const room = crypto.createHash('md5').update(String(Date.now())).digest('hex');

  if (rooms.has(room)) {
    return res.status(400).send({ error: "error, room already exists" });
  }

  const { socketId } = req.body;
  if (typeof socketId !== 'string') {
    return res.status(400).send({ error: "socketId required" });
  }

  const socket = io.sockets.sockets.get(socketId);
  if (!socket) {
    return res.status(404).send({ error: "Socket not found" });
  }

  try {
    socket.join(room);
    rooms.set(room, new Map());
  } catch (err) {
    console.error(err);
    return res.status(500).send({ error: "error joining room" });
  }

  return res.send({ success: true, room });
});

app.post('/:room/:playerName', (req, res) => {
  const { room, playerName } = req.params;

  if (!room || typeof playerName !== 'string') {
    return res.status(400).send({ error: 'Invalid room or playerName' });
  }

  if (!rooms.has(room)) {
    return res.status(404).send({ error: `Room ${room} does not exist` });
  }

  const { socketId } = req.body;
  if (typeof socketId !== 'string') {
    return res.status(400).send({ error: 'socketId required' });
  }

  const socket = io.sockets.sockets.get(socketId);
  if (!socket) {
    return res.status(404).send({ error: 'Socket not found' });
  }

  try {
    socket.join(room);
    const players = rooms.get(room);
    players.set(socketId, playerName);
  } catch (err) {
    console.error(err);
    return res.status(500).send({ error: 'Error joining room' });
  }

  return res.send({ success: true, room, playerName });
});


// --- Start server ---
server.listen(serverPort, () => {
  console.log(`Server running on port ${serverPort}`);
  console.log(`Socket.IO server running on http://localhost:${serverPort}/ (default path)`);
});
