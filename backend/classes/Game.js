import Piece from "./Piece";
import Board from "./Board";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export class Game{
    constructor(players) {
        this.players = players;
        this.I = [[1,1,1,1]];
        this.J = [[1,0,0,],[1,1,1]];
        this.L = [[1,1,1,],[1,0,0]];
        this.O = [[1,1],[1,1]];
        this.S = [[0,1,1],[1,1,0]]
        this.T = [[0,1,0],[1,1,1]];
        this.Z = [[1,1,0],[0,1,1]];
        this.shapes[this.I, this.J, this.L, this.O, this.S, this.T, this.Z];
    }

    start(){
        this.board = new Board();
        this.current_piece = new Piece(this.shapes[Math.random() * this.shapes.length]);
        this.next_piece = new Piece(this.shapes[Math.random() * this.shapes.length]);

    }

    async run(){
        while (true){
            this.current_piece.position[0] += 1;
            const end_turn = this.board.check_bottom_collision(this.current_piece);
            if (end_turn === true){
                this.current_piece.position[0] -= 1;
                if (this.current_piece.position == this.current_piece.spawn_position){
                    break ;
                }
                this.board.update(this.current_piece);
                this.current_piece = this.next_piece;
                setTimeout(() => {this.next_piece = new Piece(this.shapes[Math.random() * this.shapes.length]);}, 50);
                continue ;
            }
            sleep(500);
        }
    }
};