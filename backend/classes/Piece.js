export class Piece{
    constructor(shape) {
        this.shape = shape;
        this.rotations = this.#create_rotations();
        this.state_index = Math.floor(Math.random() * 4);
        this.state = this.rotations[this.state_index];
        this.spawn_position = [5,7];
        this.position = this.spawn_position;
    }
    #horizontal_reflection(shape){
        const output = [];
        for (let i = 0; i < shape.length; i++) {
          const row = shape[i];
          const reversedRow = row.slice().reverse();
          output.push(reversedRow);
        }
        return output;
    }
    #transpose(shape) {
        const rows = shape.length;
        if (rows === 0) 
            return [];
        const cols = shape[0].length;
        const output = [];

        for (let j = 0; j < cols; j++) {
            const newRow = [];
            for (let i = 0; i < rows; i++) {
                newRow.push(shape[i][j]);
            }
            output.push(newRow);
        }
        return output;
    }
    #create_rotations(){
        let output = [];
        let state = this.shape;
        for (let i = 0; i < 4; i++) {
            let t = this.#transpose(state);
            state = this.#horizontal_reflection(t);
            output.push(state);
        }
        return output;
    }
    rotate(){
        this.state_index = (this.state_index + 1) % 4;
        this.state = this.rotations[this.state_index];
    }
    rotate_backwards(){
        this.state_index = (this.state_index + 3) % 4;
        this.state = this.rotations[this.state_index];
    }
};
