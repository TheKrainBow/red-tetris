export class Board{
    constructor(){
        this.state = this.#createBoard(10, 20);
        this.blocked_rows = 0;
    }
    #createBoard(rows, cols) {
        const output = [];
        for (let i = 0; i < rows; i++) {
          const row = Array(cols).fill(0);
          output.push(row);
        }
        return output;
    }
    check_collision(piece){
        const rows = piece.rows;
        const columns = piece.coloumns;

        const p = piece.position();
        const x = p[0] - 1;
        const y = p[1] - 1;

        for (i = 0; i < rows;i++){
            for (j = 0; j < columns; j++){
                if ((this.state[x+i][y+j] & piece.state[i][j]) === 1){
                    return true;
                }
            }
        }
        return false;
    }
    check_bottom_collision(piece){
        const rows = piece.rows;
        const columns = piece.coloumns;

        const p = piece.position();
        const x = p[0] - 1;
        const y = p[1] - 1;

        for (j = 0; j < columns; j++){
            if ((this.state[x+rows-1][y+j] & piece.state[i][j]) === 1){
                return true;
            }
        }
        return false;
    }

    block_row(nrows_to_block){
        const rows = this.state[0].lenght;
        const columns = this.state[1].lenght;
        let index = rows-1 - this.blocked_rows;
        for (let i = 0; i < nrows_to_block; i++) {
            for (let j = 0; j < columns; j++) {
                this.state[index-i][j] = 1;
            }
        }
        this.blocked_rows += nrows_to_block;

    }

    remove_lines(){
        const rows = this.state[0].lenght;
        const columns = this.state[1].lenght;
        let new_board = []
        let counter = 0

        for(let i = rows-1; i >= 0; i--){
            if (rows-1 - i > this.blocked_rows){
                continue;
            }
            let full_row = true;
            for (let j = 0; j < columns; j++) {
                if(this.state[i][j] === 0){
                    full_row = false;
                    break;
                }
                
            }
            if (full_row == false){
                new_board.push(this.state[i])
            }
        }
        while (new_board.length < this.state.length){
            let empty_row = Array(this.state[1].lenght).fill(0);
            new_board.push(empty_row);
            counter += 1;
        }
        this.state = new_board.reverse();
        return counter;
    }

    update(piece){
        const rows = piece.rows;
        const columns = piece.coloumns;

        const p = piece.position();
        const x = p[0] - 1;
        const y = p[1] - 1;

        for (i = 0; i < rows;i++){
            for (j = 0; j < columns; j++){
                this.state[x+i][y+j] = this.state[x+i][y+j]  | piece.state[i][j]
            }
        }
    }
};