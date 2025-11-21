import React from 'react'
import { createRoot } from 'react-dom/client'
import { createLogger } from 'redux-logger'
import thunk from 'redux-thunk'
import { createStore, applyMiddleware } from 'redux'
import { Provider } from 'react-redux'
import { storeStateMiddleWare } from './middleware/storeStateMiddleWare'
import reducer from './reducers'
import Router from './Router'
import { loadSkyboxCube } from './three/Skybox.jsx'
import { ShopStateProvider } from './context/ShopStateContext'
import socketClient from './utils/socketClient'

const initialState = {}

const store = createStore(
  reducer,
  initialState,
  applyMiddleware(thunk, createLogger())
)

// Ensure default volumes exist
try {
  if (localStorage.getItem('sfx.volume') === null) localStorage.setItem('sfx.volume', '0.5')
  if (localStorage.getItem('music.volume') === null) localStorage.setItem('music.volume', '0.5')
} catch (_) {}

// Preload the skybox cube ASAP to avoid flashes when first visiting main menu
// Be defensive in case the import is stubbed and not thenable in some builds
try {
  const pre = loadSkyboxCube()
  if (pre && typeof pre.catch === 'function') pre.catch(() => {})
} catch (_) {}

// Global button click sound + SFX volume persistence
(() => {
  try {
    const clamp01 = (n) => Math.max(0, Math.min(1, Number(n)))
    const getSfxVol = () => {
      const v = Number(localStorage.getItem('sfx.volume'))
      return Number.isFinite(v) ? clamp01(v) : 0.5
    }
    const setSfxVol = (v) => {
      const vol = clamp01(v)
      try { localStorage.setItem('sfx.volume', String(vol)) } catch (_) {}
      btnAudio.volume = vol
    }

    const btnAudio = new Audio('/sounds/button.mp3')
    btnAudio.preload = 'auto'
    btnAudio.volume = getSfxVol()
    const play = () => {
      // refresh volume in case settings changed
      btnAudio.volume = getSfxVol()
      try { btnAudio.currentTime = 0 } catch (_) {}
      const p = btnAudio.play()
      if (p && typeof p.then === 'function') p.catch(() => {})
    }
    document.addEventListener('click', (e) => {
      const el = e.target.closest('button, .ui-btn')
      if (!el) return
      // Ignore disabled buttons
      if (el.matches('[disabled], .ui-btn-disabled')) return
      play()
    }, true)
    // Expose SFX volume setter globally
    window.setSfxVolume = setSfxVol
  } catch (_) {}
})();

// Global background music (random track). Volume stored separately.
;(() => {
  try {
    const tracks = (window.__musicTracks && Array.isArray(window.__musicTracks) && window.__musicTracks.length)
      ? window.__musicTracks
      : [
          '/sounds/music/C418 - Minecraft - Minecraft Volume Alpha.mp3',
          '/sounds/music/C418 - Wet Hands - Minecraft Volume Alpha.mp3',
          '/sounds/music/C418 - Clark - Minecraft Volume Alpha.mp3',
          '/sounds/music/C418 - Sweden - Minecraft Volume Alpha.mp3',
          '/sounds/music/C418 - Key - Minecraft Volume Alpha.mp3',
        ]

    const music = new Audio()
    music.preload = 'auto'
    music.loop = false

    const getVol = () => {
      const v = Number(localStorage.getItem('music.volume'))
      return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5
    }
    const setVol = (v) => {
      const vol = Math.max(0, Math.min(1, Number(v)))
      music.volume = vol
      try { localStorage.setItem('music.volume', String(vol)) } catch (_) {}
    }
    setVol(getVol())

    const playRandom = () => {
      if (!tracks.length) return
      const src = tracks[Math.floor(Math.random() * tracks.length)]
      if (music.src !== src) music.src = src
      try { music.currentTime = 0 } catch (_) {}
      const p = music.play()
      if (p && typeof p.then === 'function') p.catch(() => {})
    }

    // Start on first user interaction to satisfy autoplay policies
    const start = () => { playRandom(); cleanupStarter() }
    const cleanupStarter = () => {
      document.removeEventListener('click', start, true)
      document.removeEventListener('keydown', start, true)
    }
    document.addEventListener('click', start, true)
    document.addEventListener('keydown', start, true)

    // When a track ends, pick another
    music.addEventListener('ended', playRandom)

    // Expose small API for settings
    window.setMusicVolume = setVol
    window.nextMusicTrack = playRandom
  } catch (_) {}
})()

const container = document.getElementById('tetris')
const root = createRoot(container)
root.render(
  <Provider store={store}>
    <ShopStateProvider>
      <Router />
    </ShopStateProvider>
  </Provider>
)
