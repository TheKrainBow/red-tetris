import React, { useMemo, useState, useEffect } from 'react'
import Button from '../components/Button'
import { loadSkyboxCube } from '../three/Skybox.jsx'
import { getLocalStorageItem } from '../utils/storage'
import { navigate } from '../utils/navigation'

const USERNAME_KEY = 'username'
const KICK_NOTICE_KEY = 'kick.notice'

// Testable helpers
export function readUsername() {
  return getLocalStorageItem(USERNAME_KEY, '') || ''
}

export function navToMultiplayer() { navigate('/multiplayer') }
export function navToSingleplayer() { navigate('/singleplayer') }
export function navToShop() { navigate('/shop') }
export function navToLeaderboard() { navigate('/leaderboard') }

export function attachReady(promise, setReady) {
  let mounted = true
  promise
    .then(() => { if (mounted) setReady(true) })
    .catch(() => { if (mounted) setReady(true) })
  return () => { mounted = false }
}

export default function MainMenu() {
  const username = useMemo(() => readUsername(), [])
  const [bgReady, setBgReady] = useState(false)
  const [kickedMessage, setKickedMessage] = useState('')
  useEffect(() => attachReady(loadSkyboxCube(), setBgReady), [])

  useEffect(() => {
    try {
      const msg = localStorage.getItem(KICK_NOTICE_KEY)
      if (msg) setKickedMessage(msg)
    } catch (_) {}
  }, [])

  const dismissKicked = () => {
    setKickedMessage('')
    try { localStorage.removeItem(KICK_NOTICE_KEY) } catch (_) {}
  }

  return (
    <div className="mm-root">

      {/* Skybox is rendered persistently by Router; just overlay here */}
      <div className="mm-overlay" />

      {/* content */}
      <div className={`mm-content ${bgReady ? 'mm-ready' : ''}`}>
        <img className="mm-logo" src="/ui/Craftetris.png" alt="Craftetris" />
        <div className="mm-primary">
          <Button onClick={() => navToSingleplayer()}>Singleplayer</Button>
          <Button onClick={() => navToMultiplayer()}>Multiplayer</Button>
          <Button onClick={() => navToShop()}>
            <span className="btn-inline"><img className="btn-emerald" src="/blocks/EmeraldItem.png" alt="" />Trading outpost</span>
          </Button>
        </div>
        <div className="mm-row">
          <div className="mm-row-center">
            <Button className="ui-btn-narrow" onClick={() => { navigate('/options') }}>Options...</Button>
            <Button className="ui-btn-narrow">Quit game</Button>
          </div>
          <Button size="small" className="mm-leader" title="Leaderboard" onClick={() => navToLeaderboard()}>🏆</Button>
        </div>
      </div>

      {/* footer line similar to screenshot */}
      <div className="mm-bottom">
      </div>

      {kickedMessage ? (
        <div className="game-modal-backdrop">
          <div className="game-modal">
            <div className="game-modal-title">Kicked</div>
            <div className="game-modal-body">{kickedMessage}</div>
            <div className="game-modal-actions">
              <Button onClick={dismissKicked}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
