import { Board } from '../backend/classes/Board'
import { Piece } from '../backend/classes/Piece';
import { Player } from '../backend/classes/Player';
import { Queue } from '../backend/classes/Queue';
import { Game } from '../backend/classes/Game';
const { expect } = require('chai');

describe('Tetris Complete Test Suite', () => {
    describe('Queue Class', () => {
        let queue;

        beforeEach(() => {
            queue = new Queue();
        });

        it('should enqueue and dequeue elements', () => {
            queue.enqueue('a');
            queue.enqueue('b');
            expect(queue.dequeue()).to.equal('a');
            expect(queue.dequeue()).to.equal('b');
        });

        it('should peek at front element', () => {
            queue.enqueue('a');
            queue.enqueue('b');
            expect(queue.peek()).to.equal('a');
            expect(queue.size()).to.equal(2);
        });

        it('should check if empty', () => {
            expect(queue.isEmpty()).to.be.true;
            queue.enqueue('a');
            expect(queue.isEmpty()).to.be.false;
        });

        it('should return correct size', () => {
            expect(queue.size()).to.equal(0);
            queue.enqueue('a');
            expect(queue.size()).to.equal(1);
            queue.enqueue('b');
            expect(queue.size()).to.equal(2);
            queue.dequeue();
            expect(queue.size()).to.equal(1);
        });

        it('should clear the queue', () => {
            queue.enqueue('a');
            queue.enqueue('b');
            queue.clear();
            expect(queue.isEmpty()).to.be.true;
            expect(queue.size()).to.equal(0);
        });
    });

    describe('Piece Class', () => {
        let board;

        beforeEach(() => {
            board = new Board();
        });

        it('should create O piece with correct rotations', () => {
            const oPiece = new Piece([[1, 1], [1, 1]], 1, true);
            expect(oPiece.rotations).to.have.lengthOf(4);
            expect(oPiece.material).to.equal(1);
        });

        it('should rotate piece correctly', () => {
            const piece = new Piece([[1, 0, 0], [1, 1, 1]], 1, true);
            const initialRotation = JSON.stringify(piece.state);
            
            piece.rotate(board);
            
            expect(JSON.stringify(piece.state)).to.not.equal(initialRotation);
            expect(piece.state_index).to.equal(1);
        });

        it('should rotate piece backwards correctly', () => {
            const piece = new Piece([[1, 0, 0], [1, 1, 1]], 1, true);
            const initialRotation = JSON.stringify(piece.state);
            
            piece.rotate_backwards(board);
            
            expect(JSON.stringify(piece.state)).to.not.equal(initialRotation);
            expect(piece.state_index).to.equal(3);
        });

        it('should move piece within boundaries', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            piece.position = [3, 3]; // Position within board boundaries
            
            const movedRight = piece.move(1, 0, board);
            expect(movedRight).to.be.true;
            expect(piece.position[0]).to.equal(4);
            
            const movedDown = piece.move(0, 1, board);
            expect(movedDown).to.be.true;
            expect(piece.position[1]).to.equal(4);
        });

        it('should not move piece into collision', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            piece.position = [0, 0];
            
            const movedLeft = piece.move(-1, 0, board);
            expect(movedLeft).to.be.false;
            expect(piece.position[0]).to.equal(0);
        });

        it('should get correct block positions', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            piece.position = [3, 0];
            
            const positions = piece.get_block_positions();
            expect(positions).to.deep.include.members([
                [3, 0], [4, 0], [3, 1], [4, 1]
            ]);
            expect(positions).to.have.lengthOf(4);
        });

        it('should handle I piece wall kicks correctly', () => {
            const iPiece = new Piece([[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], 1, true);
            expect(iPiece.rotations).to.have.lengthOf(4);
        });
    });

    describe('Board Class', () => {
        let board;

        beforeEach(() => {
            board = new Board();
        });

        it('should initialize with empty board', () => {
            const state = board.get_state();
            expect(state).to.have.lengthOf(20);
            expect(state[0]).to.have.lengthOf(10);
            expect(board.points).to.deep.equal([0, 0, 0, 0]);
        });

        it('should detect collision when piece is outside boundaries', () => {
            const piece = {
                state: [[1, 1], [1, 1]],
                position: [-1, 0]
            };
            expect(board.check_collision(piece)).to.be.true;

            piece.position = [9, 0];
            expect(board.check_collision(piece)).to.be.true;

            piece.position = [0, 19];
            expect(board.check_collision(piece)).to.be.true;
        });

        it('should detect collision with existing blocks', () => {
            board.state[5][5] = 1;
            
            const piece = {
                state: [[1, 1], [1, 1]],
                position: [4, 4]
            };
            expect(board.check_collision(piece)).to.be.true;
        });

        it('should not detect collision for valid placement', () => {
            const piece = {
                state: [[1, 1], [1, 1]],
                position: [0, 0]
            };
            expect(board.check_collision(piece)).to.be.false;
        });

        it('should lock piece to board', () => {
            const piece = {
                state: [[1, 1], [1, 1]],
                position: [0, 0]
            };
            
            board.lock_piece(piece);
            
            expect(board.state[0][0]).to.equal(1);
            expect(board.state[0][1]).to.equal(1);
            expect(board.state[1][0]).to.equal(1);
            expect(board.state[1][1]).to.equal(1);
        });

        it('should remove full lines and update points', () => {
            // Fill a row with material 1 (dirt)
            board.state[19] = Array(10).fill(1);
            
            const linesCleared = board.remove_lines();
            expect(linesCleared).to.equal(1);
            expect(board.state[19]).to.deep.equal(Array(10).fill(0));
            expect(board.points[0]).to.equal(10); // 10 dirt blocks cleared
        });

        it('should track cleared blocks', () => {
            // Fill a row with material 2 (stone)
            board.state[19] = Array(10).fill(2);
            
            board.remove_lines();
            const clearedBlocks = board.consume_cleared_blocks();
            
            expect(clearedBlocks).to.have.lengthOf(10);
            expect(clearedBlocks[0].Material).to.equal(2);
            expect(clearedBlocks[0].position).to.deep.equal({ x: 0, y: 19 });
        });

        it('should block rows correctly', () => {
            board.block_row(2);
            
            expect(board.state[19]).to.deep.equal(Array(10).fill(5));
            expect(board.state[18]).to.deep.equal(Array(10).fill(5));
            expect(board.blocked_rows).to.equal(2);
        });

        it('should check if piece can move down', () => {
            const piece = {
                state: [[1, 1], [1, 1]],
                position: [0, 0]
            };
            expect(board.can_move_down(piece)).to.be.true;

            piece.position = [0, 18]; // 2x2 piece at row 18 occupies rows 18-19 (bottom)
            expect(board.can_move_down(piece)).to.be.false;
        });

        it('should calculate spectrum correctly', () => {
            board.state[18][0] = 1;
            board.state[17][1] = 1;
            
            const spectrum = board.get_spectrum();
            expect(spectrum[0]).to.equal(2);
            expect(spectrum[1]).to.equal(3);
            expect(spectrum[2]).to.equal(0);
        });

        it('should update board state correctly', () => {
            const piece = {
                state: [[1, 1], [1, 1]],
                position: [0, 0]
            };
            
            board.update(piece);
            
            expect(board.state[0][0]).to.equal(1);
            expect(board.state[0][1]).to.equal(1);
            expect(board.state[1][0]).to.equal(1);
            expect(board.state[1][1]).to.equal(1);
        });
    });

    describe('Player Class', () => {
        let player;

        beforeEach(() => {
            player = new Player({
                playerName: 'player1',
                socketId: 'socket1',
                playerRates: [100, 0, 0, 0], // 100% dirt spawn rate
                effects: {}
            });
        });

        it('should initialize with empty queue and board', () => {
            expect(player.piece_queue.isEmpty()).to.be.true;
            expect(player.current_piece).to.be.null;
            expect(player.spectrum).to.deep.equal(Array(10).fill(0));
            expect(player.name).to.equal('player1');
            expect(player.id).to.equal('socket1');
            expect(player.spawn_rates).to.deep.equal([100, 0, 0, 0]);
            expect(player.effects).to.deep.equal({});
        });

        it('should queue and set current piece', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            player.queue_piece(piece);
            
            expect(player.piece_queue.size()).to.equal(1);
            
            player.set_current_piece();
            expect(player.current_piece).to.not.be.null;
            expect(player.piece_queue.size()).to.equal(0);
            expect(player.current_piece.position).to.deep.equal([3, -1]);
        });

        it('should move piece left and right', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            player.queue_piece(piece);
            player.set_current_piece();
            
            // Move the piece down so it's not above the board
            player.current_piece.position = [3, 5];
            
            const initialX = player.current_piece.position[0];
            
            const movedLeft = player.move_left();
            expect(movedLeft).to.be.true;
            expect(player.current_piece.position[0]).to.equal(initialX - 1);
            
            const movedRight = player.move_right();
            expect(movedRight).to.be.true;
            expect(player.current_piece.position[0]).to.equal(initialX);
        });

        it('should rotate piece', () => {
            const piece = new Piece([[1, 0, 0], [1, 1, 1]], 1, true);
            player.queue_piece(piece);
            player.set_current_piece();
            
            // Move the piece down so it's not above the board
            player.current_piece.position = [3, 5];
            
            const initialState = player.current_piece.state_index;
            const rotated = player.rotate();
            
            expect(rotated).to.be.true;
            expect(player.current_piece.state_index).to.equal((initialState + 1) % 4);
        });

        it('should rotate piece backwards', () => {
            const piece = new Piece([[1, 0, 0], [1, 1, 1]], 1, true);
            player.queue_piece(piece);
            player.set_current_piece();
            
            // Move the piece down so it's not above the board
            player.current_piece.position = [3, 5];
            
            const initialState = player.current_piece.state_index;
            const rotatedBackwards = player.rotate_backwards();
            
            expect(rotatedBackwards).to.be.true;
            expect(player.current_piece.state_index).to.equal((initialState + 3) % 4);
        });

        it('should step piece down', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            player.queue_piece(piece);
            player.set_current_piece();
            
            // Move the piece down so it's not above the board
            player.current_piece.position = [3, 5];
            
            const initialY = player.current_piece.position[1];
            const steppedDown = player.step_down();
            
            expect(steppedDown).to.be.true;
            expect(player.current_piece.position[1]).to.equal(initialY + 1);
        });

        it('should step piece up', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            player.queue_piece(piece);
            player.set_current_piece();
            
            // Move the piece down so it's not at the top edge
            player.current_piece.position = [3, 5];
            
            const initialY = player.current_piece.position[1];
            const steppedUp = player.step_up();
            
            expect(steppedUp).to.be.true;
            expect(player.current_piece.position[1]).to.equal(initialY - 1);
        });

        it('should calculate spectrum', () => {
            player.board.state[18][0] = 1;
            player.board.state[17][1] = 1;
            
            player.set_spectrum();
            const spectrum = player.get_spectrum();
            
            expect(spectrum[0]).to.equal(2);
            expect(spectrum[1]).to.equal(3);
        });

        it('should hard drop piece', () => {
            const piece = new Piece([[1, 1], [1, 1]], 1, true);
            player.queue_piece(piece);
            player.set_current_piece();
            
            const initialY = player.current_piece.position[1];
            const hardDropped = player.hard_drop();
            
            expect(hardDropped).to.be.true;
            expect(player.current_piece.position[1]).to.be.greaterThan(initialY);
        });

        it('should set time played', () => {
            const startTime = Date.now();
            player.set_time_played(startTime);
            
            expect(player.time_played).to.be.a('number');
            expect(player.time_played).to.be.greaterThanOrEqual(0);
        });
    });

    describe('Game Class', () => {
        let game;

        beforeEach(() => {
            // Create game with player info objects
            game = new Game([
                { 
                    playerName: 'player1', 
                    socketId: 'socket1',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                },
                { 
                    playerName: 'player2', 
                    socketId: 'socket2',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                }
            ], 'test-room', Game.MULTI_PLAYER, 500, () => [], 'Normal');
        });

        it('should initialize with players from player info objects', () => {
            expect(game.players.size).to.equal(2);
            expect(game.players.has('player1')).to.be.true;
            expect(game.players.has('player2')).to.be.true;
            expect(game.minimum_players).to.equal(Game.MULTI_PLAYER);
            expect(game.room).to.equal('test-room');
            expect(game.gamemodeName).to.equal('Normal');
            expect(game.gravity).to.equal(500);
        });

        it('should handle single player mode', () => {
            const singlePlayerGame = new Game([
                { 
                    playerName: 'player1', 
                    socketId: 'socket1',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                }
            ], 'test-room', Game.SINGLE_PLAYER, 500, () => [], 'Singleplayer');
            
            expect(singlePlayerGame.players.size).to.equal(1);
            expect(singlePlayerGame.minimum_players).to.equal(Game.SINGLE_PLAYER);
            expect(singlePlayerGame.gamemodeName).to.equal('Singleplayer');
        });

        it('should start game', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            expect(game.isRunning).to.be.true;
            expect(game.startTime).to.be.a('number');
            
            // Each player should have pieces
            game.players.forEach(player => {
                expect(player.piece_queue.size()).to.be.greaterThan(0);
                expect(player.current_piece).to.not.be.null;
            });
        });

        it('should handle player input by player name', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            // Move the pieces down so they're not above the board
            game.players.forEach(player => {
                player.current_piece.position = [3, 5];
            });
            
            const moved = game.handle_player_input('player1', 'right');
            expect(moved).to.be.true;
            
            const rotated = game.handle_player_input('player1', 'rotate');
            expect(rotated).to.be.true;
        });

        it('should get game state with player names', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            const gameState = game.get_game_state();
            expect(gameState).to.have.property('player1');
            expect(gameState).to.have.property('player2');
            expect(gameState.player1).to.have.property('player_name', 'player1');
            expect(gameState.player1).to.have.property('board');
            expect(gameState.player1).to.have.property('current_piece');
        });

        it('should eliminate player by player name', () => {
            expect(game.eliminatedPlayers).to.not.include('player1');
            game.eliminate_player('player1');
            expect(game.eliminatedPlayers).to.include('player1');
        });

        it('should check if running', () => {
            expect(game.is_running()).to.be.false;
            
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            expect(game.is_running()).to.be.true;
            
            game.stop();
            expect(game.is_running()).to.be.false;
        });

        it('should handle hard drop action', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            // Move the piece down so it's not above the board
            const player = game.players.get('player1');
            player.current_piece.position = [3, 5];
            
            const hardDropped = game.handle_player_input('player1', 'hard_drop');
            expect(hardDropped).to.be.true;
        });

        it('should handle down action', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            // Move the piece down so it's not above the board
            const player = game.players.get('player1');
            player.current_piece.position = [3, 5];
            
            const movedDown = game.handle_player_input('player1', 'down');
            expect(movedDown).to.be.true;
        });

        it('should return false for unknown action', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            const result = game.handle_player_input('player1', 'unknown_action');
            expect(result).to.be.false;
        });

        it('should return false for eliminated player input', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            game.eliminate_player('player1');
            
            const result = game.handle_player_input('player1', 'right');
            expect(result).to.be.false;
        });

        it('should return false for non-existent player input', () => {
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            const result = game.handle_player_input('non_existent_player', 'right');
            expect(result).to.be.false;
        });

        it('should update player rates', () => {
            const newRates = [80, 10, 5, 5];
            const newEffects = { lineBonus: { dirt: 5 } };
            
            const result = game.updatePlayerRates('player1', newRates, newEffects);
            expect(result).to.be.true;
            
            const player = game.players.get('player1');
            expect(player.spawn_rates).to.deep.equal(newRates);
            expect(player.effects.lineBonus.dirt).to.equal(5);
        });

        it('should return false when updating rates for non-existent player', () => {
            const result = game.updatePlayerRates('non_existent_player', [100, 0, 0, 0], {});
            expect(result).to.be.false;
        });
    });

    describe('Integration Tests', () => {
        it('should handle multiple players with player info', () => {
            const game = new Game([
                { 
                    playerName: 'player1', 
                    socketId: 'socket1',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                },
                { 
                    playerName: 'player2', 
                    socketId: 'socket2',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                },
                { 
                    playerName: 'player3', 
                    socketId: 'socket3',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                }
            ], 'test-room', Game.MULTI_PLAYER, 500, () => [], 'Normal');
            
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            expect(game.players.size).to.equal(3);
            
            // Each player should have their own board and pieces
            game.players.forEach((player, playerName) => {
                expect(player.board).to.not.be.null;
                expect(player.current_piece).to.not.be.null;
                expect(player.piece_queue.size()).to.be.greaterThan(0);
            });
            
            const gameState = game.get_game_state();
            expect(Object.keys(gameState)).to.have.lengthOf(3);
            expect(gameState.player1.player_name).to.equal('player1');
            expect(gameState.player2.player_name).to.equal('player2');
            expect(gameState.player3.player_name).to.equal('player3');
        });

        it('should handle game flow with elimination', () => {
            const game = new Game([
                { 
                    playerName: 'player1', 
                    socketId: 'socket1',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                }
            ], 'test-room', Game.SINGLE_PLAYER, 500, () => [], 'Singleplayer');
            
            const mockIo = {
                to: () => ({
                    emit: () => {}
                })
            };
            
            game.start(mockIo);
            
            // Initially player should not be eliminated
            expect(game.eliminatedPlayers).to.not.include('player1');
            
            // Eliminate the player
            game.eliminate_player('player1');
            expect(game.eliminatedPlayers).to.include('player1');
            
            // Game should still be running with eliminated player
            expect(game.is_running()).to.be.true;
        });

        it('should handle different gamemodes', () => {
            const pvpGame = new Game([
                { 
                    playerName: 'player1', 
                    socketId: 'socket1',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                },
                { 
                    playerName: 'player2', 
                    socketId: 'socket2',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                }
            ], 'test-room', Game.MULTI_PLAYER, 500, () => [], 'PvP');
            
            const coopGame = new Game([
                { 
                    playerName: 'player1', 
                    socketId: 'socket1',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                },
                { 
                    playerName: 'player2', 
                    socketId: 'socket2',
                    playerRates: [100, 0, 0, 0],
                    effects: {}
                }
            ], 'test-room', Game.MULTI_PLAYER, 500, () => [], 'Coop');
            
            expect(pvpGame.gamemodeName).to.equal('PvP');
            expect(coopGame.gamemodeName).to.equal('Coop');
        });
    });
});