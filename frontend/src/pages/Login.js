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
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'url(/ui/Login_Page.jpeg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }}>
      <form onSubmit={onSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 320,
        padding: 16,
        borderRadius: 8,
        background: 'rgba(0, 0, 0, 0.5)',
        color: '#fff'
      }}>
        <h2>Login</h2>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          autoFocus
          style={{ padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <button type="submit" style={{ padding: 10, borderRadius: 4, border: 'none', background: '#2e7d32', color: '#fff', cursor: 'pointer' }}>Continue</button>
      </form>
    </div>
  )
}
