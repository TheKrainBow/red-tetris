import { Board } from "./Board";
import { Queue } from "./Queue";

export class Player {
    constructor(info) {
        this.name = info.playerName;
        this.id = info.socketId;
        this.spawn_rates = info.playerRates;
        this.piece_queue = new Queue();
        this.board = new Board();
        this.current_piece = null;
        this.spectrum = Array(10).fill(0);
    }

    set_spectrum() {
        const board = this.board.state;
        const cols = board[0].length;
        const rows = board.length;
        
        for (let col = 0; col < cols; col++) {
            let height = 0;
            for (let row = 0; row < rows; row++) {
                if (board[row][col] !== 0) {
                    height = rows - row;
                    break;
                }
            }
            this.spectrum[col] = height;
        }
    }

    get_spectrum() {
        return this.spectrum;
    }

    set_current_piece() {
        this.current_piece = this.piece_queue.dequeue();
        if (this.current_piece) {
            this.current_piece.position = [...this.current_piece.spawn_position];
        }
    }

    queue_piece(piece) {
        this.piece_queue.enqueue(piece);
    }

    step_down() {
        if (this.current_piece) {
            return this.current_piece.move(0, 1, this.board);
        }
        return false;
    }

    step_up() {
        if (this.current_piece) {
            return this.current_piece.move(0, -1, this.board);
        }
        return false;
    }

    move_left() {
        if (this.current_piece) {
            return this.current_piece.move(-1, 0, this.board);
        }
        return false;
    }

    move_right() {
        if (this.current_piece) {
            return this.current_piece.move(1, 0, this.board);
        }
        return false;
    }

    rotate() {
        if (this.current_piece) {
            return this.current_piece.rotate(this.board);
        }
        return false;
    }

    rotate_backwards() {
        if (this.current_piece) {
            return this.current_piece.rotate_backwards(this.board);
        }
        return false;
    }

    hard_drop() {
        if (!this.current_piece) return false;
        
        let moved = true;
        while (moved) {
            moved = this.step_down();
        }
        return true;
    }
}