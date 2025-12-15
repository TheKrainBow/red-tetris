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
  const [showModeInfo, setShowModeInfo] = useState(false)

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

              <div className="srv-mode-row">
                <button type="button" className="srv-mode-btn" onClick={toggleMode}>
                  <span className="srv-mode-label">Gamemode:</span>
                  <span className="srv-mode">
                    <span className={`mp-mode mp-mode-${modeKey}`}>{mode}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="srv-mode-help-btn"
                  onClick={() => setShowModeInfo((v) => !v)}
                  aria-label="Gamemode info"
                >
                  ?
                </button>
              </div>
              {showModeInfo && (
                <div className="srv-mode-modal floating">
                  <div className="srv-mode-section">
                    <div className="srv-mode-title" data-mode="pvp">PvP</div>
                    <div className="srv-mode-desc">
                      Player versus player gamemode. The last one standing wins.
                      Destroying multiple lines in one move will send unbreakable lines to your opponents.
                    </div>
                  </div>
                  <div className="srv-mode-section">
                    <div className="srv-mode-title" data-mode="coop">Coop</div>
                    <div className="srv-mode-desc">
                      Cooperation gamemode. The last one standing wins.
                      Fortune multiplier is shared across the players. The more you are, the better you scale.
                    </div>
                  </div>
                  <div className="srv-mode-section">
                    <div className="srv-mode-title" data-mode="single">Singleplayer</div>
                    <div className="srv-mode-desc">
                      Solo mode. Play alone with your chosen settings.
                    </div>
                  </div>
                </div>
              )}

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
