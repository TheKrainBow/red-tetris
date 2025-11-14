export class Board{
    constructor(){
        this.state = this.#createBoard(30, 18)
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
                if ((this.board[x+i][y+j] & piece.state[i][j]) === 1){
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
            if ((this.board[x+rows-1][y+j] & piece.state[i][j]) === 1){
                return true;
            }
        }
        return false;
    }
    
    update(piece){
        const rows = piece.rows;
        const columns = piece.coloumns;

        const p = piece.position();
        const x = p[0] - 1;
        const y = p[1] - 1;

        for (i = 0; i < rows;i++){
            for (j = 0; j < columns; j++){
                this.board[x+i][y+j] = this.board[x+i][y+j]  | piece.state[i][j]
            }
        }
    }
};