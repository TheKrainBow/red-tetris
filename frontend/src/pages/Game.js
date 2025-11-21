import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../components/Button'
import socketClient from '../utils/socketClient.js'
import { navigate } from '../utils/navigation'
import { useShopState } from '../context/ShopStateContext'

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20

const makeEmptyBoard = () => Array.from({ length: BOARD_HEIGHT }, () => Array.from({ length: BOARD_WIDTH }, () => 0))

const defaultPiece = { shape: [], pos: [0, 0], material: 1 }

const CELL_TEXTURES = {
  1: '/blocks/Dirt.jpg',
  2: '/blocks/Stone.jpeg',
  3: '/blocks/Iron.jpeg',
  4: '/blocks/Diamond.jpg',
}

const DIRT_SOUNDS = [
  '/sounds/dirt/Dirt1.mp3',
  '/sounds/dirt/Dirt2.mp3',
  '/sounds/dirt/Dirt3.mp3',
  '/sounds/dirt/Dirt4.mp3',
  '/sounds/dirt/Dirt5.mp3',
  '/sounds/dirt/Dirt6.mp3',
]

const STONE_SOUNDS = [
  '/sounds/stone/Stone1.ogg',
  '/sounds/stone/Stone2.ogg',
  '/sounds/stone/Stone3.ogg',
  '/sounds/stone/Stone4.ogg',
]

const materialKeyFromVal = (val) => {
  switch (val) {
    case 1: return 'dirt'
    case 2: return 'stone'
    case 3: return 'iron'
    case 4: return 'diamond'
    default: return null
  }
}

const formatTime = (ms) => {
  if (!ms || ms < 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function Game({ room, player }) {
  const [board, setBoard] = useState(makeEmptyBoard)
  const [nextPiece, setNextPiece] = useState([])
  const [currentPiece, setCurrentPiece] = useState(defaultPiece)
  const [fortuneMultiplier, setFortuneMultiplier] = useState(1)
  const [collected, setCollected] = useState({ dirt: 0, stone: 0, iron: 0, diamond: 0 })
  const [startTime, setStartTime] = useState(null)
  const [running, setRunning] = useState(false)
  const [showConfirmLeave, setShowConfirmLeave] = useState(false)
  const [roomJoined, setRoomJoined] = useState(false)
  const [joinError, setJoinError] = useState(null)
  const [now, setNow] = useState(Date.now())

  const prevFullRowsRef = useRef(new Set())
  const totalClearedRef = useRef(0)
  const prevBoardRef = useRef(makeEmptyBoard())
  const hasPrevBoardRef = useRef(false)
  const shardIdRef = useRef(0)
  const [shards, setShards] = useState([])
  const boardRef = useRef(null)
  const suppressShardsRef = useRef(false)
  const prevPieceRef = useRef(defaultPiece)
  const { setInventory } = useShopState()
  const [bonusBadges, setBonusBadges] = useState([])
  const [bonusFlash, setBonusFlash] = useState({ dirt: false, stone: false, iron: false, diamond: false })
  const awardLagMs = 800
  const shardLayerRef = useRef(null)

  const currentCellValue = (rowIdx, colIdx) => {
    const [posX, posY] = currentPiece.pos || [0, 0]
    const relY = rowIdx - posY
    const relX = colIdx - posX
    const curFilled = currentPiece.shape?.[relY]?.[relX]
    return curFilled ? currentPiece.material || 1 : 0
  }

  const ghostCells = useMemo(() => {
    const shape = currentPiece.shape || []
    const [posX, posY] = currentPiece.pos || [0, 0]
    const height = board.length
    const width = board[0]?.length || 0
    if (!shape.length || !width || !height) return new Set()

    const collidesAt = (drop) => {
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (!shape[y][x]) continue
          const gx = posX + x
          const gy = posY + y + drop
          if (gx < 0 || gx >= width || gy >= height) return true
          if (gy >= 0 && board[gy][gx]) return true
        }
      }
      return false
    }

    let drop = 0
    // find the largest drop that doesn't collide
    while (!collidesAt(drop + 1)) {
      drop += 1
    }

    const cells = new Set()
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue
        const gx = posX + x
        const gy = posY + y + drop
        if (gy >= 0 && gy < height && gx >= 0 && gx < width) {
          cells.add(`${gx},${gy}`)
        }
      }
    }
    return cells
  }, [board, currentPiece])

  const playMaterialSound = (material = 1, delayMs = 0) => {
    const clips = material === 1 ? DIRT_SOUNDS : STONE_SOUNDS
    if (!clips.length) return
    setTimeout(() => {
      const src = clips[Math.floor(Math.random() * clips.length)]
      const audio = new Audio(src)
      audio.volume = 0.6
      audio.play().catch(() => {})
    }, delayMs)
  }

  const queueAward = (matKey, amount = 0, delayMs = 0) => {
    if (!matKey || !amount) return
    setTimeout(() => {
      setInventory((prev) => ({
        ...prev,
        [matKey]: (prev[matKey] || 0) + amount,
      }))
      setCollected((prev) => ({
        ...prev,
        [matKey]: prev[matKey] + amount,
      }))
    }, delayMs)
  }

  const getInventoryDest = (materialVal) => {
    const panel = document.querySelector('.utility-panel-inventory')
    if (!panel || panel.offsetParent === null) return null
    const alt =
      materialVal === 1 ? 'Dirt' :
      materialVal === 2 ? 'Stone' :
      materialVal === 3 ? 'Iron' :
      materialVal === 4 ? 'Diamond' : null
    if (!alt) return null
    const img = panel.querySelector(`.shop-inventory-entry img[alt="${alt}"]`)
    const target = img?.closest('.shop-inventory-entry') || img
    if (!target) return null
    const valueEl = target.querySelector('.shop-inventory-value') || target
    const rect = valueEl.getBoundingClientRect()
    return { x: rect.right - rect.width * 0.15, y: rect.top + rect.height / 2 }
  }

  const spawnShard = (cell) => {
    const boardEl = boardRef.current
    if (!boardEl) return
    const rect = boardEl.getBoundingClientRect()
    const cellSize = rect.width / BOARD_WIDTH
    const start = cell.start || {
      x: rect.left + cell.col * cellSize + cellSize / 2,
      y: rect.top + cell.row * cellSize + cellSize / 2,
    }
    const material = cell.val || 1
    const matKey = cell.matKey || materialKeyFromVal(material)
    const invTarget = getInventoryDest(material)
    const invEl = invTarget ? null : document.querySelector('.shop-utility-button img[alt=\"Inventory\"]')
    const invRect = invTarget ? null : invEl?.getBoundingClientRect()
    const dest = invTarget || (invRect ? {
      x: invRect.left + invRect.width / 2,
      y: invRect.top + invRect.height / 2,
    } : null)
    if (!dest) return
    const id = shardIdRef.current++
    const delay = cell.delay || 0
    const awardAmount = cell.awardAmount || 1
    setShards((prev) => [...prev, { id, start, dest, phase: 'start', delay, material, matKey, awardAmount }])
    requestAnimationFrame(() => {
      setShards((prev) => prev.map((s) => (s.id === id ? { ...s, phase: 'accelerate' } : s)))
    })
    setTimeout(() => {
      setShards((prev) => prev.map((s) => (s.id === id ? { ...s, phase: 'done' } : s)))
    }, 650 + delay)
    setTimeout(() => {
      if (matKey && awardAmount) {
        queueAward(matKey, awardAmount, 0)
      }
      setShards((prev) => prev.filter((s) => s.id !== id))
    }, awardLagMs + delay)
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.createElement('div')
    el.className = 'game-shard-layer'
    document.body.appendChild(el)
    shardLayerRef.current = el
    return () => {
      shardLayerRef.current = null
      document.body.removeChild(el)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!room || !player || showConfirmLeave) return
      const key = e.code === 'Space' ? 'Space' : e.key
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', ' '].includes(key)) return
      e.preventDefault()
      if (!running) return
      socketClient.sendKeyPress(room, player, key).catch(() => {})
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [room, player, running, showConfirmLeave])

  useEffect(() => {
    if (!room || !player) return
    socketClient.joinRoom(room, player)
      .then((res) => {
        setRoomJoined(!res?.error)
        setJoinError(res?.error || null)
      })
      .catch((err) => setJoinError(err?.message || 'Failed to join room'))
  }, [room, player])

  useEffect(() => {
    const offBoards = socketClient.on('room_boards', (payload = {}) => {
      const b = Array.isArray(payload.Board) ? payload.Board : payload.board || []
      const cleanBoard = Array.isArray(b) && b.length ? b : makeEmptyBoard()

      const prevBoard = prevBoardRef.current || []
      const addedCells = []
      const clearedLineCells = []
      const height = cleanBoard.length
      const width = cleanBoard[0]?.length || 0
      if (height && width) {
        // track added cells (for sounds)
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            const prevVal = Number(prevBoard?.[r]?.[c] || 0)
            const curVal = Number(cleanBoard?.[r]?.[c] || 0)
            if (prevVal === 0 && curVal !== 0) {
              addedCells.push(curVal)
            }
          }
        }

        // Predict cleared lines using previous board plus previous falling piece
        const prevWithPiece = prevBoard.map((row) => [...row])
        const lastPiece = prevPieceRef.current || defaultPiece
        const [px, py] = lastPiece.pos || [0, 0]
        if (Array.isArray(lastPiece.shape) && lastPiece.shape.length) {
          for (let y = 0; y < lastPiece.shape.length; y++) {
            for (let x = 0; x < lastPiece.shape[y].length; x++) {
              if (!lastPiece.shape[y][x]) continue
              const gx = px + x
              const gy = py + y
              if (gy >= 0 && gy < height && gx >= 0 && gx < width) {
                prevWithPiece[gy][gx] = lastPiece.material || 1
              }
            }
          }
        }
        for (let r = 0; r < height; r++) {
          const row = prevWithPiece[r] || []
          const wasFull = row.length === width && row.every((v) => Number(v) !== 0)
          if (wasFull) {
            for (let c = 0; c < width; c++) {
              clearedLineCells.push({ val: Number(row[c] || 0), row: r, col: c })
            }
          }
        }
      }

      setBoard(cleanBoard)
      setRunning(true)
      setStartTime((prev) => prev || Date.now())

      const next = payload.NextPiece?.Shape || payload.nextPiece?.shape || payload.nextPiece?.Shape || payload.nextPiece || []
      setNextPiece(Array.isArray(next) ? next : [])

      const curPiece = payload.CurrentPiece || payload.currentPiece || {}
      const curShape = Array.isArray(curPiece.shape) ? curPiece.shape : Array.isArray(curPiece.Shape) ? curPiece.Shape : []
      const curPos = Array.isArray(curPiece.pos) ? curPiece.pos : Array.isArray(curPiece.Pos) ? curPiece.Pos : [0, 0]
      const curMaterial = curPiece.material || curPiece.Material || 1
      setCurrentPiece({ shape: curShape, pos: curPos, material: curMaterial })
      prevPieceRef.current = { shape: curShape, pos: curPos, material: curMaterial }

      const fullRows = new Set()
      cleanBoard.forEach((row, idx) => {
        if (Array.isArray(row) && row.length && row.every((v) => Number(v) !== 0)) {
          fullRows.add(idx)
        }
      })
      const previouslyFull = prevFullRowsRef.current
      let cleared = 0
      previouslyFull.forEach((idx) => {
        if (!fullRows.has(idx)) cleared += 1
      })
      if (cleared > 0) {
        totalClearedRef.current += cleared
        setFortuneMultiplier(1 + totalClearedRef.current)
      }
      prevFullRowsRef.current = fullRows

      // Play sounds after counts are updated to reflect the move
      if (!suppressShardsRef.current) {
        addedCells.forEach((mat) => playMaterialSound(mat))
        let delay = 0
        if (!clearedLineCells.length) {
          console.debug('No cleared lines detected; maybe full rows unchanged', {
            hasPrev: hasPrevBoardRef.current,
            width,
            height,
            lastPiece: prevPieceRef.current,
          })
        } else {
          console.debug('Cleared line cells', clearedLineCells)
        }
        const linesCleared = width ? Math.round(clearedLineCells.length / width) : 0
        if (linesCleared > 0) {
          setFortuneMultiplier((fm) => fm + linesCleared * 0.01)
        }
        clearedLineCells.forEach((cell) => {
          delay += 2 + Math.random() * 3 // tiny stagger between destroyed blocks
          playMaterialSound(cell.val, delay)
          spawnShard({ ...cell, delay, awardAmount: 1, matKey: materialKeyFromVal(cell.val) })
        })

        if (clearedLineCells.length) {
          const delta = { dirt: 0, stone: 0, iron: 0, diamond: 0 }
          clearedLineCells.forEach((cell) => {
            switch (cell.val) {
              case 1: delta.dirt += 1; break
              case 2: delta.stone += 1; break
              case 3: delta.iron += 1; break
              case 4: delta.diamond += 1; break
              default: break
            }
          })
          const bonus = {}
          const cellsByMaterial = clearedLineCells.reduce((acc, cell) => {
            const key = cell.val === 1 ? 'dirt' : cell.val === 2 ? 'stone' : cell.val === 3 ? 'iron' : cell.val === 4 ? 'diamond' : null
            if (!key) return acc
            acc[key] = acc[key] || []
            acc[key].push(cell)
            return acc
          }, {})
          const bonusMultiplier = Math.max(0, (fortuneMultiplier || 1) - 1)
          Object.entries(delta).forEach(([key, count]) => {
            bonus[key] = Math.floor(count * bonusMultiplier)
          })

          // spawn bonus shards + badges for fortune multiplier (using cleared cells)
          Object.entries(bonus).forEach(([matKey, extraCount]) => {
            if (!extraCount) return
            const materialVal = matKey === 'dirt' ? 1 : matKey === 'stone' ? 2 : matKey === 'iron' ? 3 : matKey === 'diamond' ? 4 : 1
            const cells = cellsByMaterial[matKey] || []
            const lineRows = Array.from(new Set(cells.map((c) => c.row))).sort((a, b) => a - b)
            const labelRow = lineRows.length
              ? lineRows[Math.floor((lineRows.length - 1) / 2)]
              : (cells[0]?.row ?? 0)

            const shardCount = Math.max(1, Math.min(extraCount, cells.length || 1))
            for (let i = 0; i < shardCount; i++) {
              const baseCell = cells[i % (cells.length || 1)] || { row: 0, col: 0 }
              const perShard = Math.ceil(extraCount / shardCount)
              spawnShard({ val: materialVal, row: baseCell.row, col: baseCell.col, delay: 200 + 4 + Math.random() * 4, awardAmount: perShard, matKey })
            }

            // single aggregated badge
            const id = `${Date.now()}-${matKey}-${extraCount}`
            const iconUrl = CELL_TEXTURES[materialVal]
            const boardRect = boardRef.current?.getBoundingClientRect()
            const cellSize = boardRect ? boardRect.width / BOARD_WIDTH : 26
            const badgePos = boardRect
              ? {
                  left: boardRect.left - cellSize * 1.1,
                  top: boardRect.top + (labelRow + 0.5) * cellSize,
                }
              : { left: window.innerWidth * 0.3, top: 80 }
            setBonusBadges((prev) => [...prev, { id, mat: matKey, icon: iconUrl, amount: extraCount, ...badgePos }])
            setTimeout(() => {
              setBonusBadges((prev) => prev.filter((b) => b.id !== id))
            }, 1200)
            setBonusFlash((prev) => ({ ...prev, [matKey]: true }))
            setTimeout(() => setBonusFlash((prev) => ({ ...prev, [matKey]: false })), 520)
          })
        }
      }

      prevBoardRef.current = cleanBoard
      hasPrevBoardRef.current = true
    })

    const offStart = socketClient.on('game_start', (data = {}) => {
      const t = data.starting_time || data.start_time || Date.now()
      setStartTime(Number(t))
      setRunning(true)
      setCollected({ dirt: 0, stone: 0, iron: 0, diamond: 0 })
      suppressShardsRef.current = false
      prevBoardRef.current = makeEmptyBoard()
      hasPrevBoardRef.current = false
    })
    const offEnd = socketClient.on('game_end', () => {
      setRunning(false)
      suppressShardsRef.current = true
    })

    return () => {
      offBoards && offBoards()
      offStart && offStart()
      offEnd && offEnd()
    }
  }, [])

  const onStartGame = async () => {
    if (!room || !player) return
    try {
      await socketClient.startGame(room, player)
      if (!startTime) setStartTime(Date.now())
      setRunning(true)
    } catch (err) {
      alert('Unable to start game')
      console.error(err)
    }
  }

  const handleLeave = () => {
    if (running) {
      setShowConfirmLeave(true)
      return
    }
    socketClient.leaveRoom(room, player).catch(() => {})
    navigate('/')
  }

  const confirmLeave = () => {
    setShowConfirmLeave(false)
    socketClient.leaveRoom(room, player).catch(() => {})
    navigate('/')
  }

  const cancelLeave = () => setShowConfirmLeave(false)

  const elapsed = startTime ? now - Number(startTime) : 0

  return (
    <div className="game-root">
      <div className="game-layout">
        <div className="game-left">
          {/* Left column: controls and future spectator spectrums */}
          <div className="game-left-stack">
            {/* reserved for spectrums or lobby info */}
          </div>
        </div>

        <div className="game-board">
          <div className="game-grid" ref={boardRef}>
            {board.map((row, rIdx) => (
              <div key={rIdx} className="game-row">
                {row.map((cell, cIdx) => {
                  // Overlay the active piece on top of the board for display only
                  const val = cell || currentCellValue(rIdx, cIdx)
                  const isGhost = !val && ghostCells.has(`${cIdx},${rIdx}`)
                  return (
                    <div
                      key={cIdx}
                      className={`game-cell ${val ? 'filled' : ''} ${isGhost ? 'ghost' : ''}`}
                      style={val ? { backgroundImage: `url(${CELL_TEXTURES[val] || '/ui/Dirt.png'})` } : undefined}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="game-sidebar">
          <div className="game-stat">
            <div className="game-stat-label">Fortune Mult</div>
            <div className="game-stat-value">x{fortuneMultiplier.toFixed(2)}</div>
          </div>

          <div className="game-stat">
            <div className="game-stat-label">Next Piece</div>
            <div className="game-next">
              {nextPiece && Array.isArray(nextPiece) && nextPiece.length ? (
                nextPiece.map((row, rIdx) => (
                  <div key={rIdx} className="game-next-row">
                    {row.map((cell, cIdx) => (
                      <div
                        key={cIdx}
                        className={`game-next-cell ${cell === 1 ? 'filled' : ''}`}
                        style={cell === 1 ? { backgroundImage: `url(${CELL_TEXTURES[1]})` } : undefined}
                      />
                    ))}
                  </div>
                ))
              ) : <div className="game-next-empty">Unknown</div>}
            </div>
          </div>

          <div className="game-stat">
            <div className="game-stat-label">Collected Blocks</div>
            <div className="game-collect">
              <div className={`game-collect-row ${bonusFlash.dirt ? 'bonus-flash' : ''}`}><span>Dirt</span><span>{collected.dirt}</span></div>
              <div className={`game-collect-row ${bonusFlash.stone ? 'bonus-flash' : ''}`}><span>Stone</span><span>{collected.stone}</span></div>
              <div className={`game-collect-row ${bonusFlash.iron ? 'bonus-flash' : ''}`}><span>Iron</span><span>{collected.iron}</span></div>
              <div className={`game-collect-row ${bonusFlash.diamond ? 'bonus-flash' : ''}`}><span>Diamond</span><span>{collected.diamond}</span></div>
            </div>
          </div>

          <div className="game-stat">
            <div className="game-stat-label">Time Elapsed</div>
            <div className="game-stat-value">{formatTime(elapsed)}</div>
          </div>
        </div>
      </div>

      <div className="game-footer">
        <Button onClick={onStartGame} className="ui-btn-wide">Start Game</Button>
        <Button onClick={handleLeave} className="ui-btn-wide">Leave Lobby</Button>
      </div>

      {shardLayerRef.current && createPortal(
        <div aria-hidden="true">
          {bonusBadges.map((b) => (
            <div
              key={b.id}
              className="game-bonus-badge active"
              style={{
                left: `${b.left || 0}px`,
                top: `${b.top || 80}px`,
              }}
            >
              <div className="game-bonus-icon" style={{ backgroundImage: `url(${b.icon})` }} />
              <span>+{b.amount}</span>
            </div>
          ))}
          {shards.map((s) => (
            <div
              key={s.id}
              className={`game-shard ${s.phase === 'accelerate' ? 'accelerate' : ''} ${s.phase === 'done' ? 'done' : ''}`}
              style={{
                left: s.start.x,
                top: s.start.y,
                transitionDelay: `${s.delay || 0}ms`,
                transform: (s.phase === 'accelerate' || s.phase === 'done')
                  ? `translate(${s.dest.x - s.start.x}px, ${s.dest.y - s.start.y}px) scale(0.7)`
                  : 'translate(0,0) scale(1)',
              }}
            />
          ))}
        </div>,
        shardLayerRef.current
      )}

      {showConfirmLeave && (
        <div className="game-modal-backdrop">
          <div className="game-modal">
            <div className="game-modal-title">Leave lobby?</div>
            <div className="game-modal-body">Game is running. Are you sure you want to leave?</div>
            <div className="game-modal-actions">
              <Button onClick={confirmLeave}>Leave</Button>
              <Button onClick={cancelLeave}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
