import { Game } from "./Game.js";
import { Piece } from "./Piece.js";

export class Gateway {
    constructor(io) {
        this.io = io;
        this.games = {};
        this.rooms = new Map();
        this.playerInfo = new Map();
    }

    #formatCommandResponse(event, data = {}) {
        return { event, data };
    }

    #build_player_list(roomName) {
        if (!this.rooms.has(roomName)) return null;

        const playersMap = this.rooms.get(roomName);
        const game = this.games[roomName];
        const isRunning = game?.is_running() || false;
        const playingNames = new Set(game ? Array.from(game.players.keys()) : []);
        const eliminatedNames = new Set(game ? game.eliminatedPlayers : []);

        const players = [];
        const counts = {
            total: 0,
            playing: 0,
            eliminated: 0,
            spectating: 0,
            waiting: 0,
            hosts: 0,
        };

        playersMap.forEach((socketId, playerName) => {
            const info = this.playerInfo.get(socketId) || {};
            let status = eliminatedNames.has(playerName) ? 'eliminated' : 'waiting';
            if (isRunning) {
                if (playingNames.has(playerName)) status = 'playing';
                else if (eliminatedNames.has(playerName)) status = 'eliminated';
                else status = 'spectating';
            }

            players.push({
                name: playerName,
                host: Boolean(info.host),
                status,
            });

            counts.total += 1;
            counts.hosts += info.host ? 1 : 0;
            counts[status] = (counts[status] || 0) + 1;
        });

        return this.#formatCommandResponse('player_list', {
            room: roomName,
            players,
            counts,
            game_running: isRunning,
        });
    }

    #getSpectatorSocketIds(roomName) {
        const playersMap = this.rooms.get(roomName);
        const game = this.games[roomName];
        if (!playersMap || !game) return [];

        const playingNames = new Set(game.players.keys());
        const eliminatedNames = new Set(game.eliminatedPlayers || []);
        const spectatorSockets = [];

        playersMap.forEach((socketId, playerName) => {
            if (playingNames.has(playerName)) return;
            if (eliminatedNames.has(playerName)) return;
            spectatorSockets.push(socketId);
        });

        return spectatorSockets;
    }

    #broadcast_player_list(roomName) {
        if (!this.io || !roomName) return null;
        const payload = this.#build_player_list(roomName);
        if (payload) {
            this.io.to(roomName).emit('player_list', payload);
        }
        return payload;
    }

    #new_game(socket, roomName, io) {
        if (!this.rooms.has(roomName)) {
            return ;
        }
        if (this.games[roomName] && this.games[roomName].isRunning) {
            return;
        }
        let mode = Game.SINGLE_PLAYER;

        let players_info = []
        this.rooms.get(roomName).forEach((socketId, playerName) => {
            players_info.push({socketId, playerName})
        });

        if (players_info.length > 1){
            mode = Game.MULTI_PLAYER;
        }

        const spectatorProvider = () => this.#getSpectatorSocketIds(roomName);
        this.games[roomName] = new Game(players_info, roomName, mode, 500, spectatorProvider);
        this.games[roomName].onStatusChange = () => this.#broadcast_player_list(roomName);
        this.games[roomName].run(io);
    }

    #create_room(socket, data) {
        const { room, playerName } = data;
        this.rooms.set(room, new Map([[playerName, socket.id]]));
        let host = true;
        this.playerInfo.set(socket.id, { room, playerName, host });
        socket.join(room);
    }

    async handle_key_press(socket, data, io) {
        if (!data || !data.key) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Missing key input' });
        }

        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Player not in a room' });
        }

        const game = this.games[playerInfo.room];
        if (!game || !game.is_running()) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Game not running' });
        }

        const keyMap = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'rotate',
            ArrowDown: 'down',
            Space: 'hard_drop',
            ' ': 'hard_drop',
        };

        const action = keyMap[data.key];
        if (!action) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Unsupported key' });
        }

        const handled = game.handle_player_input(playerInfo.playerName, action);
        if (handled && io) {
            game.broadcast_state(io);
        }
        return this.#formatCommandResponse('handle_key_press', { success: Boolean(handled) });
    }

    async join_room(socket, data) {
        const { room, playerName } = data || {};
        if (!room || typeof playerName !== 'string') {
            return this.#formatCommandResponse('join_room', { error: 'Invalid room or name' });
        }

        if (!this.rooms.has(room)) {
            this.#create_room(socket, data);
            const host = true;
            const response = this.#formatCommandResponse('join_room', { success: true, room, playerName, host });
            this.#broadcast_player_list(room);
            return response;
        }

        const playersMap = this.rooms.get(room);

        const nameExists = Array.from(playersMap.keys()).includes(playerName);
        if (nameExists) {
            return this.#formatCommandResponse('join_room', { error: 'A user is already using this name' });
        }
        
        playersMap.set(playerName, socket.id,);
        let host = false;
        this.playerInfo.set(socket.id, { room, playerName, host });
        socket.join(room);

        const response = this.#formatCommandResponse('join_room', { success: true, room, playerName, host });
        this.#broadcast_player_list(room);
        return response;
    }

    async remove_player(playerInfo){
        if (playerInfo) {
            const { room, playerName } = playerInfo;

            const game = this.games[room];

            if (this.rooms.has(room)) {
                const playersMap = this.rooms.get(room);
                playersMap.delete(playerName);
                if (playersMap.size === 0) {
                    this.rooms.delete(room);
                    if (game) {
                        game.stop();
                        delete this.games[room];
                    }
                }
                else {
                    const [nextHostName, nextHostSocketId] = playersMap.entries().next().value || [];
                    if (playerInfo.host == true && nextHostSocketId){
                        const nextInfo = this.playerInfo.get(nextHostSocketId);
                        if (nextInfo) {
                            nextInfo.host = true;
                            this.playerInfo.set(nextHostSocketId, nextInfo);
                        }
                    }
                    if (game) {
                        game.eliminate_player(playerName);
                    }
                }
            }
            return room;
        }
        return null;
    }

    async disconnect(socket, reason) {
        console.log(`Socket disconnected ${socket.id}, reason: ${reason}`);
        const playerInfo = this.playerInfo.get(socket.id);
        const room = this.remove_player(playerInfo);
        if (room) {
            this.#broadcast_player_list(room);
        }
        this.playerInfo.delete(socket.id);
    }

    async start_game(socket, data, io) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return this.#formatCommandResponse('start_game', { error: 'Player not in a room' });

        const { room, host } = playerInfo;
        if (host === false){
            return this.#formatCommandResponse('start_game', { success: false, room, error: 'Only the host can start the game' });
        }
        this.#new_game(socket, room , io);
        this.#broadcast_player_list(room);
        return this.#formatCommandResponse('start_game', { success: true, room });
    }

    async leave_room(socket, data){
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) {
            return this.#formatCommandResponse('leave_room', { success: true });
        }

        const room = this.remove_player(playerInfo);
        this.playerInfo.delete(socket.id);
        if (this.rooms.has(playerInfo.room)){
            socket.leave(playerInfo.room);
        }
        if (room) {
            this.#broadcast_player_list(room);
        }
        return this.#formatCommandResponse('leave_room', { success: true, room: playerInfo.room, playerName: playerInfo.playerName });
    }

    async room_list(socket, data) {
        const roomsStatus = [];
        
        this.rooms.forEach((playersMap, roomName) => {
            const game = this.games[roomName];
            const TotalConnections = playersMap.size;

            let playingCount = 0;
            let gameStatus = 'WAITING_FOR_PLAYER';
            let gameDuration = 0;
            let playerNames = Array.from(playersMap.keys());
            
            if (game) {
                playingCount = game.players.size;
                
                if (game.isRunning) {
                    gameStatus = 'PLAYING';
                    playerNames = Array.from(game.players.keys());
                    if (game.startTime) {
                        gameDuration = Math.floor((Date.now() - game.startTime) / 1000);
                    }
                }
            }
            else {
                gameStatus = 'WAITING_FOR_PLAYER';
            }

            roomsStatus.push({
                room_name: roomName,
                game_status: gameStatus,
                players_playing: playingCount,
                spectators: TotalConnections - playingCount,
                game_duration: gameDuration,
                players: playerNames,
            });
        });

        const response = this.#formatCommandResponse('room_list', {
            success: true,
            rooms: roomsStatus
        });

        socket.emit('room_list_response', response);
        return response;
    }
}
