import React from 'react'

/**
 * Reusable Minecraft-like beveled button.
 * Styles come from public/styles/Button.css
 */
export default function Button({ children, onClick, disabled, className = '', size = 'normal', style }) {
  const classes = ['ui-btn']
  if (size === 'small') classes.push('ui-btn-small')
  if (disabled) classes.push('ui-btn-disabled')
  if (className) classes.push(className)

  return (
    <button
      className={classes.join(' ')}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  )
}

