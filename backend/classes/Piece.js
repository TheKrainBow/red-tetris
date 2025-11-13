class Piece{
    constructor(shape) {
        this.shape = shape;
        this.rotations = this.#create_rotations();
        this.state_index = Math.floor(Math.random() * 4);
        this.state = this.rotations[this.state_index];
        this.position = [5,7];
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
    #new_position(){
        const oldNumRows = this.state.length;
        const newNumRows = this.rotations[this.state_index].length;
        const oldNumColumns = this.state[0].length;
        const newNumColumns = this.rotations[this.state_index][0].length;
        const x = this.position[0] + Math.floor(oldNumRows / 2) - Math.floor(newNumRows / 2);
        const y = this.position[1] + Math.floor(oldNumColumns / 2) - Math.floor(newNumColumns / 2);
        return  [x,y];
    }
    rotate(){
        this.state_index = (this.state_index + 1) % 4;
        this.position = this.#new_position();
        this.state = this.rotations[this.state_index];
    }
    rotate_backwards(){
        this.state_index = (this.state_index + 3) % 4;
        this.position = this.#new_position();
        this.state = this.rotations[this.state_index];
    }
};

