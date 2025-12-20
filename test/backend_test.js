import { expect } from 'chai'
import proxyquire from 'proxyquire'

proxyquire.noCallThru()

describe('backend/index create()', () => {
  it('serves files and wires socket events', async () => {
    const fsLog = []
    let readCount = 0
    const fsStub = {
      readFile(file, cb) {
        fsLog.push(file)
        if (readCount === 0) {
          readCount += 1
          cb(new Error('boom'))
        } else {
          cb(null, Buffer.from('bundle-data'))
        }
      }
    }

    const appHandlers = {}
    const app = {
      listenArgs: null,
      on(event, handler) {
        appHandlers[event] = handler
      },
      listen(opts, cb) {
        this.listenArgs = opts
        cb()
      },
      close(cb) {
        this.closed = true
        cb && cb()
      },
      unref() {
        this.unrefed = true
      },
      address() {
        return { port: 4100 }
      }
    }

    const ioStub = {
      events: {},
      emits: [],
      on(event, handler) {
        this.events[event] = handler
      },
      to(room) {
        return {
          emit: (event, payload) => {
            this.emits.push({ room, event, payload })
          }
        }
      },
      close() {
        this.closed = true
      }
    }

    const module = proxyquire('../backend/index.js', {
      fs: fsStub,
      http: { createServer: () => app },
      'socket.io': () => ioStub,
      debug: () => () => {},
      path: { resolve: (...parts) => parts.join('/') }
    })

    const created = await module.create({ host: '127.0.0.1', port: 1234, url: 'http://127.0.0.1:1234' })
    expect(created.url).to.equal('http://127.0.0.1:4100')
    expect(app.listenArgs.host).to.equal('127.0.0.1')

    const requestHandler = appHandlers.request
    const responses = []
    const req = { url: '/' }
    const res = {
      writeHead(code) { responses.push(['writeHead', code]) },
      end(payload) { responses.push(['end', payload && payload.toString ? payload.toString() : payload]) }
    }

    requestHandler(req, res)
    requestHandler({ url: '/bundle.js' }, res)
    expect(responses.filter(e => e[0] === 'writeHead').length).to.equal(2)

    const socket = makeSocket('sock-1')
    ioStub.events.connection(socket)
    socket.listeners.action({ type: 'server/ping' })
    expect(socket.emits.some(e => e.type === 'action' && e.payload.type === 'pong')).to.be.true

    await new Promise((resolve) => created.stop(resolve))
    expect(app.closed).to.be.true
    expect(ioStub.closed).to.be.true
  })
})
describe('backend/main bootstrap', () => {
  it('registers socket handlers and delegates to the gateway', async () => {
    // --- fakes that are explicit and closable ---
    const server = {
      port: null,
      listening: false,
      listen(port, cb) {
        this.port = port
        this.listening = true
        if (cb) cb()
        return this
      },
      close(cb) {
        this.listening = false
        if (cb) cb()
      }
    }

    let ioInstance = null

    class FakeIO {
      constructor() {
        this.handlers = {}
        this.emitted = []
        this.sockets = { sockets: new Map() }
        ioInstance = this
      }
      on(event, handler) {
        this.handlers[event] = handler
      }
      to(room) {
        return {
          emit: (event, payload) => {
            this.emitted.push({ room, event, payload })
          }
        }
      }
      close() {}
    }

    class FakeDatabase {
      init() {}
    }

    class FakeShop {
      constructor(db) { this.db = db }
    }

    const gatewayCalls = []
    const gatewayMethods = [
      'disconnect',
      'join_room',
      'start_game',
      'player_kick',
      'handle_key_press',
      'leave_room',
      'room_list',
      'subscribe_lobby',
      'unsubscribe_lobby',
      'update_room_settings',
      'get_room_settings',
      'insert_user',
      'get_user_by_player_name',
      'get_all_users',
      'get_rates_by_player_name',
      'get_history_by_player_name',
      'update_rates_by_player_name',
      'update_inventory',
      'shop_buy',
      'shop_trade',
      'shop_craft'
    ]

    class FakeGateway {
      constructor(io, db, shop) {
        this.io = io
        this.db = db
        this.shop = shop
      }
    }

    for (const method of gatewayMethods) {
      FakeGateway.prototype[method] = async function (_socket, data) {
        gatewayCalls.push({ method, data })
        return { ok: true }
      }
    }

    const expressApp = { use: () => {} }
    const expressStub = () => expressApp
    expressStub.json = () => 'json'
    expressStub.urlencoded = () => 'urlencoded'

    // --- import triggers bootstrap side effects ---
    proxyquire('../backend/main.js', {
      express: expressStub,
      cors: () => 'cors',
      http: { createServer: () => server },
      'socket.io': { Server: FakeIO },
      './classes/Gateway': { Gateway: FakeGateway },
      './classes/Database': { Database: FakeDatabase },
      './classes/Shop': { Shop: FakeShop },
      crypto: { randomUUID: () => 'uuid' }
    })

    expect(server.listening).to.equal(true)
    expect(server.port).to.be.a('number')
    expect(ioInstance).to.exist
    expect(ioInstance.handlers).to.have.property('connection')

    // --- simulate a socket connection + events ---
    const socket = makeSocket('sock-main')

    // Connection handler might be sync or async depending on your main.js
    await Promise.resolve(ioInstance.handlers.connection(socket))

    // should welcome on connect
    expect(socket.emits.some(e => e.type === 'welcome')).to.equal(true)

    // Run all handlers except disconnect
    const ack = () => {}
    for (const [event, handler] of Object.entries(socket.listeners)) {
      if (event === 'disconnect') continue
      await Promise.resolve(handler({ playerName: 'Tester', room: 'alpha' }, ack))
    }

    // Disconnect should delegate too
    if (socket.listeners.disconnect) {
      await Promise.resolve(socket.listeners.disconnect('left'))
    }

    // --- assertions: at least one gateway method got called ---
    expect(gatewayCalls.length).to.be.greaterThan(0)

    // Optional: verify a couple of specific delegations happened (more stable than "all")
    const calledMethods = new Set(gatewayCalls.map(c => c.method))
    expect(calledMethods.has('join_room') || calledMethods.has('room_list') || calledMethods.has('disconnect')).to.equal(true)

    // --- cleanup (no-op for fakes, but prevents real handles if it ever changes) ---
    if (ioInstance && typeof ioInstance.close === 'function') ioInstance.close()
    if (server && typeof server.close === 'function') server.close()
  })
})

describe('Database data helpers', () => {
  it('manipulates users, inventory, stats, and history', async () => {
    const queryLog = []
    const userRow = {
      id: 1,
      player_name: 'tester',
      dirt_collected: 1,
      dirt_owned: 1,
      stone_collected: 1,
      stone_owned: 1,
      iron_collected: 1,
      iron_owned: 1,
      diamond_collected: 1,
      diamond_owned: 1,
      emeralds: 1,
      game_played: 1,
      game_won: 0,
      singleplayer_game_played: 0,
      time_played: 5
    }
    let selectUserCalls = 0
    const fakeClient = {
      released: false,
      query: async (text, params = []) => {
        queryLog.push(text.trim())
        if (text.includes('SELECT * FROM users WHERE player_name')) {
          selectUserCalls += 1
          if (params[0] === 'ghost' && selectUserCalls === 1) {
            return { rows: [] }
          }
          return { rows: [userRow] }
        }
        if (text.includes('SELECT id FROM users') || text.includes('SELECT user_id')) {
          return { rows: [{ id: 1 }] }
        }
        if (text.includes('SELECT * FROM users;')) {
          return { rows: [userRow] }
        }
        if (text.includes('SELECT r.dirt_probability')) {
          return { rows: [{ dirt_probability: 50, stone_probability: 30, iron_probability: 10, diamond_probability: 10 }] }
        }
        if (text.includes('SELECT i.item_name')) {
          return { rows: [{ current_count: 2, max_count: 2 }] }
        }
        if (text.includes('SELECT id, room_name')) {
          return { rows: [{ id: 9 }] }
        }
        if (text.includes('INSERT INTO game_history')) {
          return { rows: [{ id: 10 }] }
        }
        return { rows: [] }
      },
      release() {
        this.released = true
      }
    }

    class PoolStub {
      constructor() {
        this.closed = false
      }
      async connect() {
        return fakeClient
      }
      async end() {
        this.closed = true
      }
    }

    const { Database } = proxyquire('../backend/classes/Database.js', {
      pg: { Pool: PoolStub },
      dotenv: { config: () => {} }
    })

    const db = new Database()
    db.pool = new PoolStub()
    db.client = fakeClient
    await db.init()
    await db.insert_user('tester')
    await db.insert_inventory_item_by_player_name('tester', 'stone_spawn_rate', 100)
    await db.insert_rates_by_player_name('tester')
    const inventory = await db.get_inventory_by_player_name('tester')
    expect(inventory).to.be.an('array')
    const ghost = await db.get_user_by_player_name('ghost')
    expect(ghost[0].player_name).to.equal('tester')
    await db.get_all_users()
    await db.get_rates_by_player_name('tester')
    const invalidRates = await db.update_rates_by_player_name({ playerName: 'tester', dirt_probability: 10, stone_probability: 10, iron_probability: 10, diamond_probability: 10 })
    expect(invalidRates.success).to.be.false
    const validRates = await db.update_rates_by_player_name({ playerName: 'tester', dirt_probability: 25, stone_probability: 25, iron_probability: 25, diamond_probability: 25 })
    expect(validRates.success).to.be.true
    const updateResult = await db.update_inventory('tester', { resources: { dirt: 5, emeralds: 2 }, items: { fortune_enchant: 1 } })
    expect(updateResult.success).to.be.true
    await db.update_player_resources('tester', [1, 1, 1, 1])
    await db.update_player_stats({ name: 'tester', board: { points: [1, 1, 1, 1] }, time_played: 10 }, true, false, null)
    const historyInsert = await db.insert_game_history({
      room_name: 'alpha',
      server_name: 'srv',
      gamemode: 'pvp',
      started_at: Date.now(),
      ended_at: Date.now(),
      winner: 'tester',
      players: [{ name: 'tester' }],
      boards: [],
      resources: {}
    })
    expect(historyInsert.success).to.be.true
    expect((await db.get_history_by_player_name('tester')).success).to.be.true
    expect((await db.get_history_by_player_name()).success).to.be.false
    db.release()
    expect(fakeClient.released).to.be.true
    await db.close()
    expect(db.pool.closed).to.be.true
  })
})

describe('Shop mechanics', () => {
  it('computes caps, effects, and transaction flows', async () => {
    const userRow = {
      id: 1,
      player_name: 'tester',
      dirt_owned: 100,
      stone_owned: 50,
      iron_owned: 25,
      diamond_owned: 10,
      emeralds: 5
    }
    const dbStub = {
      async get_user_by_player_name() { return [userRow] },
      async get_inventory_by_player_name() {
        return [
          { item_name: 'spawn_boost', current_count: 2, max_count: 5 },
          { item_name: 'fortune_machine', current_count: 1, max_count: 5 }
        ]
      },
      async update_inventory() {
        return { success: true, user: userRow, inventory: [] }
      }
    }

    const config = {
      game: {
        resources: ['dirt', 'stone', 'iron', 'diamond'],
        spawn_probabilities_start: { dirt: 10, stone: 5, iron: 2, diamond: 1 }
      },
      shops: [
        {
          id: 'spawn_boost',
          starting_price: 5,
          price_growth_multiplier: 1.2,
          resource_cost: 'dirt',
          effect_type: 'spawn_rate_increase',
          effect_per_level: 0.1,
          affects: 'dirt'
        }
      ],
      trades: [
        {
          id: 'stone_trade',
          cost: { dirt: 2 },
          give: { stone: 1 }
        }
      ],
      crafts: [
        {
          id: 'fortune_machine',
          cost: { stone: 1 },
          outputs: { fortune_enchant: 1 },
          max_crafts: 5,
          effects: { fortune_multiplier_percent: 5 }
        }
      ]
    }

    const { Shop } = proxyquire('../backend/classes/Shop.js', {
      fs: { existsSync: () => true, readFileSync: () => 'mock-yaml' },
      path: { resolve: () => 'shop.yml' },
      'js-yaml': { load: () => config }
    })

    const shop = new Shop(dbStub)
    const caps = await shop.getSpawnCaps('tester')
    expect(caps.dirt).to.be.greaterThan(0)
    const effects = await shop.getPlayerEffects('tester', { dirt_probability: 80, stone_probability: 10, iron_probability: 5, diamond_probability: 5 })
    expect(effects.spawnRates.length).to.equal(4)
    const buyResult = await shop.buy('tester', 'spawn_boost')
    expect(buyResult.success).to.be.true
    const tradeResult = await shop.trade('tester', 'stone_trade', 2)
    expect(tradeResult.times).to.equal(2)
    const craftResult = await shop.craft('tester', 'fortune_machine', 1)
    expect(craftResult.craftId).to.equal('fortune_machine')
    const failResult = await shop.buy('tester', 'missing')
    expect(failResult.success).to.be.false
  })
})

describe('Gateway orchestration', () => {
  it('manages rooms, players, and shop/database commands', async () => {
    class FakeGame {
      static MULTI_PLAYER = 'multi'
      static SINGLE_PLAYER = 'single'
      constructor(players) {
        this.players = new Map(players.map((p) => [p.playerName, { name: p.playerName }]))
        this.eliminatedPlayers = []
        this.isRunning = false
      }
      run() { this.isRunning = true }
      is_running() { return this.isRunning }
      handle_player_input(playerName, action) { this.lastInput = { playerName, action }; return true }
      broadcast_state(io) { this.broadcasted = true }
      eliminate_player(name) { this.eliminatedPlayers.push(name) }
      stop() { this.stopped = true }
      updatePlayerRates(name, rates, effects) { this.rates = { name, rates, effects } }
    }

    const ioStub = {
      emitted: [],
      sockets: { sockets: new Map() },
      to(room) {
        return {
          emit: (event, payload) => {
            this.emitted.push({ room, event, payload })
          }
        }
      }
    }

    const dbStub = {
      async insert_user() { return true },
      async get_rates_by_player_name() { return [{ dirt_probability: 70, stone_probability: 20, iron_probability: 5, diamond_probability: 5 }] },
      async get_user_by_player_name() { return [{ id: 1, player_name: 'tester', dirt_owned: 10, stone_owned: 5, iron_owned: 3, diamond_owned: 1, emeralds: 0, dirt_collected: 1, stone_collected: 1, iron_collected: 1, diamond_collected: 1, time_played: 0, game_played: 0, game_won: 0, singleplayer_game_played: 0 }] },
      async get_inventory_by_player_name() { return [{ item_name: 'spawn_boost', current_count: 1, max_count: 5 }] },
      async get_all_users() { return [{ id: 1, player_name: 'tester' }] },
      async get_history_by_player_name() { return { success: true, history: [] } },
      async update_rates_by_player_name() { return { success: true } },
      async update_inventory() { return { success: true, user: { id: 1 }, inventory: [] } }
    }

    const shopStub = {
      async getPlayerEffects() { return { effects: { lineBonus: {} }, spawnRates: [70, 20, 5, 5] } },
      async getSpawnCaps() { return { dirt: 10 } },
      async buy() { return { success: true, user: {}, inventory: [] } },
      async trade() { return { success: true, user: {}, inventory: [], times: 1 } },
      async craft() { return { success: true, user: {}, inventory: [], times: 1 } }
    }

    const { Gateway } = proxyquire('../backend/classes/Gateway.js', {
      './Game.js': { Game: FakeGame },
      './Piece.js': { Piece: class {} }
    })

    const gateway = new Gateway(ioStub, dbStub, shopStub)
    const hostSocket = makeSocket('host')
    const guestSocket = makeSocket('guest')
    ioStub.sockets.sockets.set(hostSocket.id, hostSocket)
    ioStub.sockets.sockets.set(guestSocket.id, guestSocket)

    const hostJoin = await gateway.join_room(hostSocket, { room: 'alpha', playerName: 'Host', gamemode: 'PvP' })
    expect(hostJoin.data.success).to.be.true
    const guestJoin = await gateway.join_room(guestSocket, { room: 'alpha', playerName: 'Guest' })
    expect(guestJoin.data.host).to.be.false
    expect((await gateway.player_kick(hostSocket, { roomName: 'alpha', playerToKick: 'Guest' })).data.success).to.be.true
    await gateway.join_room(guestSocket, { room: 'alpha', playerName: 'Guest' })
    await gateway.start_game(hostSocket, {})
    const keyResult = await gateway.handle_key_press(hostSocket, { key: 'ArrowLeft' })
    expect(keyResult.data.success).to.be.true
    expect((await gateway.handle_key_press(hostSocket, { key: 'X' })).data.error).to.match(/Unsupported/)
    await gateway.update_room_settings(hostSocket, { roomName: 'alpha', gamemode: 'co-op', player_limit: 4 })
    await gateway.get_room_settings(hostSocket, { roomName: 'alpha' })
    await gateway.leave_room(hostSocket, {})
    await gateway.leave_room(hostSocket, {})
    await gateway.room_list(hostSocket, {})
    await gateway.subscribe_lobby(hostSocket)
    await gateway.unsubscribe_lobby(hostSocket)
    await gateway.insert_user(hostSocket, { playerName: 'Tester' })
    await gateway.get_user_by_player_name(hostSocket, { playerName: 'Tester' })
    await gateway.get_all_users(hostSocket, {})
    await gateway.get_rates_by_player_name(hostSocket, { playerName: 'Tester' })
    await gateway.update_rates_by_player_name(hostSocket, { playerName: 'Tester', dirt_probability: 70, stone_probability: 20, iron_probability: 5, diamond_probability: 5 })
    await gateway.update_inventory(hostSocket, { playerName: 'Tester', resources: { dirt: 1 }, items: { bonus: 1 } })
    await gateway.shop_buy(hostSocket, { playerName: 'Tester', itemId: 'spawn_boost' })
    await gateway.shop_trade(hostSocket, { playerName: 'Tester', tradeId: 'stone_trade', times: 2 })
    await gateway.shop_craft(hostSocket, { playerName: 'Tester', craftId: 'fortune_machine' })
    await gateway.get_history_by_player_name(hostSocket, { playerName: 'Tester' })
    await gateway.disconnect(hostSocket, 'test')
    expect(ioStub.emitted.length).to.be.greaterThan(0)
  })
})

function makeSocket(id) {
  return {
    id,
    listeners: {},
    emits: [],
    rooms: new Set(),
    on(event, handler) {
      this.listeners[event] = handler
    },
    emit(type, payload) {
      this.emits.push({ type, payload })
    },
    join(room) {
      this.rooms.add(room)
    },
    leave(room) {
      this.rooms.delete(room)
    }
  }
}
