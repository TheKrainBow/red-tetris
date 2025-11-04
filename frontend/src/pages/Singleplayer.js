import React, { useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import { getLocalStorageItem } from '../utils/storage'

const USERNAME_KEY = 'username'

// Sample local game history entries
// In a future iteration, wire to persisted storage
const sampleHistory = [
  {
    id: 'g1',
    name: 'New Game',
    mode: 'Singleplayer',
    // ISO timestamps for easy formatting
    startedAt: '2025-02-11T10:53:00Z',
  },
  {
    id: 'g2',
    name: 'Practice Session',
    mode: 'PvP',
    startedAt: '2025-03-05T18:21:00Z',
  },
  {
    id: 'g3',
    name: 'Coop Run',
    mode: 'Cooperation',
    startedAt: '2025-03-10T07:12:00Z',
  },
]

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

function modeClass(mode) {
  const key = String(mode || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
  return `mp-mode mp-mode-${key}`
}

export default function Singleplayer() {
  const username = useMemo(() => getLocalStorageItem(USERNAME_KEY, '') || '', [])
  const [selected, setSelected] = useState(null)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const rootRef = useRef(null)

  const games = sampleHistory
  const selectedGame = games.find(g => g.id === selected) || null

  const onCancel = () => { window.location.hash = '#/' }
  const onCreate = () => { alert('Create new game (placeholder)') }
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
          <h3 className="mp-title">Singleplayer</h3>
        </div>

        <div className="mp-list-wrap" ref={wrapRef}>
          <div className="mp-list" ref={listRef}>
            {games.map((g) => (
              <div
                key={g.id}
                className={`mp-row ${selected === g.id ? 'selected' : ''}`}
                onClick={() => setSelected(g.id)}
              >
                {/* No icon for history entries */}
                <div className="mp-col">
                  <div className="mp-info">
                    <div className="mp-name">{g.name}</div>
                  </div>
                  <div className="mp-meta">
                    {formatDate(g.startedAt)} — <span className={modeClass(g.mode)}>{g.mode}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mp-footer">
          <Button onClick={onView} disabled={!selectedGame} className="ui-btn-wide">View Game</Button>
          <Button onClick={onCreate} className="ui-btn-wide">Create New Game</Button>
          <Button onClick={onCancel} className="ui-btn-wide">Cancel</Button>
        </div>
      </div>
    </div>
  )
}
