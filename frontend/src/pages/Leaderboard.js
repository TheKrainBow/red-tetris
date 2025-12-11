import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import SpinningCube from '../components/SpinningCube.jsx'
import { getLocalStorageItem } from '../utils/storage'
import { navigate } from '../utils/navigation'
import socketClient from '../utils/socketClient'

const ICONS = {
  Dirt: '/blocks/Dirt.jpg',
  Stone: '/blocks/Stone.jpeg',
  Iron: '/blocks/IronItem.png',
  Diamond: '/blocks/DiamondItem.png',
  Emerald: '/blocks/EmeraldItem.png',
  // Ask to add these (fallback hidden if missing):
  Sword: '/ui/Sword.png',
  Controller: '/ui/Firework.png',
  Clock: '/ui/Clock.gif'
}

const METRICS = [
  { key: 'emeralds', field: 'emeralds', label: 'Per Emerald', icon: ICONS.Emerald },
  { key: 'dirt_collected', field: 'dirt_collected', label: 'Per Dirt collected', icon: ICONS.Dirt },
  { key: 'dirt_owned', field: 'dirt_owned', label: 'Per Dirt owned', icon: ICONS.Dirt },
  { key: 'stone_collected', field: 'stone_collected', label: 'Per Stone collected', icon: ICONS.Stone },
  { key: 'stone_owned', field: 'stone_owned', label: 'Per Stone Owned', icon: ICONS.Stone },
  { key: 'iron_collected', field: 'iron_collected', label: 'Per Iron collected', icon: ICONS.Iron },
  { key: 'iron_owned', field: 'iron_owned', label: 'Per Iron Owned', icon: ICONS.Iron },
  { key: 'diamond_collected', field: 'diamond_collected', label: 'Per Diamond collected', icon: ICONS.Diamond },
  { key: 'diamond_owned', field: 'diamond_owned', label: 'Per Diamond Owned', icon: ICONS.Diamond },
  { key: 'game_won', field: 'game_won', label: 'Per PvP Game won', icon: ICONS.Sword },
  { key: 'game_played', field: 'game_played', label: 'Per Game Played', icon: ICONS.Controller, combine: (u) => (Number(u.game_played) || 0) + (Number(u.singleplayer_game_played) || 0) },
  { key: 'time_played', field: 'time_played', label: 'Per Time Played', icon: ICONS.Clock, formatter: formatDuration },
]

function formatDuration(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = []
  if (days) parts.push(`${days}d`)
  if (hours || parts.length) parts.push(`${hours}h`)
  if (minutes || parts.length) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join('')
}

export default function Leaderboard() {
  const [metric, setMetric] = useState(METRICS[0].key)
  const username = useMemo(() => getLocalStorageItem('username', '') || '', [])
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    socketClient.sendCommand('get_all_users', {})
      .then((res) => {
        if (cancelled) return
        const list = res?.data?.users_list || []
        setUsers(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        if (cancelled) return
        setError('Failed to load leaderboard')
        console.error('[leaderboard] fetch failed', err)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const rowsAll = useMemo(() => {
    const selected = METRICS.find((m) => m.key === metric) || METRICS[0]
    if (!selected) return []
    const field = selected.field || selected.key
    return [...users]
      .map((u) => ({
        name: u.player_name || u.name || '',
        value: selected.combine ? selected.combine(u) : (Number(u[field]) || 0),
        raw: selected.combine ? selected.combine(u) : u[field],
      }))
      .sort((a, b) => b.value - a.value)
      .map((row, idx) => ({ rank: idx + 1, ...row }))
  }, [users, metric])
  const rows = rowsAll
  const tableBodyRef = useRef(null)
  // Matching indices within full rows list
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out = []
    rowsAll.forEach((r, idx) => { if (r.name.toLowerCase().includes(q)) out.push(idx) })
    return out
  }, [rowsAll, query])
  const [matchIndex, setMatchIndex] = useState(0)
  useEffect(() => { setMatchIndex(0) }, [query, metric])

  const scrollToIndex = (idx) => {
    const container = tableBodyRef.current
    if (!container) return
    const el = container.querySelector(`.lb-row[data-index="${idx}"]`)
    if (!el) return
    const top = el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2)
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }
  useEffect(() => {
    if (!query) return
    if (matches.length > 0) {
      scrollToIndex(matches[0])
    } else {
      // No match -> go to top 1
      if (tableBodyRef.current) tableBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [query, matches])
  const selected = METRICS.find(m => m.key === metric) || METRICS[0]

  // Map selected metric to a block texture for rotating cube preview
  const cubeTexture = useMemo(() => {
    if (!selected) return null
    const k = selected.key
    if (k.includes('dirt')) return '/blocks/Dirt.jpg'
    if (k.includes('stone')) return '/blocks/Stone.jpeg'
    if (k.includes('iron')) return '/blocks/Iron.jpeg'
    if (k.includes('diamond')) return '/blocks/Diamond.jpg'
    return null
  }, [selected])
  const metricIcon = useMemo(() => selected?.icon || cubeTexture || null, [selected, cubeTexture])

  // Dropdown open/close and outside click handling
  const [open, setOpen] = useState(false)
  const ddRef = useRef(null)
  useEffect(() => {
    const onDocClick = (e) => {
      if (!ddRef.current) return
      if (!ddRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const getIconForMetric = (m) => {
    if (!m) return null
    if (m.icon) return m.icon
    const k = m.key
    if (k.includes('dirt')) return '/blocks/Dirt.jpg'
    if (k.includes('stone')) return '/blocks/Stone.jpeg'
    if (k.includes('iron')) return '/blocks/Iron.jpeg'
    if (k.includes('diamond')) return '/blocks/Diamond.jpg'
    return null
  }

  return (
    <div className="lb-root">
      <div className="lb-overlay" />
      <div className="lb-content">
        <div className="lb-header">
          <h1 className="lb-title">Leaderboard</h1>
        </div>

        <div className="lb-controls">
          <div className="lb-controls-left">
          <input
            className="lb-search"
            type="text"
            placeholder="Search player..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (matches.length > 0) {
                  const next = (matchIndex + 1) % matches.length
                  setMatchIndex(next)
                  // Scroll to the newly selected match
                  requestAnimationFrame(() => scrollToIndex(matches[next]))
                } else {
                  // No match: go to top1
                  if (tableBodyRef.current) tableBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' })
                }
              }
            }}
          />
          </div>
          <div className="lb-dd" ref={ddRef}>
            <button className="lb-dd-button" type="button" onClick={() => setOpen(v => !v)}>
              {cubeTexture ? (
                <div className="gc-icon lb-cube-inline"><SpinningCube textureUrl={cubeTexture} size={20} scale={0.76} /></div>
              ) : metricIcon ? (
                <img className="lb-metric-icon" src={metricIcon} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : null}
              <span className="lb-dd-label">{selected.label}</span>
              <span className="lb-caret">▾</span>
            </button>
            {open ? (
              <div className="lb-dd-menu">
                {METRICS.map(m => {
                  const icon = getIconForMetric(m)
                  return (
                    <div key={m.key} className={`lb-dd-item${m.key === metric ? ' is-active' : ''}`} onClick={() => { setMetric(m.key); setOpen(false) }}>
                      {icon ? (
                        <img className="lb-metric-icon" src={icon} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                      ) : null}
                      <span>{m.label}</span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lb-body">
          <div className="lb-table">
            <div className="lb-table-head">
              <div className="lb-col-rank">#</div>
              <div className="lb-col-name">Player</div>
              <div className="lb-col-value">
                <span>Value</span>
                {metricIcon ? (
                  <img className="lb-metric-icon lb-metric-icon--sm" src={metricIcon} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                ) : null}
              </div>
            </div>
            <div className="lb-table-body" ref={tableBodyRef}>
              {loading ? <div className="lb-row lb-row-loading">Loading...</div> : null}
              {!loading && error ? <div className="lb-row lb-row-error">{error}</div> : null}
              {!loading && !error && rows.length === 0 ? <div className="lb-row lb-row-empty">No players yet.</div> : null}
              {!loading && !error ? rows.map((r, idx) => {
                const isMe = username && r.name === username
                const isMatch = query && matches.includes(idx)
                const isActive = query && matches.length > 0 && matches[matchIndex] === idx
                const formatted = selected?.formatter ? selected.formatter(r.raw) : r.value
                return (
                  <div className={`lb-row${isMe ? ' lb-row-me' : ''}${isMatch ? ' lb-row-match' : ''}${isActive ? ' lb-row-match-active' : ''}`} key={r.rank + r.name} data-index={idx}>
                    <div className="lb-col-rank">{r.rank}</div>
                    <div className="lb-col-name">{r.name}</div>
                    <div className="lb-col-value">
                      {metricIcon ? (
                        <img className="lb-metric-icon lb-metric-icon--sm" src={metricIcon} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                      ) : null}
                      <span>{formatted}</span>
                    </div>
                  </div>
                )
              }) : null}
            </div>
          </div>
        </div>
        <div className="lb-back">
          <Button className="ui-btn-slim" onClick={() => { navigate('/') }}>Back</Button>
        </div>
      </div>
    </div>
  )
}
