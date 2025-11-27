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


        this.games[roomName] = new Game(players_info, roomName, mode, 500);
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

    async join_room(socket, data, callback) {
        const { room, playerName } = data;
        if (!room || typeof playerName !== 'string') {
            return callback({ error: 'Invalid room or name' });
        }

        if (!this.rooms.has(room)) {
            this.#create_room(socket, data);
            return callback({ success: true, room, playerName, host });
        }

        const playersMap = this.rooms.get(room);

        const nameExists = Array.from(playersMap.keys()).includes(playerName);
        if (nameExists) {
            return callback({ error: 'A user is already using this name' });
        }
        
        playersMap.set(playerName, socket.id,);
        let host = false;
        this.playerInfo.set(socket.id, { room, playerName, host });
        socket.join(room);

        return callback({ success: true, room, playerName, host });
    }

    async remove_player(playerInfo){
        if (playerInfo) {
            const { room, playerName } = playerInfo;

            const game = this.games[room];

            if (this.rooms.has(room)) {
                const playersMap = this.rooms.get(room);
                playersMap.delete(playerName);
                const player_list = {type: "player_list", data: Array.from(playersMap.keys())};
                
                if (player_list.data.length === 0) {
                    this.rooms.delete(room);
                    if (game) {
                        game.stop();
                        delete this.games[room];
                    }
                }
                else {
                    const next_host = playersMap.get(player_list.data[0]);
                    if (playerInfo.host == true){
                        this.playerInfo.get(next_host).host = true;
                    }
                    if (game) {
                        game.eliminate_player(playerName);
                    }
                    return player_list;
                }
            }
        }
        return undefined;
    }

    async disconnect(socket, reason) {
        console.log(`Socket disconnected ${socket.id}, reason: ${reason}`);
        const playerInfo = this.playerInfo.get(socket.id);
        this.remove_player(playerInfo);
        this.playerInfo.delete(socket.id);
    }

    async start_game(socket, data, io) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return { error: 'Player not in a room' };

        const { room, host } = playerInfo;
        if (host === false){
            return { success: false, room };
        }
        this.#new_game(socket, room , io);
        return { success: true, room };
    }

    async leave_room(socket, data){
        const playerInfo = this.playerInfo.get(socket.id);
        const player_list = this.remove_player(playerInfo);
        if (player_list){
            socket.to(playerInfo.room).emit("player_list", player_list);
        }
        this.playerInfo.delete(socket.id);
        if (this.rooms.has(playerInfo.room)){
            socket.leave(playerInfo.room);
        }
    }

    async room_list(socket, data) {
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
