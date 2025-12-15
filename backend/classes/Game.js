import { Piece } from "./Piece.js";
import { Player } from "./Player.js";

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const BASE_FORTUNE_GAIN_PER_LINE = 0.03;

export class Game {
    constructor(players, room, mode, gravity = 500, getSpectatorSockets = () => [], gamemodeName = 'Normal') {
        this.room = room;
        this.players = new Map(players.map(player_info => [player_info.playerName, new Player(player_info)]));
        this.allPlayers = players.map((p) => ({ name: p.playerName, socketId: p.socketId }));
        this.mode = mode;
        this.gamemodeName = gamemodeName;
        this.minimum_players = mode;
        this.eliminatedPlayers = [];
        this.onStatusChange = null;

        this.lastBoardSnapshots = new Map();
        this.finalResources = new Map();

        this.awardedTotals = new Map();
        this.pendingDbDelta = new Map();

        const baseFortunes = players.map((p) => 1 + Math.max(0, (p.effects?.fortuneMultiplierPercent || 0)) / 100);
        this.gameFortuneMultiplier = baseFortunes.length ? Math.max(...baseFortunes) : 1;

        this.players.forEach((_, playerName) => {
            this.awardedTotals.set(playerName, [0, 0, 0, 0]);
            this.pendingDbDelta.set(playerName, [0, 0, 0, 0]);
        });

        this.I = [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]];
        this.J = [[1, 0, 0], [1, 1, 1], [0, 0, 0]];
        this.L = [[1, 1, 1], [1, 0, 0], [0, 0, 0]];
        this.O = [[1, 1], [1, 1]];
        this.S = [[0, 1, 1], [1, 1, 0], [0, 0, 0]];
        this.T = [[0, 1, 0], [1, 1, 1], [0, 0, 0]];
        this.Z = [[1, 1, 0], [0, 1, 1], [0, 0, 0]];

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
        const randomRotationIndex = Math.floor(Math.random() * 4);

        for (const [player_name, player] of this.players.entries()) {
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
        }
    }

    #set_players_piece() {
        this.players.forEach((player) => {
            player.set_current_piece();
        });
    }

    #addArrays(a = [0, 0, 0, 0], b = [0, 0, 0, 0]) {
        return a.map((v, i) => (Number(v) || 0) + (Number(b[i]) || 0));
    }

    #sanitizeDelta(deltaArr) {
        const d = Array.isArray(deltaArr) ? deltaArr : [0, 0, 0, 0];
        return d.map(v => Math.max(0, Math.floor(Number(v) || 0)));
    }

    async #awardAndSync(playerName, player, db, io, deltaArr) {
        const delta = this.#sanitizeDelta(deltaArr);
        const sum = delta.reduce((s, v) => s + v, 0);
        if (sum <= 0) return;

        const prevTotal = this.awardedTotals.get(playerName) || [0, 0, 0, 0];
        const nextTotal = this.#addArrays(prevTotal, delta);
        this.awardedTotals.set(playerName, nextTotal);

        const prevPending = this.pendingDbDelta.get(playerName) || [0, 0, 0, 0];
        const nextPending = this.#addArrays(prevPending, delta);
        this.pendingDbDelta.set(playerName, nextPending);

        if (io) {
            io.to(player.id).emit('resources_total', {
                player_name: playerName,
                resources_total: nextTotal,
                resources_last_award: delta,
            });
        }

        if (!db?.update_player_resources) return;

        const res = await db.update_player_resources(playerName, nextPending);
        if (!res?.success) {
            console.warn('[gain][db] update failed', { player: playerName, delta: nextPending, res });
        }
        if (res?.success) {
            this.pendingDbDelta.set(playerName, [0, 0, 0, 0]);
            if (io) {
                io.to(player.id).emit('player_inventory', {
                    player_name: playerName,
                    user: res.user,
                    inventory: res.inventory,
                });
            }
        }
    }

    async #flushPending(playerName, player, db, io) {
        if (!db?.update_player_resources) return;
        const pending = this.pendingDbDelta.get(playerName) || [0, 0, 0, 0];
        const sum = pending.reduce((s, v) => s + v, 0);
        if (sum <= 0) return;
        const res = await db.update_player_resources(playerName, pending);
        if (!res?.success) {
            console.warn('[gain][db] flush failed', { player: playerName, pending, res });
        } else {
            this.pendingDbDelta.set(playerName, [0, 0, 0, 0]);
            if (io) {
                io.to(player.id).emit('player_inventory', {
                    player_name: playerName,
                    user: res.user,
                    inventory: res.inventory,
                });
            }
        }
    }

    #set_blocked_rows(thisPlayer, nrows_to_block) {
        const gm = String(this.gamemodeName || '').toLowerCase();
        if (gm.includes('coop')) {
            return;
        }
        const malus = Math.max(0, (Number(nrows_to_block) || 0) - 1);
        if (malus <= 0) return;
        this.players.forEach((player) => {
            if (player.name !== thisPlayer.name) {
                player.board.block_row(malus);
            }
        });
    }

    #recordFinalResources(playerName) {
        if (!playerName) return;
        const awarded = this.awardedTotals.get(playerName);
        if (awarded && Array.isArray(awarded) && awarded.length === 4) {
            this.finalResources.set(playerName, [...awarded]);
            return;
        }
        this.finalResources.set(playerName, [0, 0, 0, 0]);
    }

    #computeLineBonus(player, linesCleared) {
        if (!linesCleared || linesCleared <= 0) return [0, 0, 0, 0];
        const effects = player.effects || {};
        const lineBonus = effects.lineBonus || {};
        const multiplier = Math.max(0, effects.lineBonusMultiplier || 1);
        const resOrder = ['dirt', 'stone', 'iron', 'diamond'];
        return resOrder.map((key) => {
            const perLine = lineBonus[key] || 0;
            const raw = perLine * linesCleared * multiplier;
            return Math.floor(raw);
        });
    }

    #getLineClearMultiplier(linesCleared = 0) {
        if (linesCleared >= 4) return 4.0;
        if (linesCleared === 3) return 2.5;
        if (linesCleared === 2) return 1.5;
        return 1.0;
    }

    #applyFortune(deltaArr = [], multiplier = 1) {
        if (!multiplier || multiplier <= 1) return deltaArr;
        return deltaArr.map((val) => {
            const n = Number(val) || 0;
            if (n <= 0) return 0;
            const total = n * multiplier;
            const guaranteed = Math.floor(total);
            const remainder = total - guaranteed;
            const extra = Math.random() < remainder ? 1 : 0;
            return guaranteed + extra;
        });
    }

    #applyResourceMultipliers(deltaArr = [], multipliers = {}) {
        const order = ['dirt', 'stone', 'iron', 'diamond'];
        return deltaArr.map((val, idx) => {
            const base = Math.max(0, Number(val) || 0);
            const key = order[idx] || '';
            const mult = Math.max(0, Number(multipliers?.[key] || 1));
            return Math.floor(base * mult);
        });
    }

    #logResourceGain(playerName, context = {}) {
        const {
            linesCleared = 0,
            fortune = 1,
            lineMultiplier = 1,
            resourceMultipliers = {},
            baseRaw = [],
            fortuneExtra = [],
            baseLineMultExtra = [],
            bonusRaw = [],
            bonusLineMultExtra = [],
            resourceMultBase = [],
            resourceMultBonus = [],
            total = [],
        } = context;
        const resOrder = ['dirt', 'stone', 'iron', 'diamond'];
        const lines = [];
        resOrder.forEach((res, idx) => {
            const parts = [];
            const base = baseRaw[idx] || 0;
            const fort = fortuneExtra[idx] || 0;
            const baseLine = baseLineMultExtra[idx] || 0;
            const bonus = bonusRaw[idx] || 0;
            const bonusLine = bonusLineMultExtra[idx] || 0;
            const multBase = resourceMultBase[idx] || 0;
            const multBonus = resourceMultBonus[idx] || 0;
            const totalRes = total[idx] || 0;
            if (base) parts.push(`+${base} ${res} from board`);
            if (fort) parts.push(`+${fort} ${res} from fortune`);
            if (baseLine) parts.push(`+${baseLine} ${res} from line multiplier`);
            if (bonus) parts.push(`+${bonus} ${res} from line bonus`);
            if (bonusLine) parts.push(`+${bonusLine} ${res} from line bonus multiplier`);
            if (multBase) parts.push(`+${multBase} ${res} from resource multiplier (base)`);
            if (multBonus) parts.push(`+${multBonus} ${res} from resource multiplier (bonus)`);
            if (totalRes) {
                parts.push(`Total = ${totalRes} ${res}`);
                lines.push(parts.join('\n  '));
            }
        });
        if (!lines.length) return;
        const resMultStr = Object.entries(resourceMultipliers || {})
            .map(([k, v]) => `${k}:${v}`)
            .join(', ');
        console.log(`[gain] ${playerName} lines=${linesCleared} fortune=${fortune.toFixed(2)}x lineMult=${lineMultiplier.toFixed(2)} resMult={${resMultStr}}`);
        console.log('  ' + lines.join('\n  '));
    }

    updatePlayerRates(playerName, rates = [], effects = {}) {
        const player = this.players.get(playerName);
        if (!player) return false;
        player.spawn_rates = Array.isArray(rates) && rates.length ? rates : player.spawn_rates;
        player.effects = effects || player.effects || {};
        return true;
    }

    #end_turn(player) {
        player.board.lock_piece(player.current_piece);
        const lines_cleared = player.board.remove_lines();

        if (lines_cleared > 0) {
            this.#set_blocked_rows(player, lines_cleared);
        }

        player.set_spectrum();

        if (!this.eliminatedPlayers.includes(player.name)) {
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
        player.step_down();
        return false;
    }

    #countBaseFromClearedBlocks(clearedBlocks = []) {
        const base = [0, 0, 0, 0];
        if (!Array.isArray(clearedBlocks) || clearedBlocks.length === 0) return base;

        for (const b of clearedBlocks) {
            const mat =
                Number(b?.Material) ||
                Number(b?.material) ||
                Number(b?.mat) ||
                Number(b?.type) ||
                Number(b?.block?.material) ||
                0;
            if (mat >= 1 && mat <= 4) base[mat - 1] += 1;
        }
        return base;
    }

    async #send_game_state(io, db) {
        const spectatorSockets = this.getSpectatorSockets() || [];

        for (const [currentPlayerName, currentPlayer] of this.players.entries()) {
            const opponents = [];

            const clearedBlocks = currentPlayer.board.consume_cleared_blocks ? currentPlayer.board.consume_cleared_blocks() : [];
            const linesCleared = Array.isArray(clearedBlocks) ? new Set(clearedBlocks.map((b) => b?.position?.y)).size : 0;

            if (linesCleared > 0) {
                const extraFortune = currentPlayer.effects?.fortuneGainPerLineBonus || 0;
                const gainPerLine = BASE_FORTUNE_GAIN_PER_LINE + Math.max(0, Number(extraFortune) || 0);
                this.gameFortuneMultiplier += linesCleared * gainPerLine;
            }

            const lineMultiplier = this.#getLineClearMultiplier(linesCleared);

            const baseDeltaRaw = this.#countBaseFromClearedBlocks(clearedBlocks);
            const fortune = this.gameFortuneMultiplier || 1;
            const baseFortuned = this.#applyFortune(baseDeltaRaw, fortune);
            const baseWithLineMult = baseFortuned.map((v) => Math.floor(v * lineMultiplier));

            const bonusRaw = this.#computeLineBonus(currentPlayer, linesCleared);
            const bonusWithLineMult = bonusRaw.map((v) => Math.floor(v * lineMultiplier));

            const resourceMultipliers = currentPlayer.effects?.resourceGainMultipliers || {};
            const baseFinal = this.#applyResourceMultipliers(baseWithLineMult, resourceMultipliers);
            const bonusFinal = this.#applyResourceMultipliers(bonusWithLineMult, resourceMultipliers);

            const deltaTick = baseFinal.map((v, i) => v + (bonusFinal[i] || 0));
            const fortuneExtra = baseFortuned.map((v, i) => Math.max(0, v - (baseDeltaRaw[i] || 0)));
            const baseLineMultExtra = baseWithLineMult.map((v, i) => Math.max(0, v - (baseFortuned[i] || 0)));
            const bonusLineMultExtra = bonusWithLineMult.map((v, i) => Math.max(0, v - (bonusRaw[i] || 0)));
            const resourceMultBase = baseFinal.map((v, i) => Math.max(0, v - (baseWithLineMult[i] || 0)));
            const resourceMultBonus = bonusFinal.map((v, i) => Math.max(0, v - (bonusWithLineMult[i] || 0)));

            const prevTotals = this.awardedTotals.get(currentPlayerName) || [0, 0, 0, 0];
            const displayTotals = this.#addArrays(prevTotals, deltaTick);

            const playerGameState = {
                Board: currentPlayer.board.get_state(),
                CurrentPiece: {
                    shape: currentPlayer.current_piece.state,
                    pos: currentPlayer.current_piece.position,
                    material: currentPlayer.current_piece.material,
                },
                NextPiece: { Shape: currentPlayer.piece_queue.peek().state },
                player_name: currentPlayerName,
                    fortuneMultiplier: this.gameFortuneMultiplier,
                    line_bonus_per_line: this.#computeLineBonus(currentPlayer, 1),
                    line_bonus_total: bonusRaw.map(v => Math.floor(v)),
                    line_multiplier: lineMultiplier,
                    resources_awarded: deltaTick,
                    resources_total: displayTotals,
            };

            this.lastBoardSnapshots.set(currentPlayerName, { ...playerGameState, captured_at: Date.now() });

            this.players.forEach((otherPlayer, otherPlayerId) => {
                if (otherPlayerId !== currentPlayerName) {
                    opponents.push({ name: otherPlayer.name, spectrum: otherPlayer.get_spectrum() });
                }
            });

            playerGameState.Opponents = opponents;

            io.to(currentPlayer.id).emit('room_boards', playerGameState);

            if (clearedBlocks.length) {
                io.to(currentPlayer.id).emit('cleared_blocks', {
                    player_name: currentPlayerName,
                    blocks: clearedBlocks,
                    line_bonus_per_line: this.#computeLineBonus(currentPlayer, 1),
                    line_bonus_total: bonusRaw.map(v => Math.floor(v)),
                    line_multiplier: lineMultiplier,
                    resources_awarded: deltaTick,
                    resources_total: displayTotals,
                });
            }

            if (linesCleared > 0) {
                this.#logResourceGain(currentPlayerName, {
                    linesCleared,
                    fortune,
                    lineMultiplier,
                    resourceMultipliers,
                    baseRaw: baseDeltaRaw,
                    fortuneExtra,
                    baseLineMultExtra,
                    bonusRaw,
                    bonusLineMultExtra,
                    resourceMultBase,
                    resourceMultBonus,
                    total: deltaTick,
                });
            }

            await this.#awardAndSync(currentPlayerName, currentPlayer, db, io, deltaTick);
            // If DB failed (pendingDbDelta not cleared), retry once more immediately
            const pending = this.pendingDbDelta.get(currentPlayerName) || [0, 0, 0, 0];
            if ((pending.reduce((s, v) => s + v, 0) || 0) > 0) {
                await this.#flushPending(currentPlayerName, currentPlayer, db, io);
            }

            if (spectatorSockets.length > 0) {
                spectatorSockets.forEach((socketId) => {
                    io.to(socketId).emit('room_boards', { ...playerGameState, spectator: true });
                });
            }
        }
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
        const starting_time = this.startTime;

        const game_start = {
            type: "game_start",
            data: { room_name, player_list, starting_time }
        };

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
                if (this.eliminatedPlayers.includes(player_name)) {
                    await this.#flushPending(player_name, player, db, io);
                    this.#recordFinalResources(player_name);
                    await db.update_player_stats(player, false, isSinglePlayer, [0, 0, 0, 0]);
                    this.players.delete(player_name);
                    io.to(this.room).emit('player_eliminated', { player_name: player_name });
                    this.#notifyStatusChange();
                    continue;
                }

                if (this.#end_game(player)) {
                    this.eliminatedPlayers.push(player_name);
                    player.set_time_played(this.startTime);
                    this.#notifyStatusChange();
                }
            }

            if (this.players.size < this.minimum_players) {
                this.stop();
                break;
            }

            await this.#send_game_state(io, db);
            await sleep(this.gravity);
        }

        this.stop();

        const room_name = this.room;
        const winner = this.players.size === 1 ? this.players.keys().next().value : "";

        if (winner !== "") {
            const player = this.players.get(winner);
            player.set_time_played(this.startTime);
            await this.#flushPending(winner, player, db, io);
            await db.update_player_stats(player, true, isSinglePlayer, [0, 0, 0, 0]);
            this.#recordFinalResources(winner);
        }

        const game_end = {
            type: "game_end",
            data: { room_name, winner }
        };

        io.to(this.room).emit('game_end', game_end);

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
                const arr = Array.isArray(pts) ? pts : [0, 0, 0, 0];
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
                const totals = this.awardedTotals.get(name);
                ensureResourceEntry(name, totals || [0, 0, 0, 0]);
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
            gameState[player_name] = {
                player_name: player_name,
                board: player.board.get_state(),
                current_piece: {
                    state: player.current_piece.state,
                    position: player.current_piece.position
                },
                next_pieces_count: player.piece_queue.size(),
                points: player.board.points,
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

    async broadcast_state(io, db) {
        if (!io || !this.isRunning) return;
        await this.#send_game_state(io, db);
    }

    eliminate_player(player_name) {
        if (this.eliminatedPlayers.includes(player_name)) {
            return;
        }
        this.eliminatedPlayers.push(player_name);
    }

    is_running() {
        return this.isRunning;
    }
}
