import React, { useEffect, useState } from 'react'
import Home from './pages/Home'
import MainMenu from './pages/MainMenu'
import Multiplayer from './pages/Multiplayer'
import Singleplayer from './pages/Singleplayer'
import CreateGame from './pages/CreateGame'
import Login from './pages/Login'
import SkyboxBackground from './three/Skybox.jsx'

const USERNAME_KEY = 'username'

const getRoute = () => {
  const hash = window.location.hash || '#/'
  // normalize
  if (hash === '#') return '/'
  return hash.replace('#', '')
}

export default function Router() {
  const [route, setRoute] = useState(getRoute())

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRoute())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const username = localStorage.getItem(USERNAME_KEY)
    // Guard routes
    if (!username && route !== '/login') {
      window.location.hash = '#/login'
      return
    }
    if (username && route === '/login') {
      window.location.hash = '#/'
    }
  }, [route])

  let page
  switch (route) {
    case '/login':
      page = <Login />
      break
    case '/singleplayer':
      page = <Singleplayer />
      break
    case '/singleplayer/create':
      page = <CreateGame />
      break
    case '/multiplayer':
      page = <Multiplayer />
      break
    case '/':
    default:
      page = <MainMenu />
      break
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Persistent skybox avoids re-mount flicker; hidden on non-main routes */}
      <div style={{ position: 'absolute', inset: 0, opacity: route === '/' ? 1 : 0, transition: 'opacity 160ms ease', pointerEvents: 'none', zIndex: 0 }}>
        <SkyboxBackground speed={0.02} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {page}
      </div>
    </div>
  )
}
