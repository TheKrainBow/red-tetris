import React, { useMemo } from 'react'
import SkyboxBackground from '../three/Skybox.jsx'

const USERNAME_KEY = 'username'

const images = [
  '/main_menu/1.21.9_panorama_0.png',
  '/main_menu/1.21.9_panorama_1.png',
  '/main_menu/1.21.9_panorama_2.png',
  '/main_menu/1.21.9_panorama_3.png',
  '/main_menu/1.21.9_panorama_4.png',
  '/main_menu/1.21.9_panorama_5.png',
]

export default function MainMenu() {
  const username = useMemo(() => localStorage.getItem(USERNAME_KEY) || '', [])
  // Fresh skybox: very large cube so faces are far away
  const size = 2000
  const epsilon = 2

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* styles for animation and layout */}
      <style>{`
        @keyframes mm_rotate {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
        .mm-scene { position: absolute; inset: 0; perspective: 1600px; perspective-origin: 50% 50%; }
        .mm-cube { position: absolute; top: 50%; left: 50%; transform: translate3d(-50%, -50%, 0); }
        .mm-rotor { position: relative; width: 100%; height: 100%; transform-origin: 50% 50% 0; transform-style: preserve-3d; animation: mm_rotate 120s linear infinite; }
        .mm-face { position: absolute; backface-visibility: visible; background-size: cover; background-position: center; will-change: transform; }
        .mm-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.14); }
        .mm-content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; text-shadow: 0 2px 2px rgba(0,0,0,0.7); }
        .mm-title { font-size: 42px; margin-bottom: 24px; }
        .mm-btn { min-width: 340px; padding: 10px 14px; margin: 6px 0; border: 2px solid #555; border-radius: 4px; background: linear-gradient(#777, #666); color: #fff; cursor: pointer; box-shadow: inset 0 2px 0 rgba(255,255,255,0.2), 0 3px 0 rgba(0,0,0,0.3); }
        .mm-btn:hover { background: linear-gradient(#888, #777); }
        .mm-row { display: flex; gap: 12px; margin-top: 10px; align-items: center; }
        .mm-small { min-width: auto; width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; font-size: 20px; }
        .mm-bottom { position: absolute; bottom: 6px; left: 8px; right: 8px; display: flex; justify-content: space-between; font-size: 12px; opacity: 0.9; }
      `}</style>

      {/* Three.js skybox behind UI */}
      <SkyboxBackground speed={0.02} />
      <div className="mm-overlay" />

      {/* content */}
      <div className="mm-content">
        <div className="mm-title">Minecraft Tetris</div>
        <button className="mm-btn">Singleplayer</button>
        <button className="mm-btn">Multiplayer</button>
        <button className="mm-btn">Trading outpost</button>
        <div className="mm-row">
          <button className="mm-btn mm-small" title="Leaderboard">🏆</button>
          <button className="mm-btn" style={{ minWidth: 220 }}>Options...</button>
          <button className="mm-btn" style={{ minWidth: 220 }}>Quit game</button>
        </div>
      </div>

      {/* footer line similar to screenshot */}
      <div className="mm-bottom">
        <div>Minecraft 1.21.9</div>
        <div>Copyright Mojang AB. Do not distribute!</div>
      </div>
    </div>
  )
}
