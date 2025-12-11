export class Board {
    constructor() {
        this.state = this.#createBoard(20, 10);
        this.blocked_rows = 0;
        this.last_cleared_blocks = [];
        this.points = [0,0,0,0];
    }

    #createBoard(rows, cols) {
        const output = [];
        for (let i = 0; i < rows; i++) {
            const row = Array(cols).fill(0);
            output.push(row);
        }
        return output;
    }

    async #add_points(p){
        for (let index = 0; index < this.points.length; index++) {
            this.points[index] += p[index];
        }
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
        const cleared_blocks = [];
        let points = [0,0,0,0];

        for (let i = 0; i < rows; i++) {
            let full_row = true;
            for (let j = 0; j < cols; j++) {
                if (this.state[i][j] === 0 || i > (rows-1 - this.blocked_rows)) {
                    full_row = false;
                    break;
                }
                points[this.state[i][j]-1] += 1;
            }
            if (!full_row) {
                new_board.push([...this.state[i]]);
                points = [0,0,0,0];
            }
            else {
                // capture cleared blocks positions before row is removed
                for (let j = 0; j < cols; j++) {
                    const material = this.state[i][j];
                    if (material) {
                        cleared_blocks.push({ Material: material, position: { x: j, y: i } });
                    }
                }
                this.#add_points(points);
                lines_cleared++;
            }
        }

        while (new_board.length < rows) {
            new_board.unshift(Array(cols).fill(0));
        }

        this.state = new_board;
        this.last_cleared_blocks = cleared_blocks;
        return lines_cleared;
    }

    consume_cleared_blocks() {
        const blocks = this.last_cleared_blocks || [];
        this.last_cleared_blocks = [];
        return blocks;
    }

    block_row(nrows_to_block) {
        const rows = this.state.length;
        const columns = this.state[0].length;
        let index = rows - 1 - this.blocked_rows;
        
        for (let i = 0; i < nrows_to_block; i++) {
            for (let j = 0; j < columns; j++) {
                this.state[index - i][j] = 5;
            }
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
