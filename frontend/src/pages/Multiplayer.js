import React, { useMemo, useState, useRef } from 'react'
import Button from '../components/Button'
import Tetromino, { TetrominoType } from '../components/Tetromino.jsx'
import FallingField from '../components/FallingField.jsx'
import { getLocalStorageItem } from '../utils/storage'
import socketClient from '../utils/socketClient.js'
import { navigate } from '../utils/navigation'

const USERNAME_KEY = 'username'

const sampleServers = [
  {
    id: 'hypixel',
    name: 'Craftetris Server',
    iconClass: 'bg-green',
    players: ['Alex', 'Sam', 'Jamie', 'Taylor'],
    max: 8,
  },
  {
    id: 'mineplex',
    name: 'Mokko',
    iconClass: 'bg-orange',
    players: ['Evan', 'Riley'],
    max: 6,
  },
]

export default function Multiplayer() {
  const username = useMemo(() => getLocalStorageItem(USERNAME_KEY, '') || '', [])
  const [selected, setSelected] = useState(null)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const rootRef = useRef(null)

  const servers = sampleServers
  const selectedServer = servers.find(s => s.id === selected) || null

  const onCancel = () => {
    navigate('/')
  }

  const onCreate = async () => {
    const playerName = username || getLocalStorageItem(USERNAME_KEY, '')
    const roomName = 'Some Serious Game'
    if (!playerName) {
      alert('Please set a username first.')
      return
    }
    try {
      await socketClient.joinRoom(roomName, playerName)
      // TODO: Navigate to lobby/game page when it exists
    } catch (err) {
      console.error('Failed to create/join room', err)
      alert('Failed to create server. Please try again.')
    }
  }

  const onJoin = () => {
    if (!selectedServer) return
    alert(`Joining ${selectedServer.name} (placeholder)`) // wire later
  }

  return (
    <div className="mp-root" ref={rootRef}>
      {/* Background layers */}
      <div className="mp-layer mp-dark" />
      {/* seam shadows on dark background */}
      <div className="mp-layer mp-sep-top" />
      <div className="mp-layer mp-sep-bottom" />
      <div className="mp-layer mp-top" />
      <div className="mp-layer mp-footer-bg" />

      {/* Global falling tetrominos across the dark background */}
      <div className="mp-global-fall">
        <FallingField containerRef={rootRef} />
      </div>

      <div className="mp-content">
        <div className="mp-header">
          <h3 className="mp-title">Play Multiplayer</h3>
        </div>

        <div className="mp-list-wrap" ref={wrapRef}>
          <div className="mp-list" ref={listRef}>
            {servers.map((s) => (
              <div
                key={s.id}
                className={`mp-row ${selected === s.id ? 'selected' : ''}`}
                onClick={() => setSelected(s.id)}
              >
                <div className={`mp-icon ${s.iconClass || ''}`}>
                  {s.name.slice(0,1)}
                </div>
                <div className="mp-col">
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
          <Button onClick={onJoin} disabled={!selectedServer} className="ui-btn-wide">Join Server</Button>
          <Button onClick={onCreate} className="ui-btn-wide">Create Server</Button>
          <Button onClick={onCancel} className="ui-btn-wide">Cancel</Button>
        </div>
      </div>
    </div>
  )
}
