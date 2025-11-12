import React, { useMemo, useState, useEffect } from 'react'
import Button from '../components/Button'
import { loadSkyboxCube } from '../three/Skybox.jsx'
import { getLocalStorageItem } from '../utils/storage'

const USERNAME_KEY = 'username'

// Testable helpers
export function readUsername() {
  return getLocalStorageItem(USERNAME_KEY, '') || ''
}

export function navToMultiplayer(win = typeof window !== 'undefined' ? window : undefined) {
  if (win && win.location) win.location.hash = '#/multiplayer'
}

export function navToSingleplayer(win = typeof window !== 'undefined' ? window : undefined) {
  if (win && win.location) win.location.hash = '#/singleplayer'
}

export function navToShop(win = typeof window !== 'undefined' ? window : undefined) {
  if (win && win.location) win.location.hash = '#/shop'
}

export function navToLeaderboard(win = typeof window !== 'undefined' ? window : undefined) {
  if (win && win.location) win.location.hash = '#/leaderboard'
}

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
  useEffect(() => attachReady(loadSkyboxCube(), setBgReady), [])

  return (
    <div className="mm-root">

      {/* Skybox is rendered persistently by Router; just overlay here */}
      <div className="mm-overlay" />

      {/* content */}
      <div className={`mm-content ${bgReady ? 'mm-ready' : ''}`}>
        <img className="mm-logo" src="/ui/Craftetris.png" alt="Craftetris" />
        <div className="mm-primary">
          <Button onClick={() => navToSingleplayer(window)}>Singleplayer</Button>
          <Button onClick={() => navToMultiplayer(window)}>Multiplayer</Button>
          <Button onClick={() => navToShop(window)}>
            <span className="btn-inline"><img className="btn-emerald" src="/blocks/EmeraldItem.png" alt="" />Trading outpost</span>
          </Button>
        </div>
        <div className="mm-row">
          <div className="mm-row-center">
            <Button className="ui-btn-narrow" onClick={() => { window.location.hash = '#/options' }}>Options...</Button>
            <Button className="ui-btn-narrow">Quit game</Button>
          </div>
          <Button size="small" className="mm-leader" title="Leaderboard" onClick={() => navToLeaderboard(window)}>🏆</Button>
        </div>
      </div>

      {/* footer line similar to screenshot */}
      <div className="mm-bottom">
      </div>
    </div>
  )
}
