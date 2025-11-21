import { Game } from "./Game.js";
import { Piece } from "./Piece.js";

export class Gateway {
    constructor() {
        this.games = {};
        this.rooms = new Map();
        this.playerInfo = new Map();
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


        this.games[roomName] = new Game(players_info, roomName, mode);
        this.games[roomName].run(io);
    }

    handle_key_press(socket, data, io) {
        if (!data || !data.key) return;

        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return;

        const game = this.games[playerInfo.room];
        if (!game || !game.is_running()) return;

        const keyMap = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'rotate',
            ArrowDown: 'down',
            Space: 'hard_drop',
            ' ': 'hard_drop',
        };

        const action = keyMap[data.key];
        if (!action) return;

        const handled = game.handle_player_input(playerInfo.playerName, action);
        if (handled && io) {
            game.broadcast_state(io);
        }
    }

    #create_room(socket, data) {
        const { room, playerName } = data;
        this.rooms.set(room, new Map([[playerName, socket.id]]));
        let host = true;
        this.playerInfo.set(socket.id, { room, playerName, host });
        socket.join(room);
    }

    join_room(socket, data, callback) {
        const { room, playerName } = data;
        if (!room || typeof playerName !== 'string') {
            return callback({ error: 'Invalid room or name' });
        }

        if (!this.rooms.has(room)) {
            this.#create_room(socket, data);
            return callback({ success: true, room, playerName, host });
        }

        const playersMap = this.rooms.get(room);

        const nameExists = Array.from(playersMap.values()).includes(playerName);
        if (nameExists) {
            return callback({ error: 'A user is already using this name' });
        }
        
        playersMap.set(playerName, socket.id,);
        let host = false;
        this.playerInfo.set(socket.id, { room, playerName, host });
        socket.join(room);

        return callback({ success: true, room, playerName, host });
    }

    disconnect(socket, reason) {
        console.log(`Socket disconnected ${socket.id}, reason: ${reason}`);
        
        const playerInfo = this.playerInfo.get(socket.id);
        if (playerInfo) {
            const { room, playerName } = playerInfo;
            
            if (this.rooms.has(room)) {
                const playersMap = this.rooms.get(room);
                playersMap.delete(playerName);
                
                if (playersMap.size === 0) {
                    this.rooms.delete(room);
                    if (this.games[room]) {
                        this.games[room].stop();
                        delete this.games[room];
                    }
                }
                else if (this.games[room]) {
                    this.games[room].remove_player(playerName);
                }
            }
            
            this.playerInfo.delete(socket.id);
        }
    }

    start_game(socket, data, io) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return { error: 'Player not in a room' };

        const { room, host } = playerInfo;
        if (host === false){
            return { success: false, room };
        }
        this.#new_game(socket, room , io);
        return { success: true, room };
    }

    leave_room(socket, data){
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return { error: 'Player not in a room' };

        const { room, playerName } = playerInfo;

        const game = this.games[room];

        this.rooms.get(room).delete(playerName);
        game.remove_player(playerName);
        const player_list = {type: player_list, data: Array.from(game.players.values())};
        
        socket.to(room).emit("player_list", player_list);
        socket.leave(room)
    }

    room_list(socket, data) {
        const roomsStatus = [];
        
        this.rooms.forEach((playersMap, roomName) => {
            const game = this.games[roomName];
            const TotalConnections = playersMap.size;

            let playingCount = 0;
            let gameStatus = 'WAITING_FOR_PLAYER';
            let gameDuration = 0;
            let playerNames = []
            
            if (game) {
                playingCount = game.players.size;
                
                if (game.isRunning) {
                    gameStatus = 'PLAYING';
                    playerNames = Array.from(game.player.keys());
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

        socket.emit('room_list_response', {
            success: true,
            rooms: roomsStatus
        });
    }
}
