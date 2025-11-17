import { Game } from "./Game";

export class Gateway{
    games = {};

    constructor(){
        this.rooms = new Map();
    }

    #update_piece_position(socket, data, direction) {
        const thisGame = this.games[data.room_name]
        const test_piece = new Piece(thisGame.current_piece.state);
        let position = thisGame.current_piece.position[1];
        position += direction;
        test_piece.position = position;
        if (thisGame.board[socket.id].check_collisions(test_piece) === false){
            thisGame.current_piece.position[1] = position;
        }
    }

    #step_down(socket, data){
        const thisPlayer = this.games[data.room_name][socket.id];
        thisPlayer.step_down();
    }

    #drop_down(socket, data){
    }

    #rotate_piece(socket, data) {
        const thisPlayer = this.games[data.room_name][socket.id];
        const test_piece = new Piece(thisPlayer.current_piece.state);
        test_piece.rotate();
        if (thisPlayer.board.check_collisions(test_piece) === false){
            thisPlayer.current_piece = test_piece;
        }
    }

    new_game(socket, data, io) {
        let players_ids = this.rooms[data.room_name].keys().to_array();
        games[data.room_name] = new Game(players_ids);
        this.games[data.room_name].start();
        this.games[data.room_name].run(socket, io);
    }

    handle_key_press(socket, data){
        if (data.key === "right"){
            this.#update_piece_position(socket, data, 1);
        }
        else if (data.key === "left"){
            this.#update_piece_position(socket, data, -1);
        }
        else if (data.key === "up"){
            this.#rotate_piece(socket, data);
        }
        else if (data.key === "down"){
            this.#step_down(socket, data);
        }
        else if (data.key === "space"){
            this.#drop_down(socket, data);
        }
    }

    create_room(socket, data, callback){
        const room = crypto.createHash('md5').update(String(Date.now())).digest('hex');
        if (this.rooms.has(room)) {
          return callback({ error: "Room already exists" });
        }
        this.rooms.add(room);

        const playersMap = this.rooms.get(room);
        playersMap.set(socket.id, playerName);

        socket.join(room);
        return callback({
          success: true,
          room
        });
    }

    join_room(socket, data, callback){
        const { room, playerName } = data;
        if (!room || typeof playerName !== 'string') {
          return callback({ error: 'Invalid room or playerName' });
        }

        if (!this.rooms.has(room)) {
          return callback({ error: `Room ${room} does not exist` });
        }

        const playersMap = this.rooms.get(room);
        playersMap.set(socket.id, playerName);

        socket.join(room);

        return callback({ success: true, room, playerName });
    }

    disconnect(socket, reason){
        console.log(`Socket disconnected ${socket.id}, reason: ${reason}`);
        this.rooms.forEach((playersMap, roomName) => {
            if (playersMap.has(socket.id)) {
                playersMap.delete(socket.id);
                console.log(`Removed socket ${socket.id} from room ${roomName}`);

                if (playersMap.size === 0) {
                    this.rooms.delete(roomName);
                    console.log(`Deleted room ${roomName} because no players left`);
                }
            }
        });
    }
}