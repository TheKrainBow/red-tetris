import React, { useEffect, useMemo, useRef, useState } from 'react'
import Tetromino, { TetrominoType } from './Tetromino.jsx'

const TYPES = [TetrominoType.I, TetrominoType.O, TetrominoType.T, TetrominoType.S, TetrominoType.Z, TetrominoType.J, TetrominoType.L]

const TEXTURES = [
  { src: '/blocks/Dirt.jpg', w: 0.60 },
  { src: '/blocks/Stone.jpeg', w: 0.30 },
  { src: '/blocks/Iron.jpeg', w: 0.07 },
  { src: '/blocks/Diamond.jpg', w: 0.03 },
]

function pickWeighted(arr) {
  const r = Math.random()
  let acc = 0
  for (const it of arr) { acc += it.w; if (r <= acc) return it }
  return arr[arr.length - 1]
}

export default function FallingField({ side = 'left', containerRef, targetRef }) {
  const [items, setItems] = useState([])
  const lastTime = useRef(0)
  const spawnTimer = useRef(0)

  const bounds = () => {
    const cont = containerRef?.current
    if (!cont) return null
    const c = cont.getBoundingClientRect()
    let leftWidth = 0, rightWidth = 0
    if (targetRef?.current) {
      const t = targetRef.current.getBoundingClientRect()
      leftWidth = Math.max(0, t.left - c.left)
      rightWidth = Math.max(0, c.right - t.right)
    }
    return { width: c.width, height: c.height, leftWidth, rightWidth }
  }

  const createItem = () => {
    const b = bounds()
    if (!b) return
    const size = Math.floor(16 + Math.random() * (28 - 16 + 1))
    const tex = pickWeighted(TEXTURES).src
    const type = TYPES[Math.floor(Math.random() * TYPES.length)]
    const id = Math.random().toString(36).slice(2)
    const rotation = [0, 90, 180, 270][Math.floor(Math.random() * 4)]

    // rough width/height in blocks to ensure we keep inside lane
    const dimsByType = {
      I: { w: 4, h: 1 },
      O: { w: 2, h: 2 },
      T: { w: 3, h: 2 },
      S: { w: 3, h: 2 },
      Z: { w: 3, h: 2 },
      J: { w: 2, h: 3 },
      L: { w: 2, h: 3 },
    }
    const base = dimsByType[type]
    const dims = (rotation === 90 || rotation === 270) ? { w: base.h, h: base.w } : base
    const pxW = dims.w * size

    let x
    if (targetRef?.current) {
      const laneWidth = side === 'left' ? b.leftWidth : b.rightWidth
      const laneStart = side === 'left' ? 0 : (b.width - laneWidth)
      const maxX = Math.max(laneStart, laneStart + laneWidth - pxW)
      const minX = laneStart
      x = laneWidth <= pxW ? minX : (minX + Math.random() * (maxX - minX))
    } else {
      // full width mode across entire container
      const maxX = Math.max(0, b.width - pxW)
      x = Math.random() * maxX
    }

    const speed = 70 * (16 / size) // px/sec: bigger -> slower
    return { id, type, tex, size, x, y: -dims.h * size - 8, speed, rotation, dims }
  }

  const spawn = () => {
    const it = createItem()
    if (!it) return
    setItems(prev => [...prev, it])
  }

  useEffect(() => {
    // Prefill field with items as if they were already falling
    const b = bounds()
    if (b) {
      const avgInterval = 1.2
      const slowest = 40 // px/s (size=28)
      const windowSec = Math.min(30, b.height / slowest + 5)
      const pre = []
      let t = -windowSec + Math.random() * avgInterval
      while (t < 0) {
        const it = createItem()
        if (it) {
          const dt = -t
          const yNow = it.y + it.speed * dt
          if (yNow < b.height) { it.y = yNow; pre.push(it) }
        }
        t += 0.2 + Math.random() * 0.8
      }
      if (pre.length) setItems(pre)
      spawnTimer.current = Math.random() * 1.0
    }
    let raf
    const tick = (t) => {
      const dt = lastTime.current ? (t - lastTime.current) / 1000 : 0
      lastTime.current = t

      // spawn every 0.8-1.6s roughly per side
      spawnTimer.current -= dt
      if (spawnTimer.current <= 0) {
        spawn()
        spawnTimer.current = 0.8 + Math.random() * 0.8
      }

      setItems(prev => prev
        .map(it => ({ ...it, y: it.y + it.speed * dt }))
        .filter(it => {
          const b = bounds(); if (!b) return false
          // Remove only when the piece's top has passed the bottom edge
          return it.y < b.height
        }))

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side])

  return (
    <div className={`mp-fall-lane mp-fall-${side}`} style={{ pointerEvents: 'none' }}>
      {items.map(it => (
        <div
          key={it.id}
          className="mp-fall-item"
          style={{
            position: 'absolute',
            left: it.x,
            top: it.y,
            zIndex: 100 + it.size, // larger ones always above
            filter: `brightness(${0.6 + ((it.size - 16) / (28 - 16)) * 0.4})`,
          }}
        >
          <Tetromino outline={false} type={it.type} size={it.size} texture={it.tex} rotation={it.rotation} />
        </div>
      ))}
    </div>
  )
}
