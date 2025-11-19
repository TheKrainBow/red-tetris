import { Game } from "./Game.js";
import { Piece } from "./Piece.js";

export class Gateway {
    constructor() {
        this.games = {};
        this.rooms = new Map();
        this.playerInfo = new Map();
    }

    #update_piece_position(socket, data, direction) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return;

        const game = this.games[playerInfo.room];
        if (!game) return;

        const player = game.players.get(socket.id);
        if (!player || !player.current_piece) return;

        player.current_piece.move(direction, 0, player.board);
    }

    #step_down(socket, data) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return;

        const game = this.games[playerInfo.room];
        if (!game) return;

        game.handle_player_input(socket.id, 'down');
    }

    #drop_down(socket, data) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return;

        const game = this.games[playerInfo.room];
        if (!game) return;

        const player = game.players.get(socket.id);
        if (player) {
            player.hard_drop();
        }
    }

    #rotate_piece(socket, data) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return;

        const game = this.games[playerInfo.room];
        if (!game) return;

        game.handle_player_input(socket.id, 'up');
    }

    new_game(socket, data, io) {
        const room_name = data.room_name;
        if (!this.rooms.has(room_name)) {
            return;
        }

        const players_ids = Array.from(this.rooms.get(room_name).keys());
        this.games[room_name] = new Game(players_ids, room_name);
        this.games[room_name].run(io);
    }

    handle_key_press(socket, data) {
        if (!data || !data.key) return;

        switch (data.key) {
            case "right":
                this.#update_piece_position(socket, data, 1);
                break;
            case "left":
                this.#update_piece_position(socket, data, -1);
                break;
            case "up":
                this.#rotate_piece(socket, data);
                break;
            case "down":
                this.#step_down(socket, data);
                break;
            case "space":
                this.#drop_down(socket, data);
                break;
        }
    }

    #create_room(socket, data) {
        const { room, playerName } = data;
        this.rooms.set(room, new Map([[playerName, socket.id]]));
        this.playerInfo.set(socket.id, { room, playerName });
        socket.join(room);
    }

    join_room(socket, data, callback) {
        const { room, playerName } = data;
        if (!room || typeof playerName !== 'string') {
            return callback({ error: 'Invalid room or name' });
        }

        if (!this.rooms.has(room)) {
            this.#create_room(socket, data);
            return callback({ success: true, room, playerName });
        }

        const playersMap = this.rooms.get(room);

        const nameExists = Array.from(playersMap.values()).includes(playerName);
        if (nameExists) {
            return callback({ error: 'A user is already using this name' });
        }
        
        playersMap.set(playerName, socket.id,);
        this.playerInfo.set(socket.id, { room, playerName });
        socket.join(room);

        return callback({ success: true, room, playerName });
    }

    disconnect(socket, reason) {
        console.log(`Socket disconnected ${socket.id}, reason: ${reason}`);
        
        const playerInfo = this.playerInfo.get(socket.id);
        if (playerInfo) {
            const { room } = playerInfo;
            
            if (this.rooms.has(room)) {
                const playersMap = this.rooms.get(room);
                playersMap.delete(socket.id);
                
                if (playersMap.size === 0) {
                    this.rooms.delete(room);
                    if (this.games[room]) {
                        this.games[room].stop();
                        delete this.games[room];
                    }
                } else if (this.games[room]) {
                    this.games[room].remove_player(socket.id);
                }
            }
            
            this.playerInfo.delete(socket.id);
        }
    }

    start_game(socket, data, io) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return { error: 'Player not in a room' };

        const { room } = playerInfo;
        this.new_game(socket, { room_name: room }, io);
        return { success: true, room };
    }
}