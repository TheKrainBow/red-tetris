export class Board {
    constructor() {
        this.state = this.#createBoard(20, 10);
        this.blocked_rows = 0;
        this.last_cleared_rows = [];
    }

    #createBoard(rows, cols) {
        const output = [];
        for (let i = 0; i < rows; i++) {
            const row = Array(cols).fill(0);
            output.push(row);
        }
        return output;
    }

    check_collision(piece) {
        const piece_state = piece.state;
        const [x, y] = piece.position;
        
        if (!piece_state || piece_state.length === 0) {
            return false;
        }
        
        const piece_rows = piece_state.length;
        const piece_cols = piece_state[0].length;

        for (let i = 0; i < piece_rows; i++) {
            for (let j = 0; j < piece_cols; j++) {
                if (piece_state[i][j] !== 0) {
                    const boardX = x + j;
                    const boardY = y + i;

                    if (boardX < 0 || boardX >= this.state[0].length || 
                        boardY < 0 || boardY >= this.state.length) {
                        return true;
                    }

                    if (this.state[boardY][boardX] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    can_move_down(piece) {
        const test_piece = {
            state: piece.state,
            position: [piece.position[0], piece.position[1] + 1]
        };
        return !this.check_collision(test_piece);
    }

    lock_piece(piece) {
        const [x, y] = piece.position;
        const piece_state = piece.state;

        for (let i = 0; i < piece_state.length; i++) {
            for (let j = 0; j < piece_state[i].length; j++) {
                if (piece_state[i][j] !== 0) {
                    const boardX = x + j;
                    const boardY = y + i;
                    
                    if (boardY >= 0 && boardY < this.state.length && 
                        boardX >= 0 && boardX < this.state[0].length) {
                        this.state[boardY][boardX] = piece_state[i][j];
                    }
                }
            }
        }
    }

    remove_lines() {
        const rows = this.state.length;
        const cols = this.state[0].length;
        let new_board = [];
        let lines_cleared = 0;
        const cleared_rows = [];

        for (let i = 0; i < rows; i++) {
            let full_row = true;
            for (let j = 0; j < cols; j++) {
                if (this.state[i][j] === 0) {
                    full_row = false;
                    break;
                }
            }
            if (!full_row) {
                new_board.push([...this.state[i]]);
            } else {
                lines_cleared++;
                cleared_rows.push(i);
            }
        }

        while (new_board.length < rows) {
            new_board.unshift(Array(cols).fill(0));
        }

        this.state = new_board;
        this.last_cleared_rows = cleared_rows;
        return lines_cleared;
    }

    consume_cleared_rows() {
        const rows = this.last_cleared_rows || [];
        this.last_cleared_rows = [];
        return rows;
    }

    block_row(nrows_to_block) {
        for (let i = 0; i < nrows_to_block; i++) {
            this.state.shift();
            
            const garbage_row = Array(10).fill(1);
            const hole = Math.floor(Math.random() * 10);
            garbage_row[hole] = 0;
            
            this.state.push(garbage_row);
        }
        this.blocked_rows += nrows_to_block;
    }

    update(piece) {
        this.lock_piece(piece);
    }

    get_state() {
        return this.state;
    }

    get_spectrum() {
        const spectrum = Array(10).fill(0);
        for (let col = 0; col < 10; col++) {
            for (let row = 0; row < 20; row++) {
                if (this.state[row][col] !== 0) {
                    spectrum[col] = 20 - row;
                    break;
                }
            }
        }
        return spectrum;
    }
}
