import React, { useEffect, useState } from 'react'
import Home from './pages/Home'
import MainMenu from './pages/MainMenu'
import Multiplayer from './pages/Multiplayer'
import Login from './pages/Login'

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

  switch (route) {
    case '/login':
      return <Login />
    case '/multiplayer':
      return <Multiplayer />
    case '/':
    default:
      return <MainMenu />
  }
}
