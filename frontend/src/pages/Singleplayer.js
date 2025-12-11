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
  const onView = () => { if (selectedGame) alert(`Viewing ${selectedGame.name} (placeholder)`) }

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
    </div>
  )
}
