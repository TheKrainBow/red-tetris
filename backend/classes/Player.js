import { Board } from "./Board";
import { Queue } from "./queue";

export class Player{
    constructor(id) {
        this.id = id;
        this.points = 0;
        this.piece_queue = new Queue();
        this.board = new Board();
        this.spectrum = Array(this.board.state[1].length).fill(0);
  }

  set_current_piece(){
    this.current_piece = this.piece_queue.dequeue();
  }

  queue_piece(piece){
    this.piece_queue = this.piece_queue.enqueue(piece);
  }

  step_down(){
    this.current_piece.position[0] += 1;
  }

  step_up(){
    this.current_piece.position[0] -= 1;
  }

  set_spectrum(){
    const rows = this.board.state[0].length;
    const columns = this.board.state[1].length;

    for (let i = 0; i < rows; i++) {
      for (let j = columns; j < columns; j++) {
        if(this.board.state[j] === 0){
          this.spectrum[i] = j;
          break;
        }

      }
    }
  }
};