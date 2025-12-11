import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import SpinningCube from '../components/SpinningCube.jsx'
import { getLocalStorageItem } from '../utils/storage'
import { navigate } from '../utils/navigation'
import {
  SPAWN_MATERIALS,
  adjustSpawnRates,
  balanceSpawnRates,
  sumSpawnRates,
  sanitizeSpawnRates,
} from '../utils/spawnConfig'
import { useShopState } from '../context/ShopStateContext'

const USERNAME_KEY = 'username'

const MATERIALS = SPAWN_MATERIALS

export default function CreateGame() {
  const username = useMemo(() => getLocalStorageItem(USERNAME_KEY, '') || '', [])
  const rootRef = useRef(null)
  const { spawnCaps, spawnRates, persistSpawnRates } = useShopState()
  const [probs, setProbs] = useState(() => sanitizeSpawnRates(spawnRates, spawnCaps))
  const [autoDistrib, setAutoDistrib] = useState(true)
  const [editingKey, setEditingKey] = useState(null)
  const [draftVal, setDraftVal] = useState('')

  const onCancel = () => { navigate('/singleplayer') }
  const onStart = () => {
    alert('Starting game with probabilities: ' + JSON.stringify(probs))
  }
  const setMaterial = (key, val) => {
    setProbs(prev => adjustSpawnRates(prev, spawnCaps, key, val, autoDistrib))
  }

  const total = sumSpawnRates(probs)

  useEffect(() => {
    persistSpawnRates(probs)
  }, [probs])

  useEffect(() => {
    setProbs((prev) => sanitizeSpawnRates(prev, spawnCaps))
  }, [spawnCaps, spawnRates])

  return (
    <div className="mp-root" ref={rootRef}>
      {/* Shared background from Singleplayer */}
      <div className="mp-layer mp-dark" />
      <div className="mp-layer mp-sep-top" />
      <div className="mp-layer mp-sep-bottom" />
      <div className="mp-layer mp-top" />
      <div className="mp-layer mp-footer-bg" />

      <div className="mp-content">
        <div className="mp-header">
          <h3 className="mp-title">Create New Game</h3>
        </div>

        <div className="mp-list-wrap">
          <div className="mp-list">
            <div className="gc-table gc-header">
              <div className="gc-cell gc-icon"></div>
              <div className="gc-cell gc-name">Name</div>
              <div className="gc-cell gc-max">Max probability</div>
              <div className="gc-cell gc-prob">Probability</div>
            </div>
            {MATERIALS.map((m) => {
              const value = Number(probs[m.key] || 0)
              const cap = spawnCaps[m.key] || 0
              return (
                <div key={m.key} className="gc-table">
                  <div className="gc-cell gc-icon"><SpinningCube textureUrl={m.texture} /></div>
                  <div className="gc-cell gc-name">{m.label}</div>
                  <div className="gc-cell gc-max">{cap.toFixed(2)}</div>
                  <div className="gc-cell gc-prob">
                    <div className="gc-prob-row">
                      <div className="gc-slider">
                        <div className="gc-cap" style={{ left: `${cap * 100}%` }} />
                        <input
                          type="range"
                          min={0}
                          max={cap || 0}
                          step={0.01}
                          value={value}
                          style={{ '--gc-marker': `${cap * 100}%`, '--gc-value': `${value * 100}%` }}
                          onChange={(e) => setMaterial(m.key, e.target.value)}
                        />
                      </div>
                      <div className="gc-prob-val" onClick={() => { if (!autoDistrib) { setEditingKey(m.key); setDraftVal(value.toFixed(2)) } }}>
                        {editingKey === m.key && !autoDistrib ? (
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={cap || 0}
                            value={draftVal}
                            autoFocus
                            onChange={(e) => setDraftVal(e.target.value)}
                            onBlur={() => { const v = parseFloat(draftVal); if (!isNaN(v)) setMaterial(m.key, v); setEditingKey(null) }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { const v = parseFloat(draftVal); if (!isNaN(v)) setMaterial(m.key, v); setEditingKey(null) }
                              if (e.key === 'Escape') { setEditingKey(null) }
                            }}
                            style={{ width: 54, textAlign: 'right' }}
                          />
                        ) : (
                          value.toFixed(2)
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Distribution bar: smooth fill with 20 visual sections */}
            <div className="gc-dist-row">
              <div className="gc-dist">
                {(() => {
                  let rem = 100
                  const parts = []
                  for (const m of MATERIALS) {
                    const w = Math.min(rem, Math.max(0, (probs[m.key] || 0) * 100))
                    rem -= w
                    if (w > 0) parts.push(
                      <div key={m.key} className="gc-seg" style={{ width: `${w}%`, backgroundImage: `url(${m.texture})` }} />
                    )
                  }
                  if (rem > 0) parts.push(<div key="empty" className="gc-seg gc-empty" style={{ width: `${rem}%` }} />)
                  return parts
                })()}
              </div>
              <label className="gc-auto">
                <input
                  type="checkbox"
                  checked={autoDistrib}
                  onChange={e => {
                    const checked = e.target.checked
                    setAutoDistrib(checked)
                    if (checked) {
                      setProbs(prev => balanceSpawnRates(prev, spawnCaps))
                    }
                  }}
                />
                Auto distribution
              </label>
            </div>
            <div className="gc-dist-legend">Distribution (sum: {total.toFixed(2)})</div>
          </div>
        </div>

        <div className="mp-footer">
          <Button onClick={onStart} disabled={!autoDistrib && Math.abs(total - 1) > 0.0001} className="ui-btn-wide">Start Game</Button>
          <Button onClick={onCancel} className="ui-btn-wide">Cancel</Button>
        </div>
      </div>
    </div>
  )
}
