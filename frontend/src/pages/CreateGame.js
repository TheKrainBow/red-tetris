import React, { useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import SpinningCube from '../components/SpinningCube.jsx'
import { getLocalStorageItem } from '../utils/storage'

const USERNAME_KEY = 'username'

const MATERIALS = [
  { key: 'dirt', name: 'Dirt', max: 1.0, initial: 0.6, texture: '/blocks/Dirt.jpg', tint: 'dirt' },
  { key: 'stone', name: 'Stone', max: 0.5, initial: 0.3, texture: '/blocks/Stone.jpeg', tint: 'stone' },
  { key: 'iron', name: 'Iron', max: 0.2, initial: 0.08, texture: '/blocks/Iron.jpeg', tint: 'iron' },
  { key: 'diamond', name: 'Diamond', max: 0.03, initial: 0.02, texture: '/blocks/Diamond.jpg', tint: 'diamond' },
]

export default function CreateGame() {
  const username = useMemo(() => getLocalStorageItem(USERNAME_KEY, '') || '', [])
  const rootRef = useRef(null)
  const [probs, setProbs] = useState(() => Object.fromEntries(MATERIALS.map(m => [m.key, m.initial])))
  const [autoDistrib, setAutoDistrib] = useState(true)
  const [editingKey, setEditingKey] = useState(null)
  const [draftVal, setDraftVal] = useState('')

  const onCancel = () => { window.location.hash = '#/singleplayer' }
  const onStart = () => {
    alert('Starting game with probabilities: ' + JSON.stringify(probs))
  }

  const round2 = (n) => Math.round(n * 100) / 100
  const MAT_BY_KEY = Object.fromEntries(MATERIALS.map(m => [m.key, m]))

  const balanceToOne = (src, skipKey = null) => {
    const out = { ...src }
    let sum = MATERIALS.reduce((a, m) => a + (out[m.key] || 0), 0)
    // Remove excess starting from lowest
    let excess = round2(sum - 1)
    if (excess > 0) {
      const lowToHigh = ['dirt', 'stone', 'iron', 'diamond'].filter(k => k !== skipKey)
      for (const k of lowToHigh) {
        if (excess <= 0) break
        const cur = out[k] || 0
        const dec = Math.min(cur, excess)
        out[k] = round2(cur - dec)
        excess = round2(excess - dec)
      }
    }
    // Add deficit starting from highest
    sum = MATERIALS.reduce((a, m) => a + (out[m.key] || 0), 0)
    let deficit = round2(1 - sum)
    if (deficit > 0) {
      const highToLow = ['diamond', 'iron', 'stone', 'dirt'].filter(k => k !== skipKey)
      for (const k of highToLow) {
        if (deficit <= 0) break
        const cur = out[k] || 0
        const cap = round2(Math.max(0, MAT_BY_KEY[k].max - cur))
        if (cap <= 0) continue
        const inc = Math.min(cap, deficit)
        out[k] = round2(cur + inc)
        deficit = round2(deficit - inc)
      }
      if (deficit > 0 && skipKey) {
        // Nudge the skipped one if needed to reach 1
        const cur = out[skipKey] || 0
        out[skipKey] = round2(Math.min(MAT_BY_KEY[skipKey].max, cur + deficit))
      }
    }
    return out
  }

  // When adjusting a material, let it move freely up to its max.
  // If sum exceeds 1, remove the excess starting from the lowest resource
  // order: dirt -> stone -> iron -> diamond, skipping the active one.
  const setMaterial = (key, val) => {
    const mat = MAT_BY_KEY[key]
    let target = Math.min(mat.max, Math.max(0, Number(val)))
    setProbs(prev => {
      const next = { ...prev, [key]: round2(target) }
      if (autoDistrib) {
        // EXCESS: sum > 1 => remove from lowest upward (excluding active)
        let sum = MATERIALS.reduce((a, m) => a + (next[m.key] || 0), 0)
        let excess = round2(sum - 1)
        if (excess > 0) {
          const lowToHigh = ['dirt', 'stone', 'iron', 'diamond'].filter(k => k !== key)
          for (const k of lowToHigh) {
            if (excess <= 0) break
            const cur = next[k] || 0
            const dec = Math.min(cur, excess)
            next[k] = round2(cur - dec)
            excess = round2(excess - dec)
          }
        }

        // DEFICIT: sum < 1 => add to highest downward (excluding active)
        sum = MATERIALS.reduce((a, m) => a + (next[m.key] || 0), 0)
        let deficit = round2(1 - sum)
        if (deficit > 0) {
          const highToLow = ['diamond', 'iron', 'stone', 'dirt'].filter(k => k !== key)
          for (const k of highToLow) {
            if (deficit <= 0) break
            const maxK = MAT_BY_KEY[k].max
            const cur = next[k] || 0
            const cap = round2(Math.max(0, maxK - cur))
            if (cap <= 0) continue
            const inc = Math.min(cap, deficit)
            next[k] = round2(cur + inc)
            deficit = round2(deficit - inc)
          }
          // If still deficit and we were reducing the active one, clamp it to keep sum at 1
          if (deficit > 0) {
            const cur = next[key]
            next[key] = round2(Math.min(mat.max, cur + deficit))
          }
        }

        // Final tiny correction to ensure exact 1.00 within step precision
        const finalSum = MATERIALS.reduce((a, m) => a + (next[m.key] || 0), 0)
        const diff = round2(1 - finalSum)
        if (Math.abs(diff) >= 0.01 - 1e-6) {
          next[key] = round2(Math.min(mat.max, Math.max(0, (next[key] || 0) + diff)))
        }
      }
      return next
    })
  }

  const total = MATERIALS.reduce((acc, m) => acc + (probs[m.key] || 0), 0)
  let remaining = 100

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
              return (
                <div key={m.key} className="gc-table">
                  <div className="gc-cell gc-icon"><SpinningCube textureUrl={m.texture} /></div>
                  <div className="gc-cell gc-name">{m.name}</div>
                  <div className="gc-cell gc-max">{m.max}</div>
                  <div className="gc-cell gc-prob">
                    <div className="gc-prob-row">
                      <div className="gc-slider">
                        <div className="gc-cap" style={{ left: `${m.max * 100}%` }} />
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={value}
                          style={{ '--gc-marker': `${m.max * 100}%`, '--gc-value': `${value * 100}%` }}
                          onChange={(e) => setMaterial(m.key, e.target.value)}
                        />
                      </div>
                      <div className="gc-prob-val" onClick={() => { if (!autoDistrib) { setEditingKey(m.key); setDraftVal(value.toFixed(2)) } }}>
                        {editingKey === m.key && !autoDistrib ? (
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={1}
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
                      setProbs(prev => balanceToOne(prev))
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
