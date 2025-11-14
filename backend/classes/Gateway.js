import { Game } from "./Game";

export class Gateway{
    games = {};

    constructor(){
        this.rooms = new Map();
    }

    new_game(socket, data) {
        games[data.room_name] = new Game();
        this.games[data.room_name].start();
        this.games[data.room_name].run();
    }

    update_piece_position(socket, data) {
        const thisGame = this.games[data.room_name]
        let position = thisGame.current_piece.position[1] += 1;
        if (thisGame.board.check_collisions === false){
            if (data.key === "right"){
                thisGame.current_piece[1] += 1
            }
            else if (data.key === "left"){
                thisGame.current_piece[1] -= 1
            }
        }
    }

    create_room(socket, data, callback){
        const room = crypto.createHash('md5').update(String(Date.now())).digest('hex');
        if (this.rooms.has(room)) {
          return callback({ error: "Room already exists" });
        }
        this.rooms.add(room);
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