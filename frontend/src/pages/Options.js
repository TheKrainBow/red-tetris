import React, { useEffect, useState } from 'react'
import Button from '../components/Button'
import { navigate } from '../utils/navigation'

function useLocalNumber(key, def) {
  const [v, setV] = useState(() => {
    try { const n = Number(localStorage.getItem(key)); return Number.isFinite(n) ? n : def } catch (_) { return def }
  })
  useEffect(() => { try { localStorage.setItem(key, String(v)) } catch (_) {} }, [key, v])
  return [v, setV]
}

export default function Options() {
  const [sfx, setSfx] = useLocalNumber('sfx.volume', 0.5)
  const [music, setMusic] = useLocalNumber('music.volume', 0.5)

  useEffect(() => { if (window.setSfxVolume) window.setSfxVolume(sfx) }, [sfx])
  useEffect(() => { if (window.setMusicVolume) window.setMusicVolume(music) }, [music])

  const onBack = () => { navigate('/') }
  const onChangeUsername = () => {
    try { localStorage.removeItem('username') } catch (_) {}
    navigate('/login')
  }
  return (
    <div className="opt-root">
      <div className="opt-panel">
        <h3 className="shop-title">Settings</h3>
        <div className="opt-grid opt-grid-2">
          <div className="opt-cell">
            <div className="opt-slider">
              <input className="opt-range" type="range" min="0" max="1" step="0.01" value={music} onChange={e => setMusic(Number(e.target.value))} />
              <span className="opt-slider-label">Music: {(music*100)|0}%</span>
            </div>
          </div>
          <div className="opt-cell">
            <div className="opt-slider">
              <input className="opt-range" type="range" min="0" max="1" step="0.01" value={sfx} onChange={e => setSfx(Number(e.target.value))} />
              <span className="opt-slider-label">Sound: {(sfx*100)|0}%</span>
            </div>
          </div>

          <div className="opt-cell">
            <Button className="ui-btn-narrow" onClick={onChangeUsername}>Change Username</Button>
          </div>
          <div className="opt-cell">
            <Button className="ui-btn-narrow" disabled>
              <span role="img" aria-label="locked" style={{ marginRight: 6 }}>🔒</span>
              Achievements <span style={{ opacity: 0.7, marginLeft: 6 }}>(Coming soon)</span>
            </Button>
          </div>
        </div>
        <Button className="ui-btn-wide opt-done" onClick={onBack}>Done</Button>
      </div>
    </div>
  )
}
