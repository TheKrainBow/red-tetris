import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import { getLocalStorageItem } from '../utils/storage'
import { navigate } from '../utils/navigation'

const USERNAME_KEY = 'username'
const GAMEMODE_OPTIONS = [
  { label: 'PvP', value: 'multiplayer_pvp' },
  { label: 'Cooperation', value: 'multiplayer_coop' },
  { label: 'Singleplayer', value: 'singleplayer' },
]
const serverValueFromLabel = (label) => {
  const found = GAMEMODE_OPTIONS.find((gm) => gm.label === label)
  return found ? found.value : 'multiplayer_pvp'
}

export default function CreateServer() {
  const username = useMemo(() => getLocalStorageItem(USERNAME_KEY, '') || '', [])
  const rootRef = useRef(null)
  const [serverName, setServerName] = useState('Minecraft Server')
  const [mode, setMode] = useState('PvP')

  const toggleMode = () => {
    setMode((prev) => {
      const idx = GAMEMODE_OPTIONS.findIndex((gm) => gm.label === prev)
      const nextIdx = (idx + 1) % GAMEMODE_OPTIONS.length
      return GAMEMODE_OPTIONS[nextIdx]?.label || 'PvP'
    })
  }

  const onCancel = () => {
    navigate('/multiplayer')
  }

  const onCreate = () => {
    const playerName = username || getLocalStorageItem(USERNAME_KEY, '')
    const roomName = (serverName || '').trim() || 'New Server'
    if (!playerName) {
      alert('Please set a username first.')
      return
    }
    const gmParam = serverValueFromLabel(mode)
    const query = gmParam ? `?gamemode=${encodeURIComponent(gmParam)}` : ''
    navigate(`/${encodeURIComponent(roomName)}/${encodeURIComponent(playerName)}${query}`)
  }

  const modeKey = (() => {
    const val = serverValueFromLabel(mode)
    if (val.includes('single')) return 'singleplayer'
    if (val.includes('coop')) return 'coop'
    return 'pvp'
  })()

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(window.location.search || '')
      const gmParam = params.get('gamemode')
      if (!gmParam) return
      const matched = GAMEMODE_OPTIONS.find((gm) => gm.value === gmParam || gm.label.toLowerCase() === gmParam.toLowerCase())
      if (matched) setMode(matched.label)
    } catch (err) {
      // ignore parse errors
    }
  }, [])

  return (
    <div className="mp-root srv-root" ref={rootRef}>
      <div className="mp-layer mp-dark" />
      <div className="mp-layer mp-sep-top" />
      <div className="mp-layer mp-sep-bottom" />
      <div className="mp-layer mp-top" />
      <div className="mp-layer mp-footer-bg" />

      <div className="mp-content">
        <div className="mp-header">
          <h3 className="mp-title">Create Server</h3>
        </div>

        <div className="mp-list-wrap mp-form-wrap">
          <div className="mp-list">
            <div className="srv-card">
              <div className="srv-field">
                <label className="srv-label" htmlFor="serverName">Server Name</label>
                <input
                  id="serverName"
                  type="text"
                  className="srv-input"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  autoFocus
                />
              </div>

              <button type="button" className="srv-mode-btn" onClick={toggleMode}>
                <span className="srv-mode-label">Gamemode:</span>
                <span className="srv-mode">
                  <span className={`mp-mode mp-mode-${modeKey}`}>{mode}</span>
                </span>
              </button>

              <div className="srv-actions">
                <Button onClick={onCreate} className="ui-btn-narrow">Create Server</Button>
                <Button onClick={onCancel} className="ui-btn-narrow">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
