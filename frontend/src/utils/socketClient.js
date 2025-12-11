import { io } from 'socket.io-client'

const env = (typeof process !== 'undefined' && process.env) ? process.env : {}

const EVENT_TYPES = ['player_list', 'room_boards', 'game_start', 'game_end', 'player_kick', 'room_list_response', 'room_list', 'game_history', 'lobby_rooms', 'lobby_update', 'room_settings', 'player_inventory']
const COMMAND_TIMEOUT = 5500
const DEFAULT_SOCKET_PATH = '/socket.io'

const getDefaultUrl = () => {
  if (typeof window === 'undefined') return env.SOCKET_URL || 'http://localhost:8080'
  const forced = window.__WS_URL__ || env.SOCKET_URL
  if (forced) return forced
  const proto = window.location.protocol === 'https:' ? 'https' : 'http'
  const host = window.location.hostname || 'localhost'
  const configuredPort = window.__WS_PORT__ || env.SOCKET_PORT || env.SERVER_PORT

  // If we are served from a standard port (e.g., behind nginx on :80/:443), default to same-origin proxy
  // so the browser hits /socket.io and lets nginx forward to the backend.
  if (!configuredPort && (!window.location.port || window.location.port === '80' || window.location.port === '443')) {
    return `${proto}://${host}`
  }

  const port = configuredPort || 8080
  return `${proto}://${host}:${port}`
}

const createEmitter = () => {
  const listeners = new Map()
  return {
    on(event, handler) {
      const set = listeners.get(event) || new Set()
      set.add(handler)
      listeners.set(event, set)
      return () => this.off(event, handler)
    },
    once(event, handler) {
      const off = this.on(event, (payload) => {
        off()
        handler(payload)
      })
      return off
    },
    off(event, handler) {
      const set = listeners.get(event)
      if (!set) return
      set.delete(handler)
    },
    emit(event, payload) {
      const set = listeners.get(event)
      if (set) {
        for (const handler of set) handler(payload)
      }
      const any = listeners.get('*')
      if (any) {
        for (const handler of any) handler(event, payload)
      }
    },
    clear() {
      listeners.clear()
    },
  }
}

const normalizeEventPayload = (payload) => (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data'))
  ? payload.data
  : payload

export function parseEventPayload(type, payload = {}) {
  const body = normalizeEventPayload(payload)
  switch (type) {
    case 'player_list':
      if (body && typeof body === 'object') {
        // Normalize common shapes:
        // { players: [...] }
        // { player_list: [...] }
        // { data: [...], room: 'abc' }
        const players = Array.isArray(body.players)
          ? body.players
          : Array.isArray(body.player_list)
            ? body.player_list
            : Array.isArray(body.data)
              ? body.data
              : Array.isArray(body)
                ? body
                : []
        return {
          ...body,
          players,
        }
      }
      return Array.isArray(body) ? { players: body } : { players: [] }
    case 'room_boards': {
      const board = Array.isArray(body.Board) ? body.Board : Array.isArray(body.board) ? body.board : []
      const opponents = body.Opponents ?? body.opponents ?? body.opponent
      const currentPiece = body.CurrentPiece || body.currentPiece || {}
      const nextPiece = body.NextPiece || body.nextPiece || {}
      return {
        board,
        player_name: body.player_name || body.playerName || body.player || '',
        // pass opponents through in both cases to preserve shape; consumer can normalize
        ...(opponents !== undefined ? { Opponents: opponents, opponents } : {}),
        currentPiece: {
          pos: currentPiece.Pos || currentPiece.pos || [0, 0],
          shape: currentPiece.Shape || currentPiece.shape || [],
          material: currentPiece.Material || currentPiece.material || 1,
        },
        nextPiece: {
          shape: nextPiece.Shape || nextPiece.shape || [],
        },
      }
    }
    case 'game_start':
      return {
        room_name: body.room_name || body.roomName || '',
        player_list: body.player_list || body.players || [],
        starting_time: body.starting_time || body.start_time || body.timestamp || null,
      }
    case 'game_end':
      return {
        room_name: body.room_name || body.roomName || '',
        winner: body.winner || body.player || '',
      }
    case 'room_list_response':
    case 'room_list':
      return {
        success: body?.success !== false,
        rooms: Array.isArray(body?.rooms) ? body.rooms : [],
      }
    case 'lobby_rooms':
      return {
        rooms: Array.isArray(body?.rooms) ? body.rooms : [],
      }
    case 'lobby_update':
      return {
        ...(body || {}),
        room: body?.room,
      }
    case 'room_settings':
      return {
        ...(body || {}),
        gamemode: body?.gamemode || body?.room_gamemode,
        room_gamemode: body?.gamemode || body?.room_gamemode,
        player_limit: body?.player_limit,
      }
    case 'game_history':
      return Array.isArray(body?.games) ? body.games : body
    default:
      return body
  }
}

class MockTetrisSocket {
  constructor(emitter, options = {}) {
    this.emitter = emitter
    this.latency = options.latency || 150
    this.connected = false
    this.roomName = 'mock-room'
    this.playerName = 'You'
    this.mockPlayers = ['You', 'MockBot']
    this.gamemode = 'Normal'
    this.playerLimit = 16
    this.gameStartTime = null
    this.tickTimer = null
  }

  _wrapCommandResponse(event, data) {
    return { event, data }
  }

  _normalizeGamemode(raw) {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (value.includes('coop')) return 'Coop'
    return 'Normal'
  }

  _normalizeLimit(raw) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return 16
    return Math.min(16, Math.max(1, Math.round(n)))
  }

  connect() {
    this.connected = true
    this.emitter.emit('status', { state: 'connected', transport: 'mock' })
    this._startMockLoop()
    return Promise.resolve({ mock: true })
  }

  disconnect() {
    this.connected = false
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
    this.emitter.emit('status', { state: 'disconnected', transport: 'mock' })
  }

  sendCommand(event, payload = {}) {
    if (!this.connected) this.connect()

    switch (event) {
      case 'join_room': {
        this.roomName = payload.room || payload.roomName || this.roomName
        this.playerName = payload.playerName || payload.player || this.playerName
        this.gamemode = this._normalizeGamemode(payload?.gamemode)
        this.playerLimit = this._normalizeLimit(payload?.player_limit ?? this.playerLimit)
        if (!this.mockPlayers.includes(this.playerName)) this.mockPlayers.unshift(this.playerName)
        this._emit('player_list', [...this.mockPlayers])
        return Promise.resolve(this._wrapCommandResponse('join_room', { success: true, room: this.roomName, playerName: this.playerName, host: true, mock: true, room_gamemode: this.gamemode, player_limit: this.playerLimit }))
      }
      case 'start_game': {
        this.gameStartTime = Date.now()
        this._emit('game_start', { room_name: this.roomName, player_list: [...this.mockPlayers], starting_time: this.gameStartTime })
        return Promise.resolve(this._wrapCommandResponse('start_game', { success: true, room: this.roomName, mock: true }))
      }
      case 'handle_key_press': {
        this._emit('room_boards', this._buildMockBoardState())
        return Promise.resolve(this._wrapCommandResponse('handle_key_press', { success: true, acknowledged: true, mock: true }))
      }
      case 'leave_room': {
        this._emit('player_list', this.mockPlayers.filter((p) => p !== this.playerName))
        return Promise.resolve(this._wrapCommandResponse('leave_room', { success: true, left: this.roomName, mock: true }))
      }
      case 'player_kick': {
        const target = payload.playerToKick || payload.target || payload.player
        const success = Boolean(target && this.mockPlayers.includes(target))
        if (success) {
          this.mockPlayers = this.mockPlayers.filter((p) => p !== target)
          const kickPayload = { success: true, room: this.roomName, player_name: target, kicked_by: this.playerName }
          this._emit('player_kick', kickPayload)
          this._emit('player_list', [...this.mockPlayers])
          return Promise.resolve(this._wrapCommandResponse('player_kick', kickPayload))
        }
        const failure = { success: false }
        this._emit('player_kick', failure)
        return Promise.resolve(this._wrapCommandResponse('player_kick', failure))
      }
      case 'room_list': {
        const duration = this.gameStartTime ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0
        const response = {
          success: true,
          rooms: [
            {
              room_name: this.roomName,
              room_gamemode: this.gamemode,
              game_status: this.gameStartTime ? 'PLAYING' : 'WAITING_FOR_PLAYER',
              players_playing: this.gameStartTime ? Math.max(1, this.mockPlayers.length - 0) : 0,
              spectators: 0,
              game_duration: duration,
              players: [...this.mockPlayers],
              player_limit: this.playerLimit,
            },
          ],
          mock: true,
        }
        this._emit('room_list_response', response)
        return Promise.resolve(this._wrapCommandResponse('room_list', response))
      }
      case 'update_room_settings': {
        this.gamemode = this._normalizeGamemode(payload?.gamemode)
        this.playerLimit = this._normalizeLimit(payload?.player_limit ?? this.playerLimit)
        const res = { success: true, room: this.roomName, gamemode: this.gamemode, room_gamemode: this.gamemode, player_limit: this.playerLimit }
        this._emit('room_settings', res)
        return Promise.resolve(this._wrapCommandResponse('room_settings', res))
      }
      case 'room_settings_get': {
        const res = { success: true, room: this.roomName, gamemode: this.gamemode, room_gamemode: this.gamemode, player_limit: this.playerLimit }
        this._emit('room_settings', res)
        return Promise.resolve(this._wrapCommandResponse('room_settings', res))
      }
      case 'game_history': {
        const games = {
          success: true,
          games: [
            {
              game_date: Date.now() - 60_000,
              game_duration: 120,
              room_name: this.roomName,
              room_gamemode: this.gamemode,
              screenshots: [],
              resources: { wood: 24, stone: 12 },
            },
          ],
          mock: true,
        }
        this._emit('game_history', games)
        return Promise.resolve(this._wrapCommandResponse('game_history', games))
      }
      default:
        return Promise.resolve(this._wrapCommandResponse(event, { mock: true }))
    }
  }

  _startMockLoop() {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = setInterval(() => {
      if (!this.connected) return
      this._emit('room_boards', this._buildMockBoardState())
      if (this.gameStartTime && Math.random() < 0.05) {
        this._emit('game_end', { room_name: this.roomName, winner: this.playerName })
      }
    }, 1200)
  }

  _buildMockBoardState() {
    const rows = 20
    const cols = 10
    const Board = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => (r > rows - 4 && (c + r) % 2 === 0 ? 1 : 0))
    )
    const Spectrums = [Array.from({ length: cols }, (_, i) => 5 + ((i + Math.floor(Date.now() / 1000)) % 3))]
    return {
      Board,
      Spectrums,
      CurrentPiece: {
        Pos: [4, 0],
        Shape: [
          [1, 1],
          [1, 1],
        ],
        Material: 1,
      },
      NextPiece: {
        Shape: [
          [0, 1, 0],
          [1, 1, 1],
        ],
      },
    }
  }

  _emit(type, payload) {
    const parsed = parseEventPayload(type, payload)
    setTimeout(() => {
      this.emitter.emit(type, parsed)
      this.emitter.emit('message', { type, data: parsed, raw: payload })
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('tetris-socket', { detail: { type, data: parsed } }))
      }
    }, this.latency)
  }
}

class TetrisSocketClient {
  constructor(config = {}) {
    this.url = config.url || getDefaultUrl()
    this.path = config.path || DEFAULT_SOCKET_PATH
    this.useMock = Boolean(config.useMock)
    this.emitter = createEmitter()
    this.socket = null
    this.mock = null
    this.connected = false
  }

  connect() {
    if (this.mock) return this.mock.connect()
    if (this.useMock) return this._startMock()
    if (this.socket) return Promise.resolve({ transport: 'socket.io' })
    return this._startSocket()
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    if (this.mock) {
      this.mock.disconnect()
      this.mock = null
    }
    this.connected = false
    this.emitter.emit('status', { state: 'disconnected' })
  }

  on(event, handler) {
    return this.emitter.on(event, handler)
  }

  once(event, handler) {
    return this.emitter.once(event, handler)
  }

  off(event, handler) {
    this.emitter.off(event, handler)
  }

  async sendCommand(event, payload = {}, opts = {}) {
    const normalizeCommandResponse = (command, response) => {
      if (response && typeof response === 'object') {
        const evt = response.event || response.type || command
        if (Object.prototype.hasOwnProperty.call(response, 'data')) {
          return { event: evt, data: response.data, raw: response }
        }
        return { event: evt, data: response, raw: response }
      }
      return { event: command, data: response }
    }

    if (this.mock) return this.mock.sendCommand(event, payload)
    if (!this.socket) await this.connect()
    const timeout = opts.timeout || COMMAND_TIMEOUT
    const expectEvent = opts.expectEvent
    return new Promise((resolve, reject) => {
      let done = false
      const finish = (value) => {
        if (done) return
        done = true
        if (offEvent) offEvent()
        clearTimeout(timer)
        resolve(value)
      }
      const offEvent = expectEvent
        ? this.once(expectEvent, (data) => finish({ ok: true, event: expectEvent, data }))
        : null
      const timer = setTimeout(() => finish({ ok: false, timeout: true }), timeout)
      try {
        this.socket.emit(event, payload, (response) => {
          finish(normalizeCommandResponse(event, response || { ok: true }))
        })
      } catch (err) {
        finish({ ok: false, error: err })
        reject(err)
      }
    })
  }

  joinRoom(roomName, playerName, gamemode) {
    return this.sendCommand('join_room', { room: roomName, roomName, playerName, player: playerName, gamemode })
  }

  startGame(roomName, playerName) {
    return this.sendCommand('start_game', { room: roomName, roomName, playerName, player: playerName }, { expectEvent: 'game_start' })
  }

  sendKeyPress(roomName, playerName, key) {
    return this.sendCommand('handle_key_press', { room: roomName, roomName, playerName, player: playerName, key }, { expectEvent: 'room_boards' })
  }

  leaveRoom(roomName, playerName) {
    return this.sendCommand('leave_room', { room: roomName, roomName, playerName, player: playerName }, { expectEvent: 'player_list' })
  }

  fetchRoomList() {
    return this.sendCommand('room_list', {}, { expectEvent: 'room_list_response' })
  }

  fetchGameHistory(playerName) {
    return this.sendCommand('game_history', { playerName, player: playerName }, { expectEvent: 'game_history' })
  }

  subscribeLobby() {
    return this.sendCommand('subscribe_lobby', {}, { expectEvent: 'lobby_rooms' })
  }

  unsubscribeLobby() {
    return this.sendCommand('unsubscribe_lobby', {})
  }

  kickPlayer(roomName, playerName, playerToKick) {
    return this.sendCommand(
      'player_kick',
      { room: roomName, roomName, playerName, player: playerName, playerToKick, target: playerToKick },
      { expectEvent: 'player_kick' }
    )
  }

  updateRoomSettings(roomName, playerName, settings = {}) {
    return this.sendCommand(
      'update_room_settings',
      { room: roomName, roomName, playerName, player: playerName, ...settings },
      { expectEvent: 'room_settings' }
    )
  }

  fetchRoomSettings(roomName, playerName) {
    return this.sendCommand(
      'room_settings_get',
      { room: roomName, roomName, playerName, player: playerName },
      { expectEvent: 'room_settings' }
    )
  }

  _startSocket() {
    return new Promise((resolve) => {
      this.socket = io(this.url, {
        path: this.path,
        transports: ['websocket', 'polling'],
        autoConnect: true,
      })

      this.socket.on('connect', () => {
        this.connected = true
        this.emitter.emit('status', { state: 'connected', transport: 'socket.io' })
        resolve({ transport: 'socket.io' })
      })

      this.socket.on('connect_error', (err) => {
        this.emitter.emit('status', { state: 'error', error: err })
      })

      this.socket.on('disconnect', (reason) => {
        this.connected = false
        this.emitter.emit('status', { state: 'disconnected', reason })
      })

      EVENT_TYPES.forEach((type) => {
        this.socket.on(type, (payload) => this._handleIncoming(type, payload))
      })

      this.socket.on('message', (payload) => {
        if (payload?.type) this._handleIncoming(payload.type, payload.data ?? payload)
      })

      this.socket.onAny((event, payload) => {
        if (EVENT_TYPES.includes(event)) return
        if (payload && payload.type && EVENT_TYPES.includes(payload.type)) {
          this._handleIncoming(payload.type, payload.data ?? payload)
        } else {
          this._handleIncoming(event, payload)
        }
      })
    })
  }

  _handleIncoming(type, payload) {
    const parsed = parseEventPayload(type, payload)
    this.emitter.emit(type, parsed)
    this.emitter.emit('message', { type, data: parsed, raw: payload })
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tetris-socket', { detail: { type, data: parsed } }))
    }
  }

  _startMock() {
    this.mock = new MockTetrisSocket(this.emitter)
    return this.mock.connect()
  }

  useMockTransport(enable = true) {
    this.disconnect()
    this.useMock = enable
    if (enable) {
      return this._startMock()
    }
    return this._startSocket()
  }

  getStatus() {
    return this.connected ? 'connected' : this.mock ? 'mock' : 'disconnected'
  }
}

const shouldMock = Boolean(
  (typeof window !== 'undefined' && window.__USE_WS_MOCK__) || String(env.MOCK_WEBSOCKET || '').toLowerCase() === 'true'
)

const socketClient = new TetrisSocketClient({
  url: getDefaultUrl(),
  path: DEFAULT_SOCKET_PATH,
  useMock: shouldMock,
})

socketClient.connect().catch(() => {})

if (typeof window !== 'undefined') {
  window.tetrisSocket = socketClient
}

export default socketClient
