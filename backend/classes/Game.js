import { Piece } from "./Piece.js";
import { Player } from "./Player.js";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class Game {
    constructor(players, room) {
        this.room = room;
        this.players = new Map(players.map(player_id => [player_id, new Player(player_id)]));
        
        this.I = [[1,1,1,1]];
        this.J = [[1,0,0],[1,1,1]];
        this.L = [[1,1,1],[1,0,0]];
        this.O = [[1,1],[1,1]];
        this.S = [[0,1,1],[1,1,0]];
        this.T = [[0,1,0],[1,1,1]];
        this.Z = [[1,1,0],[0,1,1]];
        
        this.shapes = [this.I, this.J, this.L, this.O, this.S, this.T, this.Z];
        this.isRunning = false;
    }

    #add_to_players_piece_queue() {
        const randomIndex = Math.floor(Math.random() * this.shapes.length);
        const shape = this.shapes[randomIndex];
        
        this.players.forEach((player, id) => {
            const piece = new Piece(shape);
            player.queue_piece(piece);
        });
    }

    #set_players_piece() {
        this.players.forEach((player, id) => {
            player.set_current_piece();
        });
    }

    #set_blocked_rows(thisPlayer, nrows_to_block) {
        this.players.forEach((player, id) => {
            if (player.id !== thisPlayer.id) {
                player.board.block_row(nrows_to_block);
            }
        });
    }

    start() {
        for (let i = 0; i < 3; i++) {
            this.#add_to_players_piece_queue();
        }
        this.#set_players_piece();
        this.isRunning = true;
    }

    #end_turn(player) {
        const canMoveDown = player.board.can_move_down(player.current_piece);
        
        if (!canMoveDown) {
            player.board.lock_piece(player.current_piece);
            const lines_cleared = player.board.remove_lines();
            
            if (lines_cleared > 0) {
                // const points = [0, 100, 300, 500, 800];
                // player.points += points[Math.min(lines_cleared, 4)];
                
                this.#set_blocked_rows(player, lines_cleared);
            }
            
            player.set_spectrum();
            
            player.set_current_piece();
            
            if (player.piece_queue.size() < 3) {
                this.#add_to_players_piece_queue();
            }

            if (player.board.check_collision(player.current_piece)) {
                return true;
            }
        }
        return false;
    }

    async run(io) {
        if (this.isRunning) return;
        
        this.start();
        
        while (this.isRunning && this.players.size > 1) {
            const eliminatedPlayers = [];
            
            this.players.forEach((player, id) => {
                const moved = player.step_down();
                
                if (this.#end_turn(player)) {
                    eliminatedPlayers.push(id);
                    this.players.delete(id);
                    io.to(this.room).emit('player_eliminated', { player_id: id });
                }
            });
            
            if (this.players.size === 1) {
                this.stop()
                io.to(this.room).emit('game_over', gameState);
                break;
            }

            this.send_game_state(io);
                 
            await sleep(500);
        }
    }

    send_game_state(io) {
    const gameStates = {};
    
    this.players.forEach((currentPlayer, currentPlayerId) => {
        const playerGameState = {
            self: {
                player_id: currentPlayerId,
                board: currentPlayer.board.get_state(),
                current_piece: {
                    state: currentPlayer.current_piece.state,
                    position: currentPlayer.current_piece.position
                },
                next_piece: currentPlayer.piece_queue.peek().shape,
                points: currentPlayer.points,
                spectrum: currentPlayer.get_spectrum()
            },
            opponents: {}
        };
        this.players.forEach((otherPlayer, otherPlayerId) => {
            if (otherPlayerId !== currentPlayerId) {
                playerGameState.opponents[otherPlayerId] = {
                    spectrum: otherPlayer.get_spectrum()
                };
            }
        });
        
        io.to(currentPlayer).emit('refresh', playerGameState);
    });
    
    return gameStates;
}

    get_game_state() {
        const gameState = {};
        this.players.forEach((player, id) => {
            const nextPieces = [];
            
            gameState[id] = {
                player_id: id,
                board: player.board.get_state(),
                current_piece: {
                    state: player.current_piece.state,
                    position: player.current_piece.position
                },
                next_pieces_count: player.piece_queue.size(),
                points: player.points,
                spectrum: player.get_spectrum()
            };
        });
        return gameState;
    }

    handle_player_input(player_id, action) {
        const player = this.players.get(player_id);
        if (!player || !player.current_piece) return false;
        
        let success = false;
        
        switch (action) {
            case 'left':
                success = player.move_left();
                break;
            case 'right':
                success = player.move_right();
                break;
            case 'down':
                success = player.step_down();
                break;
            case 'rotate':
                success = player.rotate();
                break;
            case 'hard_drop':
                success = player.hard_drop();
                break;
            default:
                console.log(`Unknown action: ${action}`);
        }
        
        return success;
    }

    stop() {
        this.isRunning = false;
    }
}