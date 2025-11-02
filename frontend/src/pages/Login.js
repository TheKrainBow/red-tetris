import React, { useState, useEffect } from 'react'

const USERNAME_KEY = 'username'

export default function Login() {
  const [username, setUsername] = useState('')

  useEffect(() => {
    const existing = localStorage.getItem(USERNAME_KEY)
    if (existing && existing.trim().length > 0) {
      window.location.hash = '#/'
    }
  }, [])

  const onSubmit = (e) => {
    e.preventDefault()
    const name = username.trim()
    if (!name) return
    localStorage.setItem(USERNAME_KEY, name)
    window.location.hash = '#/'
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
        <h2>Login</h2>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          autoFocus
        />
        <button type="submit">Continue</button>
      </form>
    </div>
  )
}

