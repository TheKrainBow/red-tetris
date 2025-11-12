import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import SpinningCube from '../components/SpinningCube.jsx'
import { getLocalStorageItem } from '../utils/storage'

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
  { key: 'emerald', label: 'Per Emerald', icon: ICONS.Emerald },
  { key: 'dirt_collected', label: 'Per Dirt collected', icon: ICONS.Dirt },
  { key: 'dirt_owned', label: 'Per Dirt owned', icon: ICONS.Dirt },
  { key: 'stone_collected', label: 'Per Stone collected', icon: ICONS.Stone },
  { key: 'stone_owned', label: 'Per Stone Owned', icon: ICONS.Stone },
  { key: 'iron_collected', label: 'Per Iron collected', icon: ICONS.Iron },
  { key: 'iron_owned', label: 'Per Iron Owned', icon: ICONS.Iron },
  { key: 'diamond_collected', label: 'Per Diamond collected', icon: ICONS.Diamond },
  { key: 'diamond_owned', label: 'Per Diamond Owned', icon: ICONS.Diamond },
  { key: 'pvp_wins', label: 'Per PvP Game won', icon: ICONS.Sword },
  { key: 'games_played', label: 'Per Game Played', icon: ICONS.Controller },
  { key: 'time_played', label: 'Per Time Played', icon: ICONS.Clock },
]

// Temporary placeholder data; replace with API integration later
const BASE_USERS = [
  'Alex', 'Steve', 'Creeper', 'Villager', 'Herobrine', 'Skeleton', 'Enderman', 'Spider',
  'Zombie', 'Ghast', 'Slime', 'Wither', 'Piglin', 'Blaze', 'Warden', 'Strider',
  'Bee', 'Goat', 'Drowned', 'Husk', 'Pillager', 'Vindicator', 'Evoker', 'Ravager'
]

function makeSample(metric, username) {
  const seed = metric.length
  // Replace Steve with current username if provided
  const list = BASE_USERS.map(n => (n === 'Steve' && username) ? username : n)
  return list.map((name, idx) => ({
    name,
    value: Math.floor(((idx + 1) * 97 + seed * 53) % 10000),
  }))
    .sort((a, b) => b.value - a.value)
    .map((row, i) => ({ rank: i + 1, ...row }))
}

export default function Leaderboard() {
  const [metric, setMetric] = useState(METRICS[0].key)
  const username = useMemo(() => getLocalStorageItem('username', '') || '', [])
  const [query, setQuery] = useState('')
  const rowsAll = useMemo(() => makeSample(metric, username), [metric, username])
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
              {rows.map((r, idx) => {
                const isMe = username && r.name === username
                const isMatch = query && matches.includes(idx)
                const isActive = query && matches.length > 0 && matches[matchIndex] === idx
                return (
                  <div className={`lb-row${isMe ? ' lb-row-me' : ''}${isMatch ? ' lb-row-match' : ''}${isActive ? ' lb-row-match-active' : ''}`} key={r.rank + r.name} data-index={idx}>
                    <div className="lb-col-rank">{r.rank}</div>
                    <div className="lb-col-name">{r.name}</div>
                    <div className="lb-col-value">
                      {metricIcon ? (
                        <img className="lb-metric-icon lb-metric-icon--sm" src={metricIcon} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                      ) : null}
                      <span>{r.value}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div className="lb-back">
          <Button className="ui-btn-slim" onClick={() => { window.location.hash = '#/' }}>Back</Button>
        </div>
      </div>
    </div>
  )
}
