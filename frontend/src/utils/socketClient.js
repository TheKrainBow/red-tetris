import { io } from 'socket.io-client'

const env = (typeof process !== 'undefined' && process.env) ? process.env : {}

const EVENT_TYPES = ['player_list', 'room_boards', 'game_start', 'game_end', 'room_list_response', 'game_history']
const COMMAND_TIMEOUT = 5500
const DEFAULT_SOCKET_PATH = '/socket.io'

const getDefaultUrl = () => {
  if (typeof window === 'undefined') return env.SOCKET_URL || 'http://localhost:3004'
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

  const port = configuredPort || 3004
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

export function parseEventPayload(type, payload = {}) {
  switch (type) {
    case 'player_list':
      return Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
    case 'room_boards': {
      const board = Array.isArray(payload.Board) ? payload.Board : []
      const spectrums = Array.isArray(payload.Spectrums) ? payload.Spectrums : []
      const currentPiece = payload.CurrentPiece || {}
      const nextPiece = payload.NextPiece || {}
      return {
        board,
        spectrums,
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
        room_name: payload.room_name || payload.roomName || '',
        player_list: payload.player_list || payload.players || [],
        starting_time: payload.starting_time || payload.start_time || payload.timestamp || null,
      }
    case 'game_end':
      return {
        room_name: payload.room_name || payload.roomName || '',
        winner: payload.winner || payload.player || '',
      }
    case 'room_list_response':
      return {
        success: payload.success !== false,
        rooms: Array.isArray(payload.rooms) ? payload.rooms : [],
      }
    case 'game_history':
      return Array.isArray(payload.games) ? payload.games : payload
    default:
      return payload
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
    this.gameStartTime = null
    this.tickTimer = null
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
        if (!this.mockPlayers.includes(this.playerName)) this.mockPlayers.unshift(this.playerName)
        this._emit('player_list', [...this.mockPlayers])
        return Promise.resolve({ success: true, room: this.roomName, playerName: this.playerName, host: true, mock: true })
      }
      case 'start_game': {
        this.gameStartTime = Date.now()
        this._emit('game_start', { room_name: this.roomName, player_list: [...this.mockPlayers], starting_time: this.gameStartTime })
        return Promise.resolve({ success: true, room: this.roomName, mock: true })
      }
      case 'handle_key_press': {
        this._emit('room_boards', this._buildMockBoardState())
        return Promise.resolve({ acknowledged: true, mock: true })
      }
      case 'leave_room': {
        this._emit('player_list', this.mockPlayers.filter((p) => p !== this.playerName))
        return Promise.resolve({ success: true, left: this.roomName, mock: true })
      }
      case 'room_list': {
        const duration = this.gameStartTime ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0
        const response = {
          success: true,
          rooms: [
            {
              room_name: this.roomName,
              room_gamemode: this.mockPlayers.length > 1 ? 'multi' : 'solo',
              game_status: this.gameStartTime ? 'PLAYING' : 'WAITING_FOR_PLAYER',
              players_playing: this.gameStartTime ? Math.max(1, this.mockPlayers.length - 0) : 0,
              spectators: 0,
              game_duration: duration,
              players: [...this.mockPlayers],
            },
          ],
          mock: true,
        }
        this._emit('room_list_response', response)
        return Promise.resolve(response)
      }
      case 'game_history': {
        const games = {
          success: true,
          games: [
            {
              game_date: Date.now() - 60_000,
              game_duration: 120,
              room_name: this.roomName,
              room_gamemode: 'multi',
              screenshots: [],
              resources: { wood: 24, stone: 12 },
            },
          ],
          mock: true,
        }
        this._emit('game_history', games)
        return Promise.resolve(games)
      }
      default:
        return Promise.resolve({ mock: true })
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
          finish(response || { ok: true })
        })
      } catch (err) {
        finish({ ok: false, error: err })
        reject(err)
      }
    })
  }

  joinRoom(roomName, playerName) {
    return this.sendCommand('join_room', { room: roomName, roomName, playerName, player: playerName })
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
