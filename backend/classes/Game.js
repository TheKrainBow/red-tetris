import Piece from "./Piece";
import { Player } from "./Player";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export class Game{
    constructor(players, room) {
        this.room = room
        this.players = new Map(players.map(player_id => [ player_id, new Player(player_id) ]));
        this.I = [[1,1,1,1]];
        this.J = [[1,0,0,],[1,1,1]];
        this.L = [[1,1,1,],[1,0,0]];
        this.O = [[1,1],[1,1]];
        this.S = [[0,1,1],[1,1,0]];
        this.T = [[0,1,0],[1,1,1]];
        this.Z = [[1,1,0],[0,1,1]];
        this.shapes[this.I, this.J, this.L, this.O, this.S, this.T, this.Z];
    }

    #add_to_players_piece_queue(){
        const piece = new Piece(this.shapes[Math.random() * this.shapes.length]);
        this.players.forEach((id, player) => {
            player.queue_piece(piece);
        })
    }
    #set_players_piece(){
        this.players.forEach((id, player) => {
            player.set_current_piece();
        })
    }

    start(){
        this.#add_to_players_piece_queue();
        this.#add_to_players_piece_queue();
        this.#set_players_piece();
        
    }

    #end_game(player){
        const end_turn = player.board.check_bottom_collision(player.current_piece);
        if (end_turn === true){
            player.step_up();
            if (player.current_piece.position == player.current_piece.spawn_position){
                return true;
            }
            player.board.update(player.current_piece);
            player.board.remove_lines();
            player.board.set_spectrum();
            player.set_current_piece();
            if (player.piece_queue.isEmpty()){
                this.#add_to_players_piece_queue();
            }
        }
        return false;
    }

    async run(io){
        while (true){
            this.players.forEach((id, player) => { 
                player.step_down();
                if (this.#end_game(player) === true){
                    // do something with player_id
                }
            });
            // io.to(room).emit('refresh', {board: this.board, piece: this.game.current_piece.state});
            sleep(500);
        }
    }
};