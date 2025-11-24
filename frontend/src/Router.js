import React, { useEffect, useState } from 'react'
import MainMenu from './pages/MainMenu'
import Multiplayer from './pages/Multiplayer'
import Singleplayer from './pages/Singleplayer'
import Login from './pages/Login'
import Shop from './pages/Shop'
import Options from './pages/Options'
import SkyboxBackground from './three/Skybox.jsx'
import UtilityDock from './components/UtilityDock'
import Leaderboard from './pages/Leaderboard'
import CreateServer from './pages/CreateServer'
import Game from './pages/Game'
import { replace } from './utils/navigation'

const USERNAME_KEY = 'username'

const getRoute = () => {
  const path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/'
  if (!path || path === '#') return '/'
  return path
}

const RESERVED_ROUTES = new Set([
  '',
  'login',
  'leaderboard',
  'shop',
  'options',
  'singleplayer',
  'multiplayer',
])

const parseGamePath = (route) => {
  if (!route) return null
  const parts = route.split('/').filter(Boolean)
  if (parts.length >= 2 && !RESERVED_ROUTES.has(parts[0])) {
    return {
      room: decodeURIComponent(parts[0]),
      player: decodeURIComponent(parts[1]),
    }
  }
  return null
}

export default function Router() {
  const [route, setRoute] = useState(getRoute())
  const [gamePath, setGamePath] = useState(parseGamePath(getRoute()))

  useEffect(() => {
    const onPop = () => {
      const next = getRoute()
      setRoute(next)
      setGamePath(parseGamePath(next))
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  useEffect(() => {
    const username = localStorage.getItem(USERNAME_KEY)
    // Guard routes
    if (!username && route !== '/login') {
      replace('/login')
      return
    }
    if (username && route === '/login') {
      replace('/')
    }
  }, [route])

  let page
  if (gamePath) {
    page = <Game room={gamePath.room} player={gamePath.player} />
  } else {
    switch (route) {
      case '/login':
        page = <Login />
        break
      case '/leaderboard':
        page = <Leaderboard />
        break
      case '/shop':
        page = <Shop />
        break
      case '/options':
        page = <Options />
        break
      case '/singleplayer':
        page = <Singleplayer />
        break
      case '/multiplayer':
        page = <Multiplayer />
        break
      case '/multiplayer/create':
        page = <CreateServer />
        break
      case '/':
      default:
        page = <MainMenu />
        break
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Persistent skybox avoids re-mount flicker; hidden on non-main routes */}
      <div style={{ position: 'absolute', inset: 0, opacity: (route === '/' || route === '/options' || route === '/leaderboard') ? 1 : 0, transition: 'opacity 160ms ease', pointerEvents: 'none', zIndex: 0 }}>
        <SkyboxBackground speed={0.02} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {page}
      </div>
      {route !== '/login' && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
          <div style={{ pointerEvents: 'auto' }}>
            <UtilityDock hidden={route === '/login'} />
          </div>
        </div>
      )}
    </div>
  )
}
