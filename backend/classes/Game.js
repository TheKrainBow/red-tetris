import { Piece } from "./Piece.js";
import { Player } from "./Player.js";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class Game {
    constructor(players, room, mode, gravity=500, getSpectatorSockets = () => []) {
        this.room = room;
        this.players = new Map(players.map(player_info => [player_info.playerName, new Player(player_info)]));
        this.minimum_players = mode
        this.eliminatedPlayers = [];
        this.onStatusChange = null;
        
        this.I = [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]];
        this.J = [[1,0,0],[1,1,1],[0,0,0]];
        this.L = [[1,1,1],[1,0,0],[0,0,0]];
        this.O = [[1,1],[1,1]];
        this.S = [[0,1,1],[1,1,0],[0,0,0]];
        this.T = [[0,1,0],[1,1,1],[0,0,0]];
        this.Z = [[1,1,0],[0,1,1],[0,0,0]];
        
        this.shapes = [this.I, this.J, this.L, this.O, this.S, this.T, this.Z];
        this.isRunning = false;
        this.gravity = gravity;
        this.getSpectatorSockets = typeof getSpectatorSockets === 'function' ? getSpectatorSockets : () => [];
    }

    static SINGLE_PLAYER = 1;
    static MULTI_PLAYER = 2;

    #notifyStatusChange() {
        if (typeof this.onStatusChange === 'function') {
            this.onStatusChange();
        }
    }

    #add_to_players_piece_queue() {
        const randomShapeIndex = Math.floor(Math.random() * this.shapes.length);
        const shape = this.shapes[randomShapeIndex];
        const material = Math.floor(Math.random() * 4) + 1;
        const randomRotationIndex = Math.floor(Math.random() * 4);
        
        this.players.forEach((player, player_name) => {
            const piece = new Piece(shape, material);
            piece.state_index = randomRotationIndex;
            piece.state = piece.rotations[piece.state_index];
            player.queue_piece(piece);
        });
    }

    #set_players_piece() {
        this.players.forEach((player, player_name) => {
            player.set_current_piece();
        });
    }

    #set_blocked_rows(thisPlayer, nrows_to_block) {
        this.players.forEach((player, player_name) => {
            if (player.name !== thisPlayer.name) {
                player.board.block_row(nrows_to_block);
            }
        });
    }

    #send_game_state(io) {
        const spectatorSockets = this.getSpectatorSockets() || [];
    
        this.players.forEach((currentPlayer, currentPlayerName) => {
            let opponents = []
            const clearedRows = currentPlayer.board.consume_cleared_rows();
            const playerGameState = {
                    Board: currentPlayer.board.get_state(),
                    CurrentPiece: {
                        shape: currentPlayer.current_piece.state,
                        pos: currentPlayer.current_piece.position,
                        material: currentPlayer.current_piece.material,
                    },
                    NextPiece: {Shape: currentPlayer.piece_queue.peek().state},
                    ClearedRows: clearedRows,
                    LinesCleared: Array.isArray(clearedRows) ? clearedRows.length : 0,
                    player_name: currentPlayerName,
            };
            this.players.forEach((otherPlayer, otherPlayerId) => {
                if (otherPlayerId !== currentPlayerName) {
                    opponents.push({name: otherPlayer.name, spectrum: otherPlayer.get_spectrum()})
                }
            });
            playerGameState["Opponents"] = opponents;
            io.to(currentPlayer.id).emit('room_boards', playerGameState);

            if (spectatorSockets.length > 0) {
                spectatorSockets.forEach((socketId) => {
                    io.to(socketId).emit('room_boards', { ...playerGameState, spectator: true });
                });
            }
        });
    } 

    #end_turn(player){
        player.board.lock_piece(player.current_piece);
            const lines_cleared = player.board.remove_lines();
            
            if (lines_cleared > 0) {
                // const points = [0, 100, 300, 500, 800];
                // player.points += points[Math.min(lines_cleared, 4)];
                
                this.#set_blocked_rows(player, lines_cleared);
            }
            
            player.set_spectrum();
            
            if(!this.eliminatedPlayers.includes(player.name)){
                player.set_current_piece();
            }
            
            if (player.piece_queue.size() < 3) {
                this.#add_to_players_piece_queue();
            }
    }

    #end_game(player) {
        const canMoveDown = player.board.can_move_down(player.current_piece);
        
        if (!canMoveDown) {
            
            this.#end_turn(player);
            if (!player.board.can_move_down(player.current_piece)) {
                return true;
            }
        }
        const moved = player.step_down();
        return false;
    }

    start(io) {
        for (let i = 0; i < 3; i++) {
            this.#add_to_players_piece_queue();
        }
        this.#set_players_piece();
        this.isRunning = true;
        this.startTime = Date.now();

        const room_name = this.room;
        const player_list = Array.from(this.players.values());
        const starting_time = this.startTime
        
        const game_start = {
            type: "game_start",
            data:{room_name, player_list, starting_time}
        }

        io.to(this.room).emit('game_start', game_start);
        this.#notifyStatusChange();
    }

    stop() {
        this.isRunning = false;
    }

    async run(io) {
        if (this.isRunning) return;
        
        this.start(io);
        
        while (this.isRunning && this.players.size >= this.minimum_players) {
            
            this.players.forEach((player, player_name) => {

                if (this.eliminatedPlayers.includes(player_name)){
                    this.players.delete(player_name);
                    io.to(this.room).emit('player_eliminated', { player_name: player_name });
                    this.#notifyStatusChange();
                }
                
                if (this.#end_game(player)) {
                    this.eliminatedPlayers.push(player_name);
                    this.#notifyStatusChange();
                    
                }
                
            });
            
            if (this.players.size < this.minimum_players) {
                this.stop()
                break;
            }

            this.#send_game_state(io);
                 
            await sleep(this.gravity);
        }
        this.stop();
        const room_name = this.room;
        const winner = this.players.size === 1 ? this.players.keys().value : "";
        const game_end = {
            type: "game_end",
            data: { room_name, winner }
        };
        io.to(this.room).emit('game_end', game_end);
        this.#notifyStatusChange();
    } 

    get_game_state() {
        const gameState = {};
        this.players.forEach((player, player_name) => {
            const nextPieces = [];
            
            gameState[player_name] = {
                player_name: player_name,
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

    handle_player_input(player_name, action) {
        const player = this.players.get(player_name);
        if (!player || !player.current_piece) return false;
        if (this.eliminatedPlayers.includes(player_name)) return false;
        
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
                this.#end_turn(player);
                break;
            default:
                console.log(`Unknown action: ${action}`);
        }
        
        return success;
    }

    broadcast_state(io) {
        if (!io || !this.isRunning) return;
        this.#send_game_state(io);
    }

    eliminate_player(player_name){
        this.eliminatedPlayers.push(player_name);
    }

    is_running(){
        return this.isRunning;
    }
}
