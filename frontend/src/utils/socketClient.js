import { io } from 'socket.io-client'

const env = (typeof process !== 'undefined' && process.env) ? process.env : {}

const EVENT_TYPES = ['player_list', 'room_boards', 'game_start', 'game_end', 'player_kick', 'room_list_response', 'room_list', 'game_history', 'lobby_rooms', 'lobby_update', 'room_settings', 'player_inventory', 'get_history_by_player_name']
const COMMAND_TIMEOUT = 5500
const DEFAULT_SOCKET_PATH = '/socket.io'

const getDefaultUrl = () => {
  if (typeof window === 'undefined') return env.SOCKET_URL || 'http://localhost:8080'
  const forced = window.__WS_URL__ || env.SOCKET_URL
  if (forced) return forced
  const proto = window.location.protocol === 'https:' ? 'https' : 'http'
  const host = window.location.hostname || 'localhost'
  const configuredPort = window.__WS_PORT__ || env.SOCKET_PORT || env.SERVER_PORT

  if (!configuredPort && (!window.location.port || window.location.port === '80' || window.location.port === '443')) {
    return `${proto}://${host}`
  }

  const port = configuredPort || 8080
  return `${proto}://${host}:${port}`
}

const normalizeEventPayload = (payload) => (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'data'))
  ? payload.data
  : payload

const parseEventPayload = (type, payload = {}) => {
  const body = normalizeEventPayload(payload)
  switch (type) {
    case 'player_list':
      const players = Array.isArray(body.players)
        ? body.players
        : Array.isArray(body.player_list)
          ? body.player_list
          : Array.isArray(body.data)
            ? body.data
            : Array.isArray(body)
              ? body
              : []
      return { players }
    case 'room_boards':
      const board = Array.isArray(body.Board) ? body.Board : Array.isArray(body.board) ? body.board : []
      const opponents = body.Opponents ?? body.opponents ?? body.opponent
      const currentPiece = body.CurrentPiece || body.currentPiece || {}
      const nextPiece = body.NextPiece || body.nextPiece || {}
      const fortuneMultiplier = body.fortuneMultiplier ?? body.fortune_multiplier ?? body.fortune ?? null
      return {
        board,
        player_name: body.player_name || body.playerName || body.player || '',
        opponents,
        currentPiece: { pos: currentPiece.Pos || currentPiece.pos || [0, 0], shape: currentPiece.Shape || currentPiece.shape || [], material: currentPiece.Material || currentPiece.material || 1 },
        nextPiece: { shape: nextPiece.Shape || nextPiece.shape || [] },
        fortuneMultiplier
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
      return { success: body?.success !== false, rooms: Array.isArray(body?.rooms) ? body.rooms : [] }
    case 'lobby_rooms':
      return { rooms: Array.isArray(body?.rooms) ? body.rooms : [] }
    case 'lobby_update':
      return { ...body, room: body?.room }
    case 'room_settings':
      return { ...body, gamemode: body?.gamemode || body?.room_gamemode, player_limit: body?.player_limit }
    case 'game_history':
      return Array.isArray(body?.games) ? body.games : body
    case 'get_history_by_player_name':
      return body
    default:
      return body
  }
}

const normalizeCommandResponse = (command, response) => {
  if (response && typeof response === 'object') {
    const evt = response.event || response.type || command
    return { event: evt, data: response.data ?? response, raw: response }
  }
  return { event: command, data: response }
}

const createSocketClient = ({ url = getDefaultUrl(), path = DEFAULT_SOCKET_PATH }) => {
  const socket = io(url, { path, transports: ['websocket', 'polling'], autoConnect: true })

  const emitter = new Map()

  const emit = (event, payload) => {
    const handlers = emitter.get(event) || []
    handlers.forEach(handler => handler(payload))
    const wildcardHandlers = emitter.get('*') || []
    wildcardHandlers.forEach(handler => handler(event, payload))
  }

  const on = (event, handler) => {
    const handlers = emitter.get(event) || []
    handlers.push(handler)
    emitter.set(event, handlers)
  }

  const off = (event, handler) => {
    const handlers = emitter.get(event) || []
    const index = handlers.indexOf(handler)
    if (index > -1) handlers.splice(index, 1)
    emitter.set(event, handlers)
  }

  const once = (event, handler) => {
    const wrapper = (payload) => {
      off(event, wrapper)
      handler(payload)
    }
    on(event, wrapper)
  }

  const handleIncoming = (type, payload) => {
    const parsed = parseEventPayload(type, payload)
    emit(type, parsed)
    emit('message', { type, data: parsed, raw: payload })
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tetris-socket', { detail: { type, data: parsed } }))
    }
  }

  const startSocket = () => new Promise((resolve, reject) => {
    socket.on('connect', () => {
      emit('status', { state: 'connected', transport: 'socket.io' })
      resolve({ transport: 'socket.io' })
    })

    socket.on('connect_error', (err) => emit('status', { state: 'error', error: err }))
    socket.on('disconnect', (reason) => emit('status', { state: 'disconnected', reason }))

    EVENT_TYPES.forEach((type) => {
      socket.on(type, (payload) => handleIncoming(type, payload))
    })

    socket.on('message', (payload) => {
      if (payload?.type) handleIncoming(payload.type, payload.data ?? payload)
    })

    socket.onAny((event, payload) => {
      if (EVENT_TYPES.includes(event)) return
      if (payload && payload.type && EVENT_TYPES.includes(payload.type)) {
        handleIncoming(payload.type, payload.data ?? payload)
      } else {
        handleIncoming(event, payload)
      }
    })
  })

  const connect = () => {
    if (socket.connected) return Promise.resolve({ transport: 'socket.io' })
    return startSocket()
  }

  const disconnect = () => {
    socket.removeAllListeners()
    socket.disconnect()
    emitter.clear()
    emit('status', { state: 'disconnected' })
  }

  const sendCommand = (event, payload = {}, opts = {}) => {
    const timeout = opts.timeout || COMMAND_TIMEOUT
    const expectEvent = opts.expectEvent

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: false, timeout: true }), timeout)
      const finish = (value) => {
        clearTimeout(timer)
        resolve(value)
      }
      const offEvent = expectEvent
        ? once(expectEvent, (data) => finish({ ok: true, event: expectEvent, data }))
        : null

      try {
        socket.emit(event, payload, (response) => {
          finish(normalizeCommandResponse(event, response || { ok: true }))
        })
      } catch (err) {
        finish({ ok: false, error: err })
        reject(err)
      }
    })
  }

  const joinRoom = (roomName, playerName, gamemode) => sendCommand('join_room', { room: roomName, playerName, gamemode })
  const startGame = (roomName, playerName) => sendCommand('start_game', { room: roomName, playerName }, { expectEvent: 'game_start' })
  const sendKeyPress = (roomName, playerName, key) => sendCommand('handle_key_press', { room: roomName, playerName, key }, { expectEvent: 'room_boards' })
  const leaveRoom = (roomName, playerName) => sendCommand('leave_room', { room: roomName, playerName }, { expectEvent: 'player_list' })

  const fetchRoomList = () => sendCommand('room_list', {}, { expectEvent: 'room_list_response' })
  const fetchGameHistory = (playerName) => sendCommand('game_history', { playerName }, { expectEvent: 'game_history' })
  const fetchPlayerHistory = (playerName) => sendCommand('get_history_by_player_name', { playerName }, { expectEvent: 'get_history_by_player_name' })

  const subscribeLobby = () => sendCommand('subscribe_lobby', {}, { expectEvent: 'lobby_rooms' })
  const unsubscribeLobby = () => sendCommand('unsubscribe_lobby', {})

  const kickPlayer = (roomName, playerName, playerToKick) => sendCommand('player_kick', { room: roomName, playerName, playerToKick }, { expectEvent: 'player_kick' })
  const updateRoomSettings = (roomName, playerName, settings = {}) => sendCommand('update_room_settings', { room: roomName, playerName, ...settings }, { expectEvent: 'room_settings' })
  const fetchRoomSettings = (roomName, playerName) => sendCommand('room_settings_get', { room: roomName, playerName }, { expectEvent: 'room_settings' })

  const getStatus = (socket) => socket.connected ? 'connected' : 'disconnected'

  return {
    connect,
    disconnect,
    on,
    once,
    off,
    sendCommand,
    joinRoom,
    startGame,
    sendKeyPress,
    leaveRoom,
    fetchRoomList,
    fetchGameHistory,
    fetchPlayerHistory,
    subscribeLobby,
    unsubscribeLobby,
    kickPlayer,
    updateRoomSettings,
    fetchRoomSettings,
    getStatus,
  }
}

const socketClient = createSocketClient({ url: getDefaultUrl(), path: DEFAULT_SOCKET_PATH })
socketClient.connect().catch(() => {})

if (typeof window !== 'undefined') {
  window.tetrisSocket = socketClient
}

export default socketClient
