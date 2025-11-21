export class Piece {
    constructor(shape, test=false) {
        this.shape = shape;
        this.rotations = this.#create_rotations();
        if (test){
            this.state_index = 0;
        }
        else{
            this.state_index = Math.floor(Math.random() * 4);
        }
        this.state = this.rotations[this.state_index];
        this.spawn_position = [3, 0 - this.shape.length + 1];
        this.position = [...this.spawn_position];
    }

    static #WALL_KICK_DATA = {
        0: [
            [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
            [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
            [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
            [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]
        ],
        1: [
            [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
            [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
            [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
            [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]
        ]
    };

    static #I_WALL_KICK_DATA = {
        0: [
            [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
            [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
            [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
            [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]
        ],
        1: [
            [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
            [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
            [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
            [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]
        ]
    };

    #horizontal_reflection(shape) {
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
        if (rows === 0) return [];
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

    #create_rotations() {
        let output = [];
        let state = this.shape;
        for (let i = 0; i < 4; i++) {
            let t = this.#transpose(state);
            state = this.#horizontal_reflection(t);
            output.push(state);
        }
        return output;
    }

    #isIPiece() {
        return this.shape.some(row => row.filter(cell => cell !== 0).length === 4);
    }

    #getWallKickTests(fromState, toState) {
        const isI = this.#isIPiece();
        const kickData = isI ? Piece.#I_WALL_KICK_DATA : Piece.#WALL_KICK_DATA;
        
        let testType;
        if ((fromState === 0 && toState === 1) || (fromState === 2 && toState === 3) ||
            (fromState === 1 && toState === 0) || (fromState === 3 && toState === 2)) {
            testType = 0;
        } else {
            testType = 1;
        }
        
        return kickData[testType][fromState];
    }

    rotate(board) {
        const oldState = this.state_index;
        const newState = (this.state_index + 1) % 4;
        const tests = this.#getWallKickTests(oldState, newState);
        
        for (const [x, y] of tests) {
            const newPosition = [this.position[0] + x, this.position[1] + y];
            const test_piece = {
                state: this.rotations[newState],
                position: newPosition
            };
            
            if (!board.check_collision(test_piece)) {
                this.state_index = newState;
                this.state = this.rotations[newState];
                this.position = newPosition;
                return true;
            }
        }
        return false;
    }

    rotate_backwards(board) {
        const oldState = this.state_index;
        const newState = (this.state_index + 3) % 4;
        const tests = this.#getWallKickTests(oldState, newState);
        
        for (const [x, y] of tests) {
            const newPosition = [this.position[0] + x, this.position[1] + y];
            const test_piece = {
                state: this.rotations[newState],
                position: newPosition
            };
            
            if (!board.check_collision(test_piece)) {
                this.state_index = newState;
                this.state = this.rotations[newState];
                this.position = newPosition;
                return true;
            }
        }
        return false;
    }

    move(dx, dy, board) {
        const newPosition = [this.position[0] + dx, this.position[1] + dy];
        const test_piece = {
            state: this.state,
            position: newPosition
        };
        
        if (!board.check_collision(test_piece)) {
            this.position = newPosition;
            return true;
        }
        return false;
    }

    get_block_positions() {
        const positions = [];
        const [posX, posY] = this.position;
        
        for (let y = 0; y < this.state.length; y++) {
            for (let x = 0; x < this.state[y].length; x++) {
                if (this.state[y][x] !== 0) {
                    positions.push([posX + x, posY + y]);
                }
            }
        }
        return positions;
    }
}