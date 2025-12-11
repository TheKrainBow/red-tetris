import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import { getLocalStorageItem } from '../utils/storage'
import { navigate } from '../utils/navigation'
import socketClient from '../utils/socketClient'
import { getResourceIcon, getResourceName, formatNumber } from '../utils/shopLogic'

const USERNAME_KEY = 'username'

function formatDate(iso) {
  try {
    const d = new Date(iso)
    // e.g., Feb 11, 2025 10:53 AM
    const date = d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `${date} ${time}`
  } catch (e) {
    return iso
  }
}

function formatModeLabel(mode) {
  const raw = String(mode || '').toLowerCase()
  if (raw.includes('single')) return 'Singleplayer'
  if (raw.includes('coop')) return 'Cooperation'
  return 'PvP'
}

function modeClass(mode) {
  const key = formatModeLabel(mode)
    .toLowerCase()
    .replace(/\s+/g, '-')
  return `mp-mode mp-mode-${key}`
}

export default function Singleplayer() {
  const username = useMemo(() => getLocalStorageItem(USERNAME_KEY, '') || '', [])
  const [selected, setSelected] = useState(null)
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hovered, setHovered] = useState(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const [showModal, setShowModal] = useState(false)
  const [modalGame, setModalGame] = useState(null)
  const [modalPlayer, setModalPlayer] = useState(null)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const rootRef = useRef(null)

  const selectedGame = games.find(g => g.id === selected) || null
  const hoveredGame = games.find(g => g.id === hovered) || null

  useEffect(() => {
    let mounted = true
    const fetchHistory = async () => {
      if (!username) return
      setLoading(true)
      setError('')
      try {
        const res = await socketClient.fetchPlayerHistory(username)
        const body = res?.data ?? res
        const entries = Array.isArray(body?.history) ? body.history : []
        const mapped = entries.map((row, idx) => {
          const startedAt = row.started_at || row.startedAt || row.created_at
          const endedAt = row.ended_at || row.endedAt
          const ts = endedAt || startedAt
          const resMap = row.resources || {}
          const resEntry = (() => {
            if (!resMap || typeof resMap !== 'object') return null
            const entries = Object.entries(resMap)
            const target = entries.find(([key]) => String(key).toLowerCase() === String(username).toLowerCase())
              || entries.find(([key]) => String(key).toLowerCase().includes(String(username).toLowerCase()))
            return target ? target[1] : null
          })()
          return {
            id: row.id || `game-${idx}`,
            name: row.room_name || row.server_name || 'Game',
            mode: formatModeLabel(row.gamemode || 'Singleplayer'),
            startedAt: ts,
            resources: resEntry || null,
            fullResources: resMap || {},
            boards: row.boards || {},
            players: Array.isArray(row.players) ? row.players : [],
            raw: row,
          }
        }).sort((a, b) => {
          const ta = new Date(a.startedAt || 0).getTime()
          const tb = new Date(b.startedAt || 0).getTime()
          return tb - ta
        })
        if (!mounted) return
        setGames(mapped)
        if (mapped.length) setSelected(mapped[0].id)
      } catch (err) {
        if (!mounted) return
        setError('Failed to load history')
        console.error('Failed to load player history', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchHistory()
    return () => { mounted = false }
  }, [username])

  const onCancel = () => { navigate('/') }
  const onCreate = () => {
    const name = username || getLocalStorageItem(USERNAME_KEY, '') || 'Guest'
    const target = `/${encodeURIComponent(name)}_singleplayer/${encodeURIComponent(name)}`
    navigate(target)
  }
  const onView = () => {
    if (!selectedGame) return
    setModalGame(selectedGame)
    const defaultPlayer = selectedGame.players.find((p) => p?.name)?.name
      || Object.keys(selectedGame.boards || {})[0]
      || username
    setModalPlayer(defaultPlayer || username)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setModalGame(null)
    setModalPlayer(null)
  }

  const renderBoard = (game, playerName) => {
    const snapshot = game?.boards?.[playerName] || {}
    const board = Array.isArray(snapshot.Board) ? snapshot.Board : []
    const grid = board.length ? board : Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => 0))
    const CELL_TEXTURES = {
      1: '/blocks/Dirt.jpg',
      2: '/blocks/Stone.jpeg',
      3: '/blocks/Iron.jpeg',
      4: '/blocks/Diamond.jpg',
      5: '/ui/Dark_Dirt.webp',
    }
    return (
      <div className="game-board" style={{ '--cell': '20px', width: 'auto', height: 'auto', padding: '12px', background: '#111', borderRadius: 10 }}>
        <div className="game-board-grid">
          {grid.map((row, rIdx) => (
            <div key={`row-${rIdx}`} className="game-row">
              {row.map((val, cIdx) => (
                <div
                  key={`cell-${rIdx}-${cIdx}`}
                  className={`game-cell ${val ? 'filled' : ''}`}
                  style={val ? { backgroundImage: `url(${CELL_TEXTURES[val] || '/ui/Dirt.png'})` } : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderPlayerResources = (game, playerName) => {
    const res = game?.fullResources?.[playerName] || { dirt: 0, stone: 0, iron: 0, diamond: 0 }
    return (
      <div className="shop-inventory-section" style={{ marginTop: 10 }}>
        <div className="shop-inventory-heading">Resources</div>
        {['dirt', 'stone', 'iron', 'diamond'].map((r) => (
          <div key={r} className="shop-inventory-entry" style={{ gap: 10 }}>
            <span className="shop-inventory-label">
              <img src={getResourceIcon(r)} alt={getResourceName(r)} className="shop-inventory-icon" />
              {getResourceName(r)}
            </span>
            <span className="shop-inventory-value">{formatNumber(res?.[r] || 0)}</span>
          </div>
        ))}
      </div>
    )
  }

  const modalPlayers = modalGame?.players?.map((p) => p.name).filter(Boolean)
    || Object.keys(modalGame?.boards || {})
  const activePlayer = modalPlayer || modalPlayers?.[0] || username

  return (
    <div className="mp-root" ref={rootRef}>
      {/* Background layers reused from Multiplayer */}
      <div className="mp-layer mp-dark" />
      <div className="mp-layer mp-sep-top" />
      <div className="mp-layer mp-sep-bottom" />
      <div className="mp-layer mp-top" />
      <div className="mp-layer mp-footer-bg" />

      {/* No falling tetrominos on Singleplayer screen */}

      <div className="mp-content">
        <div className="mp-header">
          <h3 className="mp-title">History</h3>
        </div>

        <div className="mp-list-wrap" ref={wrapRef} style={{ position: 'relative' }}>
          <div className="mp-list" ref={listRef}>
            {loading && <div className="mp-row"><div className="mp-name">Loading history...</div></div>}
            {error && !loading && <div className="mp-row"><div className="mp-name">{error}</div></div>}
            {!loading && !games.length && !error && <div className="mp-row"><div className="mp-name">No games yet</div></div>}
            {games.map((g) => (
              <div
                key={g.id}
                className={`mp-row ${selected === g.id ? 'selected' : ''}`}
                onClick={() => setSelected(g.id)}
                onMouseEnter={(e) => {
                  setHovered(g.id)
                  if (wrapRef.current) {
                    const rect = wrapRef.current.getBoundingClientRect()
                    setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                  }
                }}
                onMouseMove={(e) => {
                  if (!hovered) return
                  if (wrapRef.current) {
                    const rect = wrapRef.current.getBoundingClientRect()
                    setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                  }
                }}
                onMouseLeave={() => {
                  setHovered(null)
                }}
              >
                {/* No icon for history entries */}
                <div className="mp-col">
                  <div className="mp-info">
                    <div className="mp-name">{g.name}</div>
                  </div>
                  <div className="mp-meta">
                    {formatDate(g.startedAt)} — <span className={modeClass(g.mode)}>{formatModeLabel(g.mode)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {hoveredGame?.resources && (
          <div
            className="mp-history-tooltip"
            style={{
              position: 'absolute',
              left: hoverPos.x,
              top: hoverPos.y,
              minWidth: '180px',
              background: 'rgba(0,0,0,0.8)',
              color: '#fff',
              padding: '12px 14px',
              borderRadius: '10px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
              zIndex: 20,
              pointerEvents: 'none',
              transform: 'translate(-3px, 100px)',
            }}
          >
            <div className="shop-inventory-section" style={{ marginBottom: 4 }}>
              <div className="shop-inventory-heading">Resources</div>
              {['dirt', 'stone', 'iron', 'diamond'].map((res) => (
                <div key={res} className="shop-inventory-entry" style={{ gap: 10 }}>
                  <span className="shop-inventory-label">
                    <img src={getResourceIcon(res)} alt={getResourceName(res)} className="shop-inventory-icon" />
                    {getResourceName(res)}
                  </span>
                  <span className="shop-inventory-value">{formatNumber(hoveredGame.resources?.[res] ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mp-footer">
          <Button onClick={onView} disabled={!selectedGame} className="ui-btn-wide">View Game</Button>
          <Button onClick={onCreate} className="ui-btn-wide">Create New Game</Button>
          <Button onClick={onCancel} className="ui-btn-wide">Cancel</Button>
        </div>
      </div>

      {showModal && modalGame && (
        <div className="game-modal-backdrop">
          <div
            className="game-modal"
            style={{
              maxWidth: 960,
              width: '92%',
              padding: 20,
              backgroundImage: 'url(/ui/Dark_Dirt.webp)',
              backgroundSize: 'cover',
              color: '#f1f1f1',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            }}
          >
            <div className="game-modal-title" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{modalGame.name} — {formatModeLabel(modalGame.mode)}</span>
              <span style={{ fontSize: '0.95rem', opacity: 0.85 }}>
                Duration: {formatDate(modalGame.startedAt)}
                {modalGame.raw?.ended_at || modalGame.raw?.endedAt ? ` → ${formatDate(modalGame.raw?.ended_at || modalGame.raw?.endedAt)}` : ''}
              </span>
            </div>
            <div
              className="game-modal-body"
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr 250px',
                gap: '20px',
                alignItems: 'start',
                marginTop: 12,
              }}
            >
              <div className="game-card" style={{ padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.45)', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
                <div className="game-roster-heading" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Players</div>
                <div className="game-roster-list">
                  {modalPlayers?.map((p) => (
                    <div
                      key={p}
                      className={`game-roster-row ${activePlayer === p ? 'selected' : ''}`}
                      onClick={() => setModalPlayer(p)}
                      style={{
                        cursor: 'pointer',
                        borderRadius: 8,
                        marginBottom: 6,
                        background: activePlayer === p ? 'rgba(120, 190, 90, 0.2)' : 'rgba(255,255,255,0.03)',
                        border: activePlayer === p ? '1px solid rgba(120, 190, 90, 0.6)' : '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div className="game-roster-left">
                        <div className="game-roster-name">
                          <span className="game-roster-text">{p}</span>
                        </div>
                      </div>
                    </div>
                  )) || <div className="game-roster-empty">No players</div>}
                </div>
              </div>
              <div className="game-card" style={{ padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.45)', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>{activePlayer}</div>
                {renderBoard(modalGame, activePlayer)}
              </div>
              <div className="game-card" style={{ padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.45)', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
                {renderPlayerResources(modalGame, activePlayer)}
              </div>
            </div>
            <div className="game-modal-actions" style={{ marginTop: 16, textAlign: 'right' }}>
              <Button onClick={closeModal}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
