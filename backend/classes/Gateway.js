import { Game } from "./Game.js";
import { Piece } from "./Piece.js";

export class Gateway {
    constructor(io, db, shop) {
        this.io = io;
        this.db = db;
        this.shop = shop;
        this.games = {};
        this.rooms = new Map();
        this.playerInfo = new Map();
        this.roomMetadata = new Map();
        this.roomStatuses = new Map(); // roomName -> Map(playerName -> status)
        this.roomInitialPlayers = new Map(); // roomName -> Set(playerName) for current game
    }

    #formatCommandResponse(event, data = {}) {
        return { event, data };
    }

    #normalizeGamemode(raw) {
        const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
        if (value.includes('single')) return 'singleplayer';
        if (value.includes('coop')) return 'multiplayer_coop';
        if (value.includes('pvp') || value.includes('versus') || value.includes('multi')) return 'multiplayer_pvp';
        return 'multiplayer_pvp';
    }

    #normalizePlayerLimit(raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) return 16;
        return Math.min(16, Math.max(1, Math.round(n)));
    }

    #getRoomGamemode(roomName) {
        const meta = this.roomMetadata.get(roomName) || {};
        return meta.gamemode || 'Normal';
    }

    #getRoomPlayerLimit(roomName) {
        const meta = this.roomMetadata.get(roomName) || {};
        return Number.isFinite(meta.player_limit) ? meta.player_limit : 16;
    }

    #getStatusMap(roomName) {
        if (!this.roomStatuses.has(roomName)) {
            this.roomStatuses.set(roomName, new Map());
        }
        return this.roomStatuses.get(roomName);
    }

    #build_room_status(roomName) {
        if (!this.rooms.has(roomName)) return null;

        const playersMap = this.rooms.get(roomName);
        // Reset any persisted statuses when starting a fresh game
        this.roomStatuses.set(roomName, new Map());
        const game = this.games[roomName];
        const metadata = this.roomMetadata.get(roomName) || {};

        const TotalConnections = playersMap.size;
        let playingCount = 0;
        let gameStatus = 'WAITING_FOR_PLAYER';
        let startingTime = null;
        let playerNames = Array.from(playersMap.keys());

        if (game) {
            playingCount = game.players.size;

            if (game.isRunning) {
                gameStatus = 'PLAYING';
                playerNames = Array.from(game.players.keys());
                if (game.startTime) {
                    startingTime = game.startTime;
                }
            }
        } else {
            gameStatus = 'WAITING_FOR_PLAYER';
        }

        return {
            room_name: roomName,
            game_status: gameStatus,
            players_playing: playingCount,
            spectators: TotalConnections - playingCount,
            starting_time: startingTime,
            players: playerNames,
            room_gamemode: metadata.gamemode || 'Normal',
            player_limit: Number.isFinite(metadata.player_limit) ? metadata.player_limit : 16,
        };
    }

    #build_rooms_status_list() {
        const roomsStatus = [];

        this.rooms.forEach((_, roomName) => {
            const status = this.#build_room_status(roomName);
            if (status) roomsStatus.push(status);
        });

        return roomsStatus;
    }

    #build_player_list(roomName) {
        if (!this.rooms.has(roomName)) return null;

        const playersMap = this.rooms.get(roomName);
        const game = this.games[roomName];
        const isRunning = game?.is_running() || false;
        const playingNames = new Set(game ? Array.from(game.players.keys()) : []);
        const eliminatedNames = new Set(game ? game.eliminatedPlayers : []);
        const statusMap = this.#getStatusMap(roomName);
        const initialSet = this.roomInitialPlayers.get(roomName) || new Set();

        const players = [];
        const counts = {
            total: 0,
            playing: 0,
            eliminated: 0,
            spectating: 0,
            waiting: 0,
            hosts: 0,
        };

        const seenPlayers = new Set();

        const addPlayer = (playerName, hostFlag, status) => {
            if (!playerName || seenPlayers.has(playerName)) return;
            seenPlayers.add(playerName);
            players.push({ name: playerName, host: Boolean(hostFlag), status });
            counts.total += 1;
            counts.hosts += hostFlag ? 1 : 0;
            counts[status] = (counts[status] || 0) + 1;
        };

        // Combine names from sockets, status map, and game state
        const allNames = new Set([
            ...Array.from(playersMap.keys()),
            ...Array.from(statusMap.keys()),
            ...Array.from(playingNames),
            ...Array.from(eliminatedNames),
        ]);

        allNames.forEach((playerName) => {
            const socketId = playersMap.get(playerName);
            const info = socketId ? (this.playerInfo.get(socketId) || {}) : {};
            let status = statusMap.get(playerName);

            if (!status) {
                if (isRunning) {
                    if (playingNames.has(playerName)) status = 'playing';
                    else if (eliminatedNames.has(playerName)) status = 'eliminated';
                    else status = 'spectating';
                } else {
                    status = 'waiting';
                }
            }

            // When game not running, normalize statuses
            if (!isRunning) {
                if (!socketId) {
                    statusMap.delete(playerName);
                    return;
                }
                if (status === 'disconnected') {
                    statusMap.delete(playerName);
                    return;
                }
                if (status === 'eliminated' || status === 'playing' || status === 'spectating') {
                    status = 'waiting';
                    statusMap.set(playerName, status);
                }
            }

            addPlayer(playerName, info.host, status);
        });

        // Drop any lingering disconnected entries after game end and clear initial set
        if (!isRunning) {
            for (const [name, st] of statusMap.entries()) {
                if (st === 'disconnected') statusMap.delete(name);
            }
            this.roomInitialPlayers.delete(roomName);
        }

        return this.#formatCommandResponse('player_list', {
            room: roomName,
            players,
            counts,
            game_running: isRunning,
        });
    }

    #getSpectatorSocketIds(roomName) {
        const playersMap = this.rooms.get(roomName);
        const game = this.games[roomName];
        if (!playersMap || !game) return [];

        const playingNames = new Set(game.players.keys());
        const spectatorSockets = [];
        const statusMap = this.#getStatusMap(roomName);

        playersMap.forEach((socketId, playerName) => {
            if (playingNames.has(playerName)) return;
            const status = statusMap.get(playerName);
            if (status === 'disconnected') return;
            spectatorSockets.push(socketId);
        });

        return spectatorSockets;
    }

    #broadcast_player_list(roomName) {
        if (!this.io || !roomName) return null;
        const payload = this.#build_player_list(roomName);
        if (payload) {
            this.io.to(roomName).emit('player_list', payload);
        }
        return payload;
    }

    #broadcast_lobby_room(roomName) {
        if (!this.io) return null;
        const status = this.#build_room_status(roomName);
        const payload = status
            ? { room: status, rooms: [status] }
            : { room: { room_name: roomName, deleted: true }, rooms: [] };
        const wrapped = this.#formatCommandResponse('lobby_update', payload);
        this.io.to('lobby').emit('lobby_update', wrapped);
        return payload;
    }

    #broadcast_lobby_full() {
        if (!this.io) return null;
        const rooms = this.#build_rooms_status_list();
        const payload = { rooms };
        const wrapped = this.#formatCommandResponse('lobby_rooms', payload);
        this.io.to('lobby').emit('lobby_rooms', wrapped);
        return payload;
    }

    async #new_game(socket, roomName) {
        if (!this.rooms.has(roomName)) {
            return ;
        }
        if (this.games[roomName] && this.games[roomName].isRunning) {
            return;
        }
        const playersMap = this.rooms.get(roomName);
        const roomGamemode = (this.roomMetadata.get(roomName)?.gamemode) || 'multiplayer_pvp';
        const gmLower = String(roomGamemode).toLowerCase();
        const isSingle = gmLower.includes('single');
        let mode = isSingle ? Game.SINGLE_PLAYER : Game.MULTI_PLAYER;

        const hostName = (() => {
            for (const info of this.playerInfo.values()) {
                if (info.room === roomName && info.host) return info.playerName;
            }
            return null;
        })();

        const players_info = await Promise.all(
            [...playersMap.entries()].map(async ([playerName, socketId]) => {
                const ratesRow = await this.db.get_rates_by_player_name(playerName);
                const baseRates = ratesRow?.[0] || { dirt_probability: 100, stone_probability: 0, iron_probability: 0, diamond_probability: 0 };
                let computedRates = [
                    Number(baseRates.dirt_probability) || 0,
                    Number(baseRates.stone_probability) || 0,
                    Number(baseRates.iron_probability) || 0,
                    Number(baseRates.diamond_probability) || 0,
                ];
                let effects = {};
                if (this.shop) {
                    const mods = await this.shop.getPlayerEffects(playerName, baseRates);
                    effects = mods?.effects || {};
                }
                return {
                    socketId,
                    playerName,
                    playerRates: computedRates,
                    effects,
                };
            })
        );
        const filteredPlayers = isSingle
            ? players_info.filter((p) => !hostName || p.playerName === hostName)
            : players_info;

        if (!isSingle && filteredPlayers.length > 1){
            mode = Game.MULTI_PLAYER;
        }

        const spectatorProvider = () => this.#getSpectatorSocketIds(roomName);
        this.games[roomName] = new Game(filteredPlayers, roomName, mode, 500, spectatorProvider, roomGamemode);
        // Track initial players and seed statuses
        const initialSet = new Set(filteredPlayers.map((p) => p.playerName));
        this.roomInitialPlayers.set(roomName, initialSet);
        const statusMap = this.#getStatusMap(roomName);
        statusMap.clear();
        playersMap.forEach((_, name) => {
            if (initialSet.has(name)) statusMap.set(name, 'playing');
            else statusMap.set(name, 'spectating');
        });
        this.games[roomName].onStatusChange = () => {
            this.#broadcast_player_list(roomName);
            this.#broadcast_lobby_room(roomName);
        };
        this.games[roomName].run(this.io, this.db);
    }

    #create_room(socket, data) {
        const { room, playerName, gamemode } = data;
        this.rooms.set(room, new Map([[playerName, socket.id]]));
        let host = true;
        this.playerInfo.set(socket.id, { room, playerName, host });
        this.roomMetadata.set(room, { gamemode: this.#normalizeGamemode(gamemode), player_limit: 16 });
        socket.join(room);
    }

    async handle_key_press(socket, data) {
        if (!data || !data.key) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Missing key input' });
        }

        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Player not in a room' });
        }

        const game = this.games[playerInfo.room];
        if (!game || !game.is_running()) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Game not running' });
        }

        const keyMap = {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowUp: 'rotate',
            ArrowDown: 'down',
            Space: 'hard_drop',
            ' ': 'hard_drop',
        };

        const action = keyMap[data.key];
        if (!action) {
            return this.#formatCommandResponse('handle_key_press', { error: 'Unsupported key' });
        }

        const handled = game.handle_player_input(playerInfo.playerName, action);
        if (handled && this.io) {
            game.broadcast_state(this.io);
        }
        return this.#formatCommandResponse('handle_key_press', { success: Boolean(handled) });
    }

    async join_room(socket, data) {
        const { room, playerName } = data || {};
        if (!room || typeof playerName !== 'string') {
            return this.#formatCommandResponse('join_room', { error: 'Invalid room or name' });
        }

        await this.db.insert_user(playerName);

        if (!this.rooms.has(room)) {
            this.#create_room(socket, data);
            const host = true;
            const response = this.#formatCommandResponse('join_room', { success: true, room, playerName, host, room_gamemode: this.#getRoomGamemode(room), player_limit: this.#getRoomPlayerLimit(room) });
            this.#broadcast_player_list(room);
            this.#broadcast_lobby_room(room);
            return response;
        }

        const playersMap = this.rooms.get(room);
        if (!this.roomMetadata.has(room)) {
            this.roomMetadata.set(room, { gamemode: this.#normalizeGamemode(data?.gamemode), player_limit: 16 });
        }

        const nameExists = Array.from(playersMap.keys()).includes(playerName);
        if (nameExists) {
            return this.#formatCommandResponse('join_room', { error: 'A user is already using this name' });
        }
        
        playersMap.set(playerName, socket.id,);
        let host = false;
        this.playerInfo.set(socket.id, { room, playerName, host });
        socket.join(room);

        const statusMap = this.#getStatusMap(room);
        const runningGame = this.games[room];
        if (runningGame && runningGame.is_running()) {
            if (statusMap.get(playerName) === 'disconnected' || runningGame.eliminatedPlayers?.includes(playerName)) {
                statusMap.set(playerName, 'eliminated');
            } else {
                statusMap.set(playerName, 'spectating');
            }
        } else {
            statusMap.delete(playerName);
        }

        const response = this.#formatCommandResponse('join_room', { success: true, room, playerName, host, room_gamemode: this.#getRoomGamemode(room), player_limit: this.#getRoomPlayerLimit(room) });
        this.#broadcast_player_list(room);
        this.#broadcast_lobby_room(room);
        return response;
    }

    async player_kick(socket, data) {
        const { roomName, room, playerName, player, playerToKick } = data || {};
        const targetRoom = roomName || room;
        const requesterName = playerName || player;
        const targetName = playerToKick;

        if (!targetRoom || !targetName) {
            return this.#formatCommandResponse('player_kick', { success: false, error: 'Invalid payload' });
        }

        const requesterInfo = this.playerInfo.get(socket.id);
        if (!requesterInfo || requesterInfo.room !== targetRoom || requesterInfo.host !== true) {
            return this.#formatCommandResponse('player_kick', { success: false, error: 'Only the host can kick players' });
        }

        const game = this.games[targetRoom];
        if (game && game.is_running()) {
            return this.#formatCommandResponse('player_kick', { success: false, error: 'Game already started' });
        }

        const playersMap = this.rooms.get(targetRoom);
        if (!playersMap || !playersMap.has(targetName)) {
            return this.#formatCommandResponse('player_kick', { success: false, error: 'Player not found' });
        }

        const targetSocketId = playersMap.get(targetName);
        const targetInfo = this.playerInfo.get(targetSocketId) || { room: targetRoom, playerName: targetName, host: false };

        await this.remove_player(targetInfo);
        this.playerInfo.delete(targetSocketId);

        const targetSocket = this.io?.sockets?.sockets?.get(targetSocketId);
        if (targetSocket && targetSocket.rooms.has(targetRoom)) {
            targetSocket.leave(targetRoom);
        }

        const payload = {
            success: true,
            room: targetRoom,
            player_name: targetName,
            kicked_by: requesterName || requesterInfo.playerName,
        };
        const wrapped = this.#formatCommandResponse('player_kick', payload);

        if (this.io) {
            this.io.to(targetRoom).emit('player_kick', wrapped);
            if (targetSocketId) {
                this.io.to(targetSocketId).emit('player_kick', wrapped);
            }
        }
        this.#broadcast_player_list(targetRoom);
        this.#broadcast_lobby_room(targetRoom);
        return wrapped;
    }

    async remove_player(playerInfo){
        if (!playerInfo) return null;

        const { room, playerName } = playerInfo;
        const game = this.games[room];

        if (!this.rooms.has(room)) {
            return room;
        }

        const playersMap = this.rooms.get(room);
        const isRunning = game?.is_running() || false;
        const isPlaying = Boolean(game && game.players.has(playerName));
        const statusMap = this.#getStatusMap(room);
        const initialSet = this.roomInitialPlayers.get(room) || new Set();

        if (isPlaying && isRunning && game) {
            game.eliminate_player(playerName);
            game.players.delete(playerName);
            if (initialSet.has(playerName)) {
                statusMap.set(playerName, 'eliminated');
            } else {
                statusMap.delete(playerName);
            }
            if (this.io) {
                this.io.to(room).emit('player_eliminated', { player_name: playerName });
                this.#broadcast_lobby_room(room);
            }
            if (typeof game.onStatusChange === 'function') {
                game.onStatusChange();
            }
        }

        playersMap.delete(playerName);

        if (playerInfo.host === true) {
            for (const [_, nextHostSocketId] of playersMap.entries()) {
                if (nextHostSocketId && this.playerInfo.has(nextHostSocketId)) {
                    const nextInfo = this.playerInfo.get(nextHostSocketId);
                    if (nextInfo) {
                        nextInfo.host = true;
                        this.playerInfo.set(nextHostSocketId, nextInfo);
                    }
                    break;
                }
            }
        }

        if (playersMap.size === 0) {
            this.rooms.delete(room);
            this.roomMetadata.delete(room);
            this.roomStatuses.delete(room);
            this.roomInitialPlayers.delete(room);
            if (game) {
                game.stop();
                delete this.games[room];
            }
            this.#broadcast_lobby_room(room);
        } else {
            this.#broadcast_lobby_room(room);
        }
        return room;
    }

    async disconnect(socket, reason) {
        console.log(`Socket disconnected ${socket.id}, reason: ${reason}`);
        const playerInfo = this.playerInfo.get(socket.id);
        const room = await this.remove_player(playerInfo);
        if (room) {
            this.#broadcast_player_list(room);
        }
        this.playerInfo.delete(socket.id);
    }

    async start_game(socket, data) {
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) return this.#formatCommandResponse('start_game', { error: 'Player not in a room' });

        const { room, host } = playerInfo;
        if (host === false){
            return this.#formatCommandResponse('start_game', { success: false, room, error: 'Only the host can start the game' });
        }
        await this.#new_game(socket, room);
        this.#broadcast_player_list(room);
        return this.#formatCommandResponse('start_game', { success: true, room });
    }

    async leave_room(socket, data){
        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo) {
            return this.#formatCommandResponse('leave_room', { success: true });
        }

        const room = await this.remove_player(playerInfo);
        this.playerInfo.delete(socket.id);
        if (this.rooms.has(playerInfo.room)){
            socket.leave(playerInfo.room);
        }
        if (room) {
            this.#broadcast_player_list(room);
        }
        return this.#formatCommandResponse('leave_room', { success: true, room: playerInfo.room, playerName: playerInfo.playerName });
    }

    async room_list(socket, data) {
        const roomsStatus = this.#build_rooms_status_list();

        const response = this.#formatCommandResponse('room_list', {
            success: true,
            rooms: roomsStatus
        });

        socket.emit('room_list_response', response);
        return response;
    }

    async subscribe_lobby(socket) {
        socket.join('lobby');
        const payload = { rooms: this.#build_rooms_status_list() };
        socket.emit('lobby_rooms', payload);
        return this.#formatCommandResponse('subscribe_lobby', { success: true });
    }

    async unsubscribe_lobby(socket) {
        socket.leave('lobby');
        return this.#formatCommandResponse('unsubscribe_lobby', { success: true });
    }

    async update_room_settings(socket, data) {
        const { roomName, room, gamemode, player_limit } = data || {};
        const targetRoom = roomName || room;
        if (!targetRoom) {
            return this.#formatCommandResponse('room_settings', { success: false, error: 'Missing room' });
        }

        const playerInfo = this.playerInfo.get(socket.id);
        if (!playerInfo || playerInfo.room !== targetRoom || playerInfo.host !== true) {
            return this.#formatCommandResponse('room_settings', { success: false, error: 'Only the host can update settings' });
        }

        const game = this.games[targetRoom];
        if (game && game.isRunning) {
            return this.#formatCommandResponse('room_settings', { success: false, error: 'Game already running' });
        }

        if (!this.rooms.has(targetRoom)) {
            return this.#formatCommandResponse('room_settings', { success: false, error: 'Room not found' });
        }

        const meta = this.roomMetadata.get(targetRoom) || {};

        if (gamemode !== undefined) {
            meta.gamemode = this.#normalizeGamemode(gamemode);
        }

        if (player_limit !== undefined) {
            const limit = this.#normalizePlayerLimit(player_limit);
            const currentCount = (this.rooms.get(targetRoom)?.size) || 0;
            if (limit < currentCount) {
                return this.#formatCommandResponse('room_settings', { success: false, error: `Too many players in the room to set Max Player to ${limit}`, attempted: limit });
            }
            meta.player_limit = limit;
        }

        this.roomMetadata.set(targetRoom, meta);

        const payload = {
            success: true,
            room: targetRoom,
            gamemode: meta.gamemode,
            room_gamemode: meta.gamemode,
            player_limit: meta.player_limit ?? 16,
        };
        if (this.io) {
            this.io.to(targetRoom).emit('room_settings', payload);
            this.#broadcast_lobby_room(targetRoom);
        }
        return this.#formatCommandResponse('room_settings', payload);
    }

    async get_room_settings(socket, data) {
        const playerInfo = this.playerInfo.get(socket.id);
        const targetRoom = data?.roomName || data?.room || playerInfo?.room;
        if (!targetRoom) {
            return this.#formatCommandResponse('room_settings', { success: false, error: 'Missing room' });
        }
        if (!this.rooms.has(targetRoom)) {
            return this.#formatCommandResponse('room_settings', { success: false, error: 'Room not found' });
        }
        const meta = this.roomMetadata.get(targetRoom) || {};
        const payload = {
            success: true,
            room: targetRoom,
            gamemode: meta.gamemode || 'Normal',
            room_gamemode: meta.gamemode || 'Normal',
            player_limit: Number.isFinite(meta.player_limit) ? meta.player_limit : 16,
        };
        return this.#formatCommandResponse('room_settings', payload);
    }

    async insert_user(socket, data){
        const {playerName} = data;
        const success = await this.db.insert_user(playerName);
        const payload = {success};
        return this.#formatCommandResponse('insert_user', payload);
    }

    async get_user_by_player_name(socket, data){
        const {playerName} = data;
        let inventory = null;
        const user = await this.db.get_user_by_player_name(playerName);
        if (user){
            inventory = await this.db.get_inventory_by_player_name(playerName);
        }
        const payload = {success: user != null && user.length > 0, user, inventory};
        return this.#formatCommandResponse('get_user_by_player_name', payload);
    }

    async get_all_users(socket, data){
        const users = await this.db.get_all_users();
        const payload = {success: users != null, users_list: users};
        return this.#formatCommandResponse('get_all_users', payload);
    }

    async get_rates_by_player_name(socket, data){
        const {playerName} = data;
        const rates = await this.db.get_rates_by_player_name(playerName);
        let caps = null;
        if (this.shop) {
            caps = await this.shop.getSpawnCaps(playerName);
        }
        const payload = {success: rates != null, playerName, rates, caps};
        return this.#formatCommandResponse('get_rates_by_player_name', payload);
    }

    async update_rates_by_player_name(socket, data){
        const payload = await this.db.update_rates_by_player_name(data);
        if (payload?.success !== false) {
            await this.#refreshPlayerRatesInGames(data?.playerName);
        }
        return this.#formatCommandResponse('update_rates_by_player_name', payload);
    }

    async update_inventory(socket, data){
        const { playerName, resources = {}, items = {} } = data || {};
        const result = await this.db.update_inventory(playerName, { resources, items });
        const payload = { success: Boolean(result?.success), player_name: playerName, user: result?.user, inventory: result?.inventory };
        if (this.io && payload.success) {
            socket.emit('player_inventory', payload);
        }
        return this.#formatCommandResponse('update_inventory', payload);
    }

    async shop_buy(socket, data) {
        const { playerName, itemId } = data || {};
        if (!this.shop) return this.#formatCommandResponse('shop_buy', { success: false, reason: 'shop_unavailable' });
        const res = await this.shop.buy(playerName, itemId);
        if (this.io && res?.success) {
            socket.emit('player_inventory', { player_name: playerName, user: res.user, inventory: res.inventory });
        }
        return this.#formatCommandResponse('shop_buy', res);
    }

    async shop_trade(socket, data) {
        const { playerName, tradeId, times } = data || {};
        if (!this.shop) return this.#formatCommandResponse('shop_trade', { success: false, reason: 'shop_unavailable' });
        const res = await this.shop.trade(playerName, tradeId, times);
        if (this.io && res?.success) {
            socket.emit('player_inventory', { player_name: playerName, user: res.user, inventory: res.inventory });
        }
        return this.#formatCommandResponse('shop_trade', res);
    }

    async shop_craft(socket, data) {
        const { playerName, craftId, times } = data || {};
        if (!this.shop) return this.#formatCommandResponse('shop_craft', { success: false, reason: 'shop_unavailable' });
        const res = await this.shop.craft(playerName, craftId, times);
        if (this.io && res?.success) {
            socket.emit('player_inventory', { player_name: playerName, user: res.user, inventory: res.inventory });
        }
        return this.#formatCommandResponse('shop_craft', res);
    }

    async get_history_by_player_name(socket, data) {
        const playerName = data?.playerName;
        const res = await this.db.get_history_by_player_name(playerName);
        return this.#formatCommandResponse('get_history_by_player_name', res);
    }

    async #refreshPlayerRatesInGames(playerName) {
        if (!playerName) return;
        const baseRatesRow = await this.db.get_rates_by_player_name(playerName);
        const baseRates = Array.isArray(baseRatesRow) && baseRatesRow[0]
            ? baseRatesRow[0]
            : { dirt_probability: 100, stone_probability: 0, iron_probability: 0, diamond_probability: 0 };
        let computedRates = [
            Number(baseRates.dirt_probability) || 0,
            Number(baseRates.stone_probability) || 0,
            Number(baseRates.iron_probability) || 0,
            Number(baseRates.diamond_probability) || 0,
        ];
        let effects = {};
        if (this.shop) {
            const mods = await this.shop.getPlayerEffects(playerName, baseRates);
            effects = mods?.effects || {};
        }

        for (const game of Object.values(this.games)) {
            if (game && typeof game.updatePlayerRates === 'function') {
                game.updatePlayerRates(playerName, computedRates, effects);
            }
        }
    }
}
