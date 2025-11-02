import React, { useMemo, useState } from 'react'
import Button from '../components/Button'

const USERNAME_KEY = 'username'

const sampleServers = [
  {
    id: 'hypixel',
    name: 'Craftetris Server',
    iconBg: '#6c3',
    players: ['Alex', 'Sam', 'Jamie', 'Taylor'],
    max: 8,
  },
  {
    id: 'mineplex',
    name: 'Tetris Friends',
    iconBg: '#f90',
    players: ['Evan', 'Riley'],
    max: 6,
  },
]

export default function Multiplayer() {
  const username = useMemo(() => localStorage.getItem(USERNAME_KEY) || '', [])
  const [selected, setSelected] = useState(null)

  const servers = sampleServers
  const selectedServer = servers.find(s => s.id === selected) || null

  const onCancel = () => {
    window.location.hash = '#/'
  }

  const onCreate = () => {
    // Placeholder for create flow
    alert('Create server (placeholder)')
  }

  const onJoin = () => {
    if (!selectedServer) return
    alert(`Joining ${selectedServer.name} (placeholder)`) // wire later
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <style>{`
        /* Background layers */
        :root { --mp-band-h: 160px; }
        .mp-layer { position: absolute; left: 0; right: 0; }
        .mp-dark {
          background-image: url('/Dark_Dirt.webp');
          /* Even closer + sharper */
          background-size: auto 480px;
          background-repeat: repeat;
          background-position: center;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          /* Almost no depth dimming now */
          filter: brightness(1) saturate(1);
          top: 0; bottom: 0; /* full-screen */
        }
        .mp-top, .mp-footer-bg {
          pointer-events: none;
          height: var(--mp-band-h);
          left: 0; right: 0;
          background-image: url('/Light_Dirt.webp');
          /* Bring light texture closer too */
          background-size: auto 420px;
          background-repeat: repeat;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          border-top: 2px solid rgba(0,0,0,1.0);
          border-bottom: 2px solid rgba(0,0,0,1.0);
          z-index: 3;
        }
        .mp-top { top: 0; bottom: auto; background-position: center top; }
        /* Light strip directly behind the button row (bottom band) */
        .mp-footer-bg { bottom: 0; top: auto; background-position: center bottom; }

        .mp-content { position: relative; height: 100%; display: flex; flex-direction: column; }

        /* Header title in top light zone */
        .mp-header { height: 140px; display: flex; align-items: flex-end; justify-content: center; position: relative; z-index: 4; }
        .mp-title { color: #ffffff; margin: 0 0 12px 0; font-size: 20px; text-shadow: 2px 2px 0 #000; }

        /* Dark-bg seam shadows to emphasize transitions */
        .mp-sep-top, .mp-sep-bottom { position: absolute; left: 0; right: 0; pointer-events: none; z-index: 3; }
        .mp-sep-top { top: var(--mp-band-h); height: 35px; background: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0)); }
        .mp-sep-bottom { bottom: var(--mp-band-h); height: 35px; background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0)); }

        /* List area placed over dark bg */
        .mp-list-wrap {
          position: absolute; left: 0; right: 0; top: var(--mp-band-h); bottom: var(--mp-band-h);
          z-index: 1; /* under bands */
          display: flex; justify-content: center; overflow-y: auto; overflow-x: hidden;
        }
        .mp-list {
          width: min(880px, 92vw);
          margin-top: 10px;
          margin-bottom: 10px;
          /* Transparent to let the darker bg show through */
          background: transparent;
          padding: 6px 0;
        }
        .mp-row { display: flex; align-items: center; gap: 14px; padding: 10px 12px; cursor: pointer; }
        .mp-row + .mp-row { border-top: 1px solid rgba(0,0,0,0.5); }
        .mp-row:hover { background: rgba(255,255,255,0.05); }
        .mp-row.selected { outline: 2px solid #c6a200; background: rgba(255,220,120,0.06); }

        .mp-icon {
          width: 48px; height: 48px; border: 1px solid #000; border-radius: 6px;
          box-shadow: inset 1px 1px 0 rgba(255,255,255,0.35), inset -1px -1px 0 rgba(0,0,0,0.55);
          image-rendering: pixelated; flex: 0 0 48px; display: flex; align-items: center; justify-content: center;
          font-weight: 700; color: #111;
        }
        .mp-info { display: flex; align-items: baseline; gap: 12px; flex: 1; }
        .mp-name { color: #fff; font-size: 18px; text-shadow: 2px 2px 0 #000; }
        .mp-count { margin-left: auto; color: #c0ffb4; text-shadow: 2px 2px 0 #000; }
        .mp-players { margin-left: 74px; color: #ddd; font-size: 14px; text-shadow: 2px 2px 0 #000; }

        /* Footer buttons zone in light area */
        .mp-footer {
          position: absolute; left: 0; right: 0; bottom: 0;
          height: var(--mp-band-h);
          display: flex; align-items: center; justify-content: center; gap: 14px;
          z-index: 4;
        }
      `}</style>

      {/* Background layers */}
      <div className="mp-layer mp-dark" />
      {/* seam shadows on dark background */}
      <div className="mp-layer mp-sep-top" />
      <div className="mp-layer mp-sep-bottom" />
      <div className="mp-layer mp-top" />
      <div className="mp-layer mp-footer-bg" />

      <div className="mp-content">
        <div className="mp-header">
          <h3 className="mp-title">Play Multiplayer</h3>
        </div>

        <div className="mp-list-wrap">
          <div className="mp-list">
            {servers.map((s) => (
              <div
                key={s.id}
                className={`mp-row ${selected === s.id ? 'selected' : ''}`}
                onClick={() => setSelected(s.id)}
              >
                <div className="mp-icon" style={{ background: s.iconBg }}>
                  {s.name.slice(0,1)}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="mp-info">
                    <div className="mp-name">{s.name}</div>
                    <div className="mp-count">{`${s.players.length}/${s.max}`}</div>
                  </div>
                  <div className="mp-players">{s.players.join('  •  ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mp-footer">
          <Button onClick={onJoin} disabled={!selectedServer} style={{ minWidth: 240 }}>Join Server</Button>
          <Button onClick={onCreate} style={{ minWidth: 240 }}>Create Server</Button>
          <Button onClick={onCancel} style={{ minWidth: 240 }}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
