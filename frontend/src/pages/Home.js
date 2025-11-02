import React, { useEffect, useState } from 'react'

const USERNAME_KEY = 'username'

export default function Home() {
  const [username, setUsername] = useState('')

  useEffect(() => {
    const name = localStorage.getItem(USERNAME_KEY) || ''
    if (!name) {
      window.location.hash = '#/login'
    } else {
      setUsername(name)
    }
  }, [])

  const logout = () => {
    localStorage.removeItem(USERNAME_KEY)
    window.location.hash = '#/login'
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Welcome{username ? `, ${username}` : ''}</h2>
        <button onClick={logout}>Logout</button>
      </div>
      <p>Let’s build that Tetris! (placeholder)</p>
    </div>
  )
}

