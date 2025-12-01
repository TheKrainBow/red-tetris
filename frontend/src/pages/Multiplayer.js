import React, { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import FallingField from '../components/FallingField.jsx'
import { navigate } from '../utils/navigation'
import socketClient from '../utils/socketClient'
import { getLocalStorageItem } from '../utils/storage'

const USERNAME_KEY = 'username'
const DOT_FRAMES = ['Ooo', 'oOo', 'ooO', 'oOo']

const formatDuration = (seconds) => {
  const safe = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
const mapRoomsToUi = (rooms = []) => rooms.map((room, idx) => {
  const roomName = room?.room_name || 'Unknown room'
  const players = Array.isArray(room?.players) ? room.players : []
  const playersPlaying = Number.isFinite(room?.players_playing) ? room.players_playing : players.length
  const spectators = Number.isFinite(room?.spectators) ? room.spectators : 0
  const status = room?.game_status || 'WAITING_FOR_PLAYER'
  const isSinglePlayer = /_singleplayer$/i.test(roomName)
  const displayName = roomName.replace(/_singleplayer$/i, ' Singleplayer')
  const modeLabel = (() => {
    if (isSinglePlayer) return 'Singleplayer'
    const gm = String(room?.room_gamemode || '').toLowerCase()
    if (gm.includes('coop')) return 'Cooperation'
    if (gm.includes('pvp') || gm.includes('versus') || gm.includes('multi')) return 'PvP'
    return 'PvP'
  })()
  const modeIconClass = isSinglePlayer
    ? 'bg-green'
    : modeLabel === 'Cooperation'
      ? 'bg-blue'
      : 'bg-red'
  const statusLabel = status === 'PLAYING' ? 'On Going' : 'Waiting'
  const modeClass = isSinglePlayer
    ? 'mp-tag-mode mp-tag-single'
    : modeLabel === 'Cooperation'
      ? 'mp-tag-mode mp-tag-coop'
      : 'mp-tag-mode mp-tag-pvp'
  const statusClass = status === 'PLAYING' ? 'mp-tag-status mp-tag-status-running' : 'mp-tag-status mp-tag-status-waiting'
  const limit = Number.isFinite(room?.player_limit) ? room.player_limit : 16
  const maxPlayers = isSinglePlayer ? 1 : limit
  const baseCount = status === 'PLAYING' ? playersPlaying : players.length
  const playerCount = Math.min(Math.max(baseCount, players.length), maxPlayers)
  const isFull = playerCount >= maxPlayers
  const startTime = Number(room?.starting_time || room?.start_time || room?.startTime || 0) || null
  const initialDuration = startTime ? Math.max(0, Math.floor((Date.now() - startTime) / 1000)) : (room?.game_duration || 0)
  return {
    id: roomName || `room-${idx}`,
    roomName,
    name: displayName,
    iconClass: modeIconClass,
    players,
    playersPlaying,
    spectators,
    status,
    duration: initialDuration,
    startTime,
    isSinglePlayer,
    maxPlayers,
    playerCount,
    isFull,
    modeLabel,
    statusLabel,
    modeClass,
    statusClass,
  }
})

export default function Multiplayer() {
  const [selected, setSelected] = useState(null)
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(false)
  const [dotFrame, setDotFrame] = useState(0)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const rootRef = useRef(null)
  const mountedRef = useRef(true)
  const refreshTimerRef = useRef(null)
  const lobbyUpdateHandlerRef = useRef(() => {})

  const selectedServer = servers.find(s => s.id === selected) || null
  const selectedSpectatorFull = selectedServer && selectedServer.status === 'PLAYING'
    ? ((Number.isFinite(selectedServer.spectators) ? selectedServer.spectators : 0) + (selectedServer.playerCount || 0) >= (selectedServer.maxPlayers || 16))
    : false
  const joinDisabled = !selectedServer || selectedServer.isSinglePlayer || selectedServer.isFull || selectedSpectatorFull
  const joinLabel = selectedServer?.status === 'PLAYING' ? 'Spectate' : 'Join Server'

  const fetchRooms = useCallback(async () => {
    if (!mountedRef.current) return
    setLoading(true)
    try {
      const response = await socketClient.fetchRoomList()
      if (!mountedRef.current) return
      const payload = response?.data || {}
      const list = mapRoomsToUi(payload?.rooms || [])
      setServers(list)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch room list', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => () => {
    mountedRef.current = false
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
  }, [])

  useEffect(() => {
    let mounted = true

    const applyRooms = (payload) => {
      if (!mounted) return
      const list = mapRoomsToUi(payload?.rooms || [])
      setServers(list)
    }

    fetchRooms()
    const offRoomList = socketClient.on('room_list', applyRooms)
    const offRoomListResponse = socketClient.on('room_list_response', applyRooms)
    const offLobbyRooms = socketClient.on('lobby_rooms', applyRooms)

    return () => {
      mounted = false
      offRoomList?.()
      offRoomListResponse?.()
      offLobbyRooms?.()
    }
  }, [fetchRooms])

  useEffect(() => {
    socketClient.subscribeLobby().catch(() => {})
    return () => {
      socketClient.unsubscribeLobby().catch(() => {})
    }
  }, [])

  useEffect(() => {
    lobbyUpdateHandlerRef.current = (roomPayload) => {
      if (!roomPayload || !roomPayload.room_name) return
      setServers((prev) => {
        const mapped = mapRoomsToUi([roomPayload])[0]
        if (!mapped) return prev

        const existingIdx = prev.findIndex((r) => r.roomName === mapped.roomName)
        if (roomPayload.deleted) {
          const filtered = prev.filter((r) => r.roomName !== mapped.roomName)
          return filtered
        }

        if (existingIdx === -1) return [...prev, mapped]
        const next = [...prev]
        next[existingIdx] = mapped
        return next
      })
    }
  }, [])

  useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        fetchRooms()
      }, 200)
    }

    const offPlayerList = socketClient.on('player_list', scheduleRefresh)
    const offGameStart = socketClient.on('game_start', scheduleRefresh)
    const offGameEnd = socketClient.on('game_end', scheduleRefresh)
    const offLobbyUpdate = socketClient.on('lobby_update', (payload) => {
      const handler = lobbyUpdateHandlerRef.current
      const room = payload?.room
      if (room && typeof handler === 'function') {
        handler(room)
      }
    })

    return () => {
      offPlayerList?.()
      offGameStart?.()
      offGameEnd?.()
      offLobbyUpdate?.()
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [fetchRooms])

  useEffect(() => {
    if (selected && !servers.find((s) => s.id === selected)) {
      setSelected(null)
    }
  }, [servers, selected])

  useEffect(() => {
    const id = setInterval(() => {
      setDotFrame((f) => (f + 1) % DOT_FRAMES.length)
    }, 420)
    return () => clearInterval(id)
  }, [])

  const onCancel = () => {
    navigate('/')
  }

  const onCreate = async () => {
    navigate('/multiplayer/create')
  }

  const onJoin = () => {
    if (!selectedServer) return
    const playerName = getLocalStorageItem(USERNAME_KEY, '') || ''
    if (!playerName) {
      // eslint-disable-next-line no-alert
      alert('Set a username before joining a game.')
      navigate('/login')
      return
    }
    const path = `/${encodeURIComponent(selectedServer.roomName)}/${encodeURIComponent(playerName)}`
    navigate(path)
  }

  return (
    <div className="mp-root" ref={rootRef}>
      {/* Background layers */}
      <div className="mp-layer mp-dark" />
      {/* seam shadows on dark background */}
      <div className="mp-layer mp-sep-top" />
      <div className="mp-layer mp-sep-bottom" />
      <div className="mp-layer mp-top" />
      <div className="mp-layer mp-footer-bg" />

      {/* Global falling tetrominos across the dark background */}
      <div className="mp-global-fall">
        <FallingField containerRef={rootRef} />
      </div>

      <div className="mp-content">
        <div className="mp-header">
          <h3 className="mp-title">Play Multiplayer</h3>
        </div>

        <div className="mp-list-wrap" ref={wrapRef}>
          <div className="mp-list" ref={listRef}>
            {loading && servers.length === 0 && (
              <div className="mp-row">
                <div className="mp-col">
                  <div className="mp-info">
                    <div className="mp-name">Loading rooms…</div>
                  </div>
                </div>
              </div>
            )}

            {!loading && servers.length === 0 && (
              <div className="mp-row">
                <div className="mp-col">
                  <div className="mp-info">
                    <div className="mp-name">No rooms available</div>
                  </div>
                  <div className="mp-players">Create one to start playing</div>
                </div>
              </div>
            )}

            {(() => {
              const pvpWaiting = servers.filter((s) => !s.isSinglePlayer && s.status !== 'PLAYING' && s.modeLabel === 'PvP')
              const coopWaiting = servers.filter((s) => !s.isSinglePlayer && s.status !== 'PLAYING' && s.modeLabel === 'Cooperation')
              const ongoingRooms = servers.filter((s) => !s.isSinglePlayer && s.status === 'PLAYING')
              const singlePlayerRooms = servers.filter((s) => s.isSinglePlayer)
              const renderRoom = (s, { showMode = false } = {}) => {
              const baseCount = s.status === 'PLAYING'
                ? (Number.isFinite(s.playersPlaying) ? s.playersPlaying : s.players.length)
                : s.players.length
              const playerCount = Math.min(Math.max(baseCount, s.players.length), s.maxPlayers || 16)
              const countText = `${playerCount}/${s.maxPlayers || 16}`
              const spectatorText = s.status === 'PLAYING' && s.spectators && !s.isSinglePlayer
                ? ` · 👁 ${s.spectators}`
                : ''
              const names = s.players.length ? s.players.join('  •  ') : 'Waiting for players'
              const durationSeconds = s.startTime ? Math.max(0, Math.floor((Date.now() - s.startTime) / 1000)) : s.duration || 0
              const durationLabel = formatDuration(durationSeconds)

              const nameParts = [<span key="name" className="mp-name-primary">{s.name}</span>]
              if (showMode) {
                nameParts.push(<span key="mode" className={s.modeClass}>{s.modeLabel}</span>)
                if (s.status === 'PLAYING') {
                  nameParts.push(<span key="duration" className="mp-duration">{durationLabel}</span>)
                }
                if (s.status !== 'PLAYING') {
                  nameParts.push(<span key="status" className={s.statusClass}>{s.statusLabel}</span>)
                }
              } else {
                nameParts.push(<span key="status" className={s.statusClass}>{s.statusLabel}</span>)
                }
                const nameContent = []
                nameParts.forEach((part, idx) => {
                  if (idx > 0) nameContent.push(<span key={`sep-${idx}`} className="mp-name-sep"> · </span>)
                  nameContent.push(part)
                })

                return (
                  <div
                    key={s.id}
                    className={`mp-row ${selected === s.id ? 'selected' : ''}`}
                    onClick={() => setSelected(s.id)}
                  >
                    <div className={`mp-icon ${s.iconClass || ''}`}>
                      {s.name.trim().slice(0,1)}
                    </div>
                    <div className="mp-col">
                      <div className="mp-info">
                        <div className="mp-name">{nameContent}</div>
                        <div className="mp-count">{countText}{spectatorText}</div>
                      </div>
                      <div className="mp-players">{names}</div>
                    </div>
                  </div>
                )
              }

              return (
                <>
                  {pvpWaiting.length > 0 && (
                    <div key="sep-pvp" className="mp-row mp-row-separator">
                      <div className="mp-col mp-separator-col">
                        <div className="mp-separator-label">
                          <span className="mp-separator-icon mp-sep-icon-pvp" aria-hidden="true" />
                          <span>PvP Games</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {pvpWaiting.map((r) => renderRoom(r))}

                  {coopWaiting.length > 0 && (
                    <div key="sep-coop" className="mp-row mp-row-separator">
                      <div className="mp-col mp-separator-col">
                        <div className="mp-separator-label">
                          <span className="mp-separator-icon mp-sep-icon-coop" aria-hidden="true" />
                          <span>Cooperation Games</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {coopWaiting.map((r) => renderRoom(r))}

                  {singlePlayerRooms.length > 0 && (
                    <div key="sep-single" className="mp-row mp-row-separator">
                      <div className="mp-col mp-separator-col">
                        <div className="mp-separator-label">
                          <span className="mp-separator-icon mp-sep-icon-single" aria-hidden="true" />
                          <span>Singleplayer games</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {singlePlayerRooms.map(renderRoom)}
                  {ongoingRooms.length > 0 && (
                    <div key="sep-ongoing" className="mp-row mp-row-separator">
                      <div className="mp-col mp-separator-col">
                        <div className="mp-separator-label">
                          <span className="mp-separator-icon mp-sep-icon-clock" aria-hidden="true" />
                          <span>Already running games</span>
                        </div>
                        <div className="mp-separator-dots" aria-hidden="true">{DOT_FRAMES[dotFrame]}</div>
                      </div>
                    </div>
                  )}
                  {ongoingRooms.map((r) => renderRoom(r, { showMode: true }))}
                </>
              )
            })()}
          </div>
        </div>

        <div className="mp-footer">
          <Button onClick={onJoin} disabled={joinDisabled} className="ui-btn-wide">{joinLabel}</Button>
          <Button onClick={fetchRooms} disabled={loading} className="ui-btn-wide">Refresh</Button>
          <Button onClick={onCreate} className="ui-btn-wide">Create Server</Button>
          <Button onClick={onCancel} className="ui-btn-wide">Cancel</Button>
        </div>
      </div>
    </div>
  )
}
