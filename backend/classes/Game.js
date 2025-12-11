import { Piece } from "./Piece.js";
import { Player } from "./Player.js";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class Game {
    constructor(players, room, mode, gravity=500, getSpectatorSockets = () => [], gamemodeName = 'Normal') {
        this.room = room;
        this.players = new Map(players.map(player_info => [player_info.playerName, new Player(player_info)]));
        this.allPlayers = players.map((p) => ({ name: p.playerName, socketId: p.socketId }));
        this.mode = mode;
        this.gamemodeName = gamemodeName;
        this.minimum_players = mode;
        this.eliminatedPlayers = [];
        this.onStatusChange = null;
        this.resourceSnapshots = new Map();
        this.lastBoardSnapshots = new Map();
        this.finalResources = new Map();
        this.players.forEach((_, playerName) => {
            this.resourceSnapshots.set(playerName, [0, 0, 0, 0]);
        });
        
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

    async #add_to_players_piece_queue() {
        const randomShapeIndex = Math.floor(Math.random() * this.shapes.length);
        const shape = this.shapes[randomShapeIndex];
        const randomRotationIndex = Math.floor(Math.random() * 4);

        await Promise.all(
            [...this.players.entries()].map(async ([player_name, player]) => {
            
                const rand = Math.floor(Math.random() * 100);
                let material = 1;
                let rates = 0;
            
                for (let i = 0; i < player.spawn_rates.length; i++) {
                    rates += player.spawn_rates[i];
                
                    if (rand < rates) {
                        material = i + 1;
                        break;
                    }
                }
            
                const piece = new Piece(shape, material);
                piece.state_index = randomRotationIndex;
                piece.state = piece.rotations[piece.state_index];
            
                player.queue_piece(piece);
            })
        );
    }

    #set_players_piece() {
        this.players.forEach((player, player_name) => {
            player.set_current_piece();
        });
    }

    async #syncPlayerInventory(playerName, player, db, io, bonusDelta = null) {
        const currentPoints = player.board.points || [];
        const lastPoints = this.resourceSnapshots.get(playerName) || [0, 0, 0, 0];
        const delta = currentPoints.map((p, idx) => Math.max(0, (p || 0) - (lastPoints[idx] || 0)));
        const bonus = Array.isArray(bonusDelta) ? bonusDelta : [0, 0, 0, 0];
        const deltaWithBonus = delta.map((v, i) => v + (bonus[i] || 0));
        const deltaSum = deltaWithBonus.reduce((sum, v) => sum + v, 0);
        if (deltaSum <= 0) return;

        if (db?.update_player_resources) {
            const res = await db.update_player_resources(playerName, deltaWithBonus);
            this.resourceSnapshots.set(playerName, [...currentPoints]);
            if (res?.success && io) {
                io.to(player.id).emit('player_inventory', {
                    player_name: playerName,
                    user: res.user,
                    inventory: res.inventory,
                });
            }
        }
    }

    #set_blocked_rows(thisPlayer, nrows_to_block) {
        this.players.forEach((player, player_name) => {
            if (player.name !== thisPlayer.name) {
                player.board.block_row(nrows_to_block);
            }
        });
    }

    #recordFinalResources(playerName, sourcePoints) {
        if (!playerName) return;
        const points = Array.isArray(sourcePoints) ? sourcePoints : [];
        this.finalResources.set(playerName, [...points]);
    }

    async #send_game_state(io, db) {
        const spectatorSockets = this.getSpectatorSockets() || [];
    
        for (const [currentPlayerName, currentPlayer] of this.players.entries()) {
            let opponents = []
            const clearedBlocks = currentPlayer.board.consume_cleared_blocks ? currentPlayer.board.consume_cleared_blocks() : [];
            const linesCleared = Array.isArray(clearedBlocks) ? new Set(clearedBlocks.map((b) => b?.position?.y)).size : 0;
            const playerGameState = {
                    Board: currentPlayer.board.get_state(),
                    CurrentPiece: {
                        shape: currentPlayer.current_piece.state,
                        pos: currentPlayer.current_piece.position,
                        material: currentPlayer.current_piece.material,
                    },
                    NextPiece: {Shape: currentPlayer.piece_queue.peek().state},
                    player_name: currentPlayerName,
            };
            this.lastBoardSnapshots.set(currentPlayerName, { ...playerGameState, captured_at: Date.now() });
            this.players.forEach((otherPlayer, otherPlayerId) => {
                if (otherPlayerId !== currentPlayerName) {
                    opponents.push({name: otherPlayer.name, spectrum: otherPlayer.get_spectrum()})
                }
            });
            playerGameState["Opponents"] = opponents;
            io.to(currentPlayer.id).emit('room_boards', playerGameState);
            if (clearedBlocks.length) {
                io.to(currentPlayer.id).emit('cleared_blocks', {
                    player_name: currentPlayerName,
                    blocks: clearedBlocks,
                });
            }

            // Sync collected resources to DB on each tick based on delta since last sync
            const bonusDelta = this.#computeLineBonus(currentPlayer, linesCleared);
            await this.#syncPlayerInventory(currentPlayerName, currentPlayer, db, io, bonusDelta);

            if (spectatorSockets.length > 0) {
                spectatorSockets.forEach((socketId) => {
                    io.to(socketId).emit('room_boards', { ...playerGameState, spectator: true });
                });
            }
        }
    } 

    #computeLineBonus(player, linesCleared) {
        if (!linesCleared || linesCleared <= 0) return [0, 0, 0, 0];
        const effects = player.effects || {};
        const lineBonus = effects.lineBonus || {};
        const multiplier = Math.max(0, effects.lineBonusMultiplier || 1);
        const fortune = 1 + Math.max(0, effects.fortuneMultiplierPercent || 0) / 100;
        const resOrder = ['dirt', 'stone', 'iron', 'diamond'];
        return resOrder.map((key) => {
            const perLine = lineBonus[key] || 0;
            const raw = perLine * linesCleared * multiplier * fortune;
            return Math.floor(raw);
        });
    }

    updatePlayerRates(playerName, rates = [], effects = {}) {
        const player = this.players.get(playerName);
        if (!player) return false;
        player.spawn_rates = Array.isArray(rates) && rates.length ? rates : player.spawn_rates;
        player.effects = effects || player.effects || {};
        return true;
    }

    #end_turn(player){
        player.board.lock_piece(player.current_piece);
            const lines_cleared = player.board.remove_lines();
            
            if (lines_cleared > 0) {
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

    async run(io, db) {
        if (this.isRunning) return;
        
        this.start(io);
        const isSinglePlayer = this.mode === Game.SINGLE_PLAYER;
        
        while (this.isRunning && this.players.size >= this.minimum_players) {
            for (const [player_name, player] of this.players.entries()) {

                if (this.eliminatedPlayers.includes(player_name)){
                    this.#recordFinalResources(player_name, player.board.points);
                    await this.#syncPlayerInventory(player_name, player, db, io);
                    await db.update_player_stats(player, false, isSinglePlayer, [0, 0, 0, 0]);
                    this.players.delete(player_name);
                    io.to(this.room).emit('player_eliminated', { player_name: player_name });
                    this.#notifyStatusChange();
                }
                
                if (this.#end_game(player)) {
                    this.eliminatedPlayers.push(player_name);
                    player.set_time_played(this.startTime);
                    this.#notifyStatusChange();
                    
                }
                
            }
            
            if (this.players.size < this.minimum_players) {
                this.stop()
                break;
            }

            await this.#send_game_state(io, db);
                 
            await sleep(this.gravity);
        }
        this.stop();
        const room_name = this.room;
        const winner = this.players.size === 1 ? this.players.keys().next().value : "";
        if (winner !== ""){
            const player = this.players.get(winner);
            player.set_time_played(this.startTime);
            await this.#syncPlayerInventory(winner, player, db, io);
            await db.update_player_stats(player, true, isSinglePlayer, [0, 0, 0, 0]);
            this.#recordFinalResources(winner, player.board.points);
        }
        const game_end = {
            type: "game_end",
            data: { room_name, winner }
        };
        io.to(this.room).emit('game_end', game_end);
        // Persist game history after finishing
        try {
            const endedAt = Date.now();
            const gmRaw = this.gamemodeName || '';
            const gamemodeLabel = this.mode === Game.SINGLE_PLAYER
                ? 'Singleplayer'
                : (String(gmRaw).toLowerCase().includes('coop') ? 'Cooperation' : 'PvP');
            const serverName = this.mode === Game.SINGLE_PLAYER ? (room_name || '').replace(/_singleplayer$/i, '') : room_name;
            const playersSummary = this.allPlayers.map((p) => {
                const name = p?.name || p?.playerName;
                if (!name) return null;
                const status = winner === name ? 'winner' : (this.eliminatedPlayers.includes(name) ? 'eliminated' : 'finished');
                return { name, socketId: p?.socketId || null, status };
            }).filter(Boolean);
            const boards = {};
            this.lastBoardSnapshots.forEach((snapshot, name) => {
                boards[name] = snapshot;
            });
            const resources = {};
            const ensureResourceEntry = (name, pts) => {
                if (!name) return;
                const arr = Array.isArray(pts) ? pts : [];
                resources[name] = {
                    dirt: arr[0] || 0,
                    stone: arr[1] || 0,
                    iron: arr[2] || 0,
                    diamond: arr[3] || 0,
                };
            };
            this.finalResources.forEach((pts, name) => ensureResourceEntry(name, pts));
            this.allPlayers.forEach((p) => {
                const name = p?.name || p?.playerName;
                if (resources[name]) return;
                const livePlayer = this.players.get(name);
                ensureResourceEntry(name, livePlayer?.board?.points || [0, 0, 0, 0]);
            });
            db.insert_game_history && db.insert_game_history({
                room_name,
                server_name: serverName,
                gamemode: gamemodeLabel,
                started_at: this.startTime,
                ended_at: endedAt,
                winner,
                players: playersSummary,
                boards,
                resources,
            });
        } catch (err) {
            console.error('Failed to store game history', err);
        }
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
        if (this.eliminatedPlayers.includes(player_name)) {
            return;
        }
        this.eliminatedPlayers.push(player_name);
    }

    is_running(){
        return this.isRunning;
    }
}
