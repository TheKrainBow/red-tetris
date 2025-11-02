import React, { useMemo, useState, useEffect } from 'react'
import { loadSkyboxCube } from '../three/Skybox.jsx'
import { getLocalStorageItem } from '../utils/storage'

const USERNAME_KEY = 'username'

const images = [
  '/main_menu/1.21.9_panorama_0.png',
  '/main_menu/1.21.9_panorama_1.png',
  '/main_menu/1.21.9_panorama_2.png',
  '/main_menu/1.21.9_panorama_3.png',
  '/main_menu/1.21.9_panorama_4.png',
  '/main_menu/1.21.9_panorama_5.png',
]

// Testable helpers
export function readUsername() {
  return getLocalStorageItem(USERNAME_KEY, '') || ''
}

export function navToMultiplayer(win = typeof window !== 'undefined' ? window : undefined) {
  if (win && win.location) win.location.hash = '#/multiplayer'
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
        <img className="mm-logo" src="/main_menu/Craftetris.png" alt="Craftetris" />
        <div className="mm-primary">
          <button className="mm-btn">Singleplayer</button>
          <button className="mm-btn" onClick={() => navToMultiplayer(window)}>Multiplayer</button>
          <button className="mm-btn">Trading outpost</button>
        </div>
        <div className="mm-row">
          <button className="mm-btn mm-small" title="Leaderboard">🏆</button>
          <button className="mm-btn mm-btn--narrow">Options...</button>
          <button className="mm-btn mm-btn--narrow">Quit game</button>
        </div>
      </div>

      {/* footer line similar to screenshot */}
      <div className="mm-bottom">
      </div>
    </div>
  )
}
