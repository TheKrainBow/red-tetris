import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../components/Button'
import socketClient from '../utils/socketClient.js'
import { navigate } from '../utils/navigation'
import { useShopState } from '../context/ShopStateContext'
import { SHOP_ITEMS, CRAFT_ITEMS, formatResourceId } from '../utils/shopData'

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20
const USERNAME_KEY = 'username'

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

const materialValFromKey = (key) => {
  switch (key) {
    case 'dirt': return 1
    case 'stone': return 2
    case 'iron': return 3
    case 'diamond': return 4
    default: return null
  }
}

const MATERIAL_LABELS = {
  dirt: 'Dirt',
  stone: 'Stone',
  iron: 'Iron',
  diamond: 'Diamond',
}

const formatTime = (ms) => {
  if (!ms || ms < 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

const computeStackedEffect = (perLevel, growth, level) => {
  if (!level || level <= 0) return 0
  if (!perLevel) return 0
  if (growth === 1) return perLevel * level
  return perLevel * ((1 - Math.pow(growth, level)) / (1 - growth))
}

const computeFortuneFromUpgrades = (purchases = {}) => {
  let total = 0
  for (const item of SHOP_ITEMS) {
    if (item.effect_type !== 'fortune_multiplier') continue
    const level = purchases[item.id] || 0
    if (!level) continue
    const perLevel = Number(item.effect_per_level) || 0
    const growth = Number(item.effect_growth_multiplier) || 1
    const stacked = computeStackedEffect(perLevel, growth, level)
    total += stacked * 100
  }
  return total
}

const getFortuneEffectPercent = (effects = {}) => {
  if (!effects) return 0
  if (effects.fortune_multiplier_percent != null) {
    return Number(effects.fortune_multiplier_percent) || 0
  }
  if (effects.fortune_multiplier != null) {
    return (Number(effects.fortune_multiplier) || 0) * 100
  }
  return 0
}

const getCraftCount = (craft, inventory, craftCounts) => {
  if (craftCounts && typeof craftCounts[craft.id] === 'number') {
    return craftCounts[craft.id]
  }
  if (!craft?.outputs) return 0
  const [key, amount] = Object.entries(craft.outputs)[0] || []
  if (!key) return 0
  const have = inventory?.[formatResourceId(key)] || 0
  const perCraft = Number(amount) || 1
  if (perCraft <= 0) return 0
  return Math.floor(have / perCraft)
}

const computeFortuneFromCrafts = (craftCounts = {}, inventory) => {
  let total = 0
  for (const craft of CRAFT_ITEMS) {
    const crafted = getCraftCount(craft, inventory, craftCounts)
    if (!crafted) continue
    const bonusPercent = getFortuneEffectPercent(craft.effects)
    if (!bonusPercent) continue
    total += bonusPercent * crafted
  }
  return total
}

export default function Game({ room, player, forceSpectator = false, mockSpectatorData = null }) {
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
  const [opponents, setOpponents] = useState([])
  const [playerRoster, setPlayerRoster] = useState({ room, players: [], counts: {}, game_running: false })
  const [isSpectator, setIsSpectator] = useState(Boolean(forceSpectator))
  const [allBoards, setAllBoards] = useState({})
  const spectrumCellSize = useMemo(() => {
    const count = opponents.length || 1
    if (count <= 4) return 9
    if (count <= 8) return 8
    if (count <= 12) return 7
    return 6
  }, [opponents.length])
  const spectrumRows = useMemo(() => {
    const list = Array.isArray(opponents) ? opponents : []
    const n = list.length
    if (n === 0) return []
    if (n <= 3) return [list]
    if (n === 4) return [list.slice(0, 2), list.slice(2)]
    if (n === 5) return [list.slice(0, 3), list.slice(3)]
    if (n === 6) return [list.slice(0, 3), list.slice(3, 6)]
    const rows = []
    let idx = 0
    const first = Math.min(4, n - idx)
    rows.push(list.slice(idx, idx + first))
    idx += first
    const second = Math.min(4, n - idx)
    rows.push(list.slice(idx, idx + second))
    idx += second
    while (idx < n) {
      const count = Math.min(4, n - idx)
      rows.push(list.slice(idx, idx + count))
      idx += count
    }
    return rows
  }, [opponents])

  const prevFullRowsRef = useRef(new Set())
  const totalClearedRef = useRef(0)
  const prevBoardRef = useRef(makeEmptyBoard())
  const hasPrevBoardRef = useRef(false)
  const shardIdRef = useRef(0)
  const [shards, setShards] = useState([])
  const [spectatorCellSize, setSpectatorCellSize] = useState(18)
  const boardRef = useRef(null)
  const spectatorGridRef = useRef(null)
  const suppressShardsRef = useRef(false)
  const prevPieceRef = useRef(defaultPiece)
  const { setInventory, purchases, craftCounts, inventory } = useShopState()
  const fortuneBaseRef = useRef(1)
  const fortuneRemainderRef = useRef({ dirt: 0, stone: 0, iron: 0, diamond: 0 })
  const [bonusBadges, setBonusBadges] = useState([])
  const [bonusFlash, setBonusFlash] = useState({ dirt: false, stone: false, iron: false, diamond: false })
  const awardLagMs = 800
  const shardLayerRef = useRef(null)
  const [eliminated, setEliminated] = useState(false)
  const [winnerName, setWinnerName] = useState('')
  const [isHost, setIsHost] = useState(false)
  const hasOpponents = opponents && opponents.length > 0
  const gameRunning = Boolean(playerRoster?.game_running)
  const rosterPlayers = useMemo(() => Array.isArray(playerRoster?.players) ? playerRoster.players : [], [playerRoster])
  const rosterBuckets = useMemo(() => {
    const players = rosterPlayers
    return {
      playing: players.filter((p) => (p?.status || '').toLowerCase() === 'playing'),
      eliminated: players.filter((p) => (p?.status || '').toLowerCase() === 'eliminated'),
      spectating: players.filter((p) => (p?.status || '').toLowerCase() === 'spectating'),
      waiting: players.filter((p) => {
        const status = (p?.status || '').toLowerCase()
        return !status || status === 'waiting'
      }),
    }
  }, [rosterPlayers])

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

  const renderRosterSections = (buckets) => {
    const renderSection = (label, list, tag) => {
      if (!list.length) return null
      return (
        <React.Fragment key={`roster-${label}`}>
          <div className="game-roster-heading">{label}</div>
          <div className="game-roster-list">
            {list.map((p, idx) => {
              const status = (p?.status || tag || 'waiting').toLowerCase()
              const isEliminated = status === 'eliminated'
              const key = `${p?.name || 'player'}-${status}-${idx}-${label}`
              const isSelf = (p?.name || '').toLowerCase() === (player || '').toLowerCase()
              return (
                <div className="game-roster-row" key={key}>
                  <div className={`game-roster-name ${isEliminated ? 'is-eliminated' : ''} ${isSelf ? 'is-self' : ''}`}>
                    {p?.host ? <span className="game-roster-host" title="Host">*</span> : null}
                    <span className="game-roster-text">{p?.name || 'Unknown player'}</span>
                  </div>
                  <span className={`game-roster-tag status-${status || 'unknown'}`}>{tag}</span>
                </div>
              )
            })}
          </div>
        </React.Fragment>
      )
    }

    const sections = [
      renderSection('Playing', buckets.playing, 'Playing'),
      renderSection('Eliminated', buckets.eliminated, 'Eliminated'),
      renderSection('Spectators', buckets.spectating, 'Spectating'),
      renderSection('Waiting', buckets.waiting, 'Waiting'),
    ].filter(Boolean)

    if (!sections.length) {
      return <div className="game-roster-list"><div className="game-roster-empty">No players yet.</div></div>
    }
    // Debug: trace what we are rendering to keep roster in sync with incoming events
    console.debug('[roster] rendering sections', {
      counts: {
        playing: buckets.playing.length,
        eliminated: buckets.eliminated.length,
        spectating: buckets.spectating.length,
        waiting: buckets.waiting.length,
      },
      players: rosterPlayers,
    })
    return sections
  }

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

  const getInventoryDest = (materialVal, matKeyOverride) => {
    const panel = document.querySelector('.utility-panel-inventory')
    if (!panel || panel.offsetParent === null) return null
    const matKey = matKeyOverride || materialKeyFromVal(materialVal)
    const alt = matKey
      ? MATERIAL_LABELS[matKey] || (matKey.charAt(0).toUpperCase() + matKey.slice(1))
      : null
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
    const invTarget = getInventoryDest(material, matKey)
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
    const fortuneFromShop = computeFortuneFromUpgrades(purchases) + computeFortuneFromCrafts(craftCounts, inventory)
    const baseMultiplier = 1 + fortuneFromShop / 100
    fortuneBaseRef.current = baseMultiplier
    setFortuneMultiplier((prev) => Math.max(prev, baseMultiplier))
  }, [purchases, craftCounts, inventory])

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
    if (forceSpectator) return
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
  }, [room, player, running, showConfirmLeave, forceSpectator])

  useEffect(() => {
    if (forceSpectator) return
    if (!room || !player) return
    socketClient.joinRoom(room, player)
      .then((res) => {
        const payload = res?.data ?? res
        setRoomJoined(!payload?.error)
        setJoinError(payload?.error || null)
        const hostVal = payload?.data?.host ?? payload?.host
        if (typeof hostVal === 'boolean') setIsHost(hostVal)
      })
      .catch((err) => setJoinError(err?.message || 'Failed to join room'))
  }, [room, player, forceSpectator])

  useEffect(() => {
    if (forceSpectator) {
      setIsSpectator(true)
      setRunning(true)
      setStartTime((prev) => prev || (mockSpectatorData?.startTime || Date.now()))
      const mockPlayers = Array.isArray(mockSpectatorData?.players) ? mockSpectatorData.players : []
      setPlayerRoster((prev) => ({ ...prev, players: mockPlayers, game_running: true }))
      const mockBoards = mockSpectatorData?.boards || {}
      setAllBoards(mockBoards)
      return
    }
    const offRoster = socketClient.on('player_list', (payload = {}) => {
      const normalized = payload?.players
        ? payload
        : payload?.data?.players
          ? payload.data
          : Array.isArray(payload)
            ? { players: payload }
            : {}
      // Debug roster payloads to troubleshoot visibility issues
      console.log('[player_list] raw payload', payload)
      console.log('[player_list] normalized payload', normalized)
      setPlayerRoster(normalized || {})
      if (Array.isArray(normalized?.players)) {
        const me = normalized.players.find((p) => p?.name === player)
        if (me && typeof me.host === 'boolean') {
          setIsHost(Boolean(me.host))
        }
        if (me && typeof me.status === 'string') {
          const status = (me.status || '').toLowerCase()
          setIsSpectator(status === 'spectating')
        } else {
          setIsSpectator(false)
        }
      }
    })
    return () => {
      offRoster && offRoster()
    }
  }, [forceSpectator, mockSpectatorData, player])

  useEffect(() => {
    if (forceSpectator) return
    const offBoards = socketClient.on('room_boards', (payload = {}) => {
      const b = Array.isArray(payload.Board) ? payload.Board : payload.board || []
      const cleanBoard = Array.isArray(b) && b.length ? b : makeEmptyBoard()
      const clearedRowsFromServer = Array.isArray(payload.ClearedRows) ? payload.ClearedRows : Array.isArray(payload.clearedRows) ? payload.clearedRows : []
      const linesClearedHint = Number(payload.LinesCleared ?? payload.linesCleared ?? 0) || 0
      const playerNameFromServer = payload.player_name || payload.playerName || payload.player || ''
      const next = payload.NextPiece?.Shape || payload.nextPiece?.shape || payload.nextPiece?.Shape || payload.nextPiece || []
      const curPiece = payload.CurrentPiece || payload.currentPiece || {}
      const curShape = Array.isArray(curPiece.shape) ? curPiece.shape : Array.isArray(curPiece.Shape) ? curPiece.Shape : []
      const curPos = Array.isArray(curPiece.pos) ? curPiece.pos : Array.isArray(curPiece.Pos) ? curPiece.Pos : [0, 0]
      const curMaterial = curPiece.material || curPiece.Material || 1
      const resolvedName = playerNameFromServer || player

      if (resolvedName) {
        setAllBoards((prev) => ({
          ...prev,
          [resolvedName]: {
            board: cleanBoard,
            currentPiece: { shape: curShape, pos: curPos, material: curMaterial },
            nextPiece: Array.isArray(next) ? next : [],
            updatedAt: Date.now(),
          },
        }))
      }

      // Spectators keep a lightweight flow: store snapshots and skip the player-only UI work.
      if (isSpectator) {
        setRunning(true)
        setStartTime((prev) => prev || Date.now())
        return
      }

      const prevBoard = prevBoardRef.current || []
      const addedCells = []
      const clearedLineCells = []
      const height = cleanBoard.length
      const width = cleanBoard[0]?.length || 0
      let prevWithPiece = null
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
        prevWithPiece = prevBoard.map((row) => [...row])
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

        if (clearedRowsFromServer.length) {
          const seenRows = new Set(clearedLineCells.map((c) => c.row))
          const sourceBoard = prevWithPiece || prevBoard
          clearedRowsFromServer.forEach((rowIdx) => {
            if (typeof rowIdx !== 'number') return
            if (rowIdx < 0 || rowIdx >= height) return
            if (seenRows.has(rowIdx)) return
            for (let c = 0; c < width; c++) {
              const val = Number(sourceBoard?.[rowIdx]?.[c] || 1) || 1
              clearedLineCells.push({ val, row: rowIdx, col: c })
            }
          })
        }
      }

      const normalizeSpectrum = (val) => {
        if (Array.isArray(val)) return val
        if (val && typeof val === 'object') return Object.values(val)
        return []
      }

      const rawOpponentsVal = payload.Opponents ?? payload.opponents ?? payload.opponent
      const hasOpponentsPayload = 'Opponents' in payload || 'opponents' in payload || 'opponent' in payload
      let cleanedOpponents = []
      if (hasOpponentsPayload) {
        if (Array.isArray(rawOpponentsVal)) {
          cleanedOpponents = rawOpponentsVal.slice(0, 15).map((opp, idx) => {
            const name = typeof opp?.name === 'string' ? opp.name : `Player ${idx + 1}`
            const specArr = normalizeSpectrum(opp?.spectrum ?? opp)
            const spectrum = specArr.slice(0, BOARD_WIDTH).map((v) => Number(v) || 0)
            return { name, spectrum }
          })
        } else if (rawOpponentsVal && typeof rawOpponentsVal === 'object') {
          cleanedOpponents = Object.entries(rawOpponentsVal).slice(0, 15).map(([key, val], idx) => {
            const name = typeof val?.name === 'string' ? val.name : key || `Player ${idx + 1}`
            const specArr = normalizeSpectrum(val?.spectrum ?? val)
            const spectrum = specArr.slice(0, BOARD_WIDTH).map((v) => Number(v) || 0)
            return { name, spectrum }
          })
        }
        setOpponents(cleanedOpponents)
      }

      setBoard(cleanBoard)
      setRunning(true)
      setStartTime((prev) => prev || Date.now())

      setNextPiece(Array.isArray(next) ? next : [])

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
      const clearedFromServer = linesClearedHint && linesClearedHint > cleared ? linesClearedHint : 0
      const totalClears = Math.max(cleared, clearedFromServer)
      if (totalClears > 0) {
        totalClearedRef.current += totalClears
      }
      prevFullRowsRef.current = fullRows

      const inferredLinesCleared = width ? Math.round(clearedLineCells.length / width) : 0
      const linesCleared = linesClearedHint ? Math.max(linesClearedHint, inferredLinesCleared) : inferredLinesCleared
      const baseFortune = fortuneBaseRef.current || 1
      const targetFortune = baseFortune + (totalClearedRef.current || 0) * 0.03
      let computedFortune = Math.max(fortuneMultiplier || targetFortune, targetFortune)
      if (!Number.isFinite(computedFortune)) computedFortune = targetFortune

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
          const cellsByMaterial = clearedLineCells.reduce((acc, cell) => {
            const key = cell.val === 1 ? 'dirt' : cell.val === 2 ? 'stone' : cell.val === 3 ? 'iron' : cell.val === 4 ? 'diamond' : null
            if (!key) return acc
            acc[key] = acc[key] || []
            acc[key].push(cell)
            return acc
          }, {})
          const remainder = fortuneRemainderRef.current
          const bonus = {}
          const fortune = Math.max(computedFortune || 1, 1)
          Object.entries(delta).forEach(([key, count]) => {
            if (!count) {
              bonus[key] = 0
              return
            }
            const targetTotal = count * fortune
            const bonusNeeded = Math.max(0, targetTotal - count)
            const carry = Number(remainder[key] || 0)
            const accrued = bonusNeeded + carry
            const extras = Math.floor(accrued + 1e-9)
            remainder[key] = accrued - extras
            bonus[key] = extras
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

      setFortuneMultiplier(computedFortune)
      prevBoardRef.current = cleanBoard
      hasPrevBoardRef.current = true
    })

    const offStart = socketClient.on('game_start', (data = {}) => {
      const t = data.starting_time || data.start_time || Date.now()
      setStartTime(Number(t))
      setRunning(true)
      setEliminated(false)
      setWinnerName('')
      setCollected({ dirt: 0, stone: 0, iron: 0, diamond: 0 })
      totalClearedRef.current = 0
      setFortuneMultiplier(fortuneBaseRef.current || 1)
      fortuneRemainderRef.current = { dirt: 0, stone: 0, iron: 0, diamond: 0 }
      suppressShardsRef.current = false
      prevBoardRef.current = makeEmptyBoard()
      hasPrevBoardRef.current = false
      setAllBoards({})
    })
    const offEnd = socketClient.on('game_end', (payload = {}) => {
      const winner = payload?.data?.winner ?? payload?.winner
      setWinnerName(winner || '')
      // Even if winner is empty (singleplayer), treat as finished so controls re-enable
      setRunning(false)
      suppressShardsRef.current = true
      if (winner) {
        // future: could show winner UI
      }
    })
    const offEliminated = socketClient.on('player_eliminated', (payload = {}) => {
      const name = payload.player_name || payload.playerName || payload.player
      const stored = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(USERNAME_KEY) : null
      const selfName = stored || player
      if (name && selfName && name === selfName) {
        setEliminated(true)
      }
    })

    return () => {
      offBoards && offBoards()
      offStart && offStart()
      offEnd && offEnd()
      offEliminated && offEliminated()
    }
  }, [player, isSpectator, forceSpectator])

  const onStartGame = async () => {
    if (!room || !player) return
    try {
      await socketClient.startGame(room, player)
      if (!startTime) setStartTime(Date.now())
      setRunning(true)
      setEliminated(false)
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

  const rosterInfoMap = useMemo(() => {
    const map = new Map()
    rosterPlayers.forEach((p) => {
      if (!p?.name) return
      map.set(p.name, { status: (p?.status || '').toLowerCase(), host: !!p?.host })
    })
    return map
  }, [rosterPlayers])

  const spectatorBoards = useMemo(() => {
    const entries = []
    const seen = new Set()
    const pushEntry = (name, snapshot = {}, fallbackStatus = '') => {
      if (!name || seen.has(name)) return
      seen.add(name)
      const statusInfo = rosterInfoMap.get(name)
      const status = (statusInfo?.status || fallbackStatus || '').toLowerCase()
      // Only render boards for players who are currently playing or have been eliminated
      if (status && status !== 'playing' && status !== 'eliminated') return
      const boardState = Array.isArray(snapshot.board) && snapshot.board.length ? snapshot.board : makeEmptyBoard()
      const currentPieceState = snapshot.currentPiece || defaultPiece
      entries.push({
        name,
        status,
        host: statusInfo?.host || false,
        board: boardState,
        currentPiece: currentPieceState,
        nextPiece: snapshot.nextPiece || [],
      })
    }

    rosterPlayers.forEach((p, idx) => {
      const name = p?.name || `Player ${idx + 1}`
      pushEntry(name, allBoards[name], p?.status || '')
    })

    Object.entries(allBoards || {}).forEach(([name, snapshot]) => {
      pushEntry(name, snapshot, '')
    })

    return entries
  }, [rosterPlayers, allBoards, rosterInfoMap])

  useEffect(() => {
    if (!isSpectator) return
    const updateSpectatorSizing = () => {
      const gridEl = spectatorGridRef.current
      if (!gridEl) return
      const rect = gridEl.getBoundingClientRect()
      const total = spectatorBoards.length || 1
      const gapX = 20
      const gapY = 16
      const colGuess = Math.max(1, Math.min(total, Math.floor((rect.width + gapX) / 260) || 1))
      const rowCount = Math.max(1, Math.ceil(total / colGuess))
      const availW = rect.width - gapX * Math.max(0, colGuess - 1)
      const availH = rect.height - gapY * Math.max(0, rowCount - 1)
      const cardW = availW / colGuess
      const cardH = availH / rowCount
      const pad = Math.max(12, Math.round(spectatorCellSize * 0.6))
      const nameHeight = 42
      const nameGap = 10
      const borderAllowance = 8
      const extraW = pad * 2 + borderAllowance // board padding + border allowance
      const extraH = pad * 2 + borderAllowance + nameHeight + nameGap // padding + name card + gap allowance
      const sizeFromW = (cardW - extraW) / BOARD_WIDTH
      const sizeFromH = (cardH - extraH) / BOARD_HEIGHT
      const calc = Math.min(sizeFromW, sizeFromH)
      const clamped = Math.max(10, Math.min(calc || 18, 36))
      setSpectatorCellSize(clamped)
    }
    updateSpectatorSizing()
    window.addEventListener('resize', updateSpectatorSizing)
    return () => window.removeEventListener('resize', updateSpectatorSizing)
  }, [isSpectator, spectatorBoards])

  const mergeBoardAndPiece = (boardState, pieceState = {}) => {
    const sourceBoard = Array.isArray(boardState) && boardState.length ? boardState : makeEmptyBoard()
    const merged = sourceBoard.map((row) => row.slice())
    const shape = Array.isArray(pieceState.shape) ? pieceState.shape : []
    const [posX, posY] = Array.isArray(pieceState.pos) ? pieceState.pos : [0, 0]
    const material = pieceState.material || 1
    if (shape.length) {
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (!shape[y][x]) continue
          const gx = posX + x
          const gy = posY + y
          if (gy >= 0 && gy < merged.length && gx >= 0 && gx < (merged[0]?.length || BOARD_WIDTH)) {
            merged[gy][gx] = material
          }
        }
      }
    }
    return merged
  }

  const elapsed = startTime ? now - Number(startTime) : 0

  if (isSpectator) {
    return (
      <div className="game-root spectator-view">
        <div className="spectator-banner game-card" style={{ textAlign: 'center' }}>
          <div className="spectator-title" style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 2 }}>Game is still running</div>
          <div className="spectator-subtitle" style={{ fontSize: '1rem', opacity: 0.85 }}>You will be playing in the next game</div>
        </div>
        <div className="spectator-main" style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '16px', alignItems: 'start' }}>
          <div
            className="spectator-grid"
            ref={spectatorGridRef}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(${Math.round(BOARD_WIDTH * spectatorCellSize + Math.max(12, Math.round(spectatorCellSize * 0.6)) * 2 + 12)}px, 1fr))`,
              columnGap: '24px',
              rowGap: '18px',
              alignItems: 'start',
              justifyItems: 'center',
              justifyContent: 'center',
              height: 'calc(100vh - 240px)',
              maxHeight: 'calc(100vh - 200px)',
              alignContent: 'start',
            }}
          >
            {spectatorBoards.length ? spectatorBoards.map((entry, idx) => {
              const mergedBoard = mergeBoardAndPiece(entry.board, entry.currentPiece)
              const status = entry.status || 'waiting'
              const cardPad = Math.max(12, Math.round(spectatorCellSize * 0.6))
              const borderAllowance = 8
              const nameHeight = 42
              const nameGap = 10
              const boardW = BOARD_WIDTH * spectatorCellSize
              const boardH = BOARD_HEIGHT * spectatorCellSize
              const cardWidth = boardW + cardPad * 2 + borderAllowance
              const cardHeight = boardH + cardPad * 2 + borderAllowance + nameHeight + nameGap
              return (
                <div
                  className="spectator-card game-card"
                  key={`${entry.name}-${status}-${idx}`}
                  style={{
                    padding: `${Math.round(cardPad * 0.8)}px`,
                    width: `${Math.round(cardWidth)}px`,
                    height: `${Math.round(cardHeight)}px`,
                    maxWidth: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: `${Math.max(8, Math.round(cardPad * 0.5))}px`,
                    background: 'rgba(0,0,0,0.25)',
                    border: '2px solid rgba(0,0,0,0.4)',
                    boxShadow: '0 10px 20px rgba(0,0,0,0.35)',
                  }}
                >
                  <div
                    className="game-board"
                    style={{
                      width: `${Math.round(boardW + cardPad * 0.6)}px`,
                      height: `${Math.round(boardH + cardPad * 0.6)}px`,
                      maxWidth: '100%',
                      margin: '0 auto',
                      overflow: 'hidden',
                      '--cell': `${spectatorCellSize}px`,
                      padding: `${cardPad}px`,
                    }}
                  >
                    <div className="game-board-grid">
                      {mergedBoard.map((row, rIdx) => (
                        <div key={`spec-row-${entry.name}-${rIdx}`} className="game-row">
                          {row.map((val, cIdx) => (
                            <div
                              key={`spec-cell-${entry.name}-${rIdx}-${cIdx}`}
                              className={`game-cell ${val ? 'filled' : ''}`}
                              style={val ? { backgroundImage: `url(${CELL_TEXTURES[val] || '/ui/Dirt.png'})` } : undefined}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                    {status === 'eliminated' && (
                      <div className="game-board-overlay">
                        <div className="game-over-text">Game Over</div>
                      </div>
                    )}
                  </div>
                  <div className="spectator-name-card">
                    <div className="spectator-player-name">
                      {entry.host ? <span className="game-roster-host" title="Host">*</span> : null}
                      <span className="game-roster-text">{entry.name || 'Unknown player'}</span>
                    </div>
                  </div>
                </div>
              )
            }) : (
              <div className="game-roster-empty spectator-empty">Waiting for boards...</div>
            )}
          </div>

          <div className="spectator-side" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="game-card game-card-two">
              <div className="game-stat-inline">
                <div className="game-stat-label">Time Elapsed</div>
                <div className="game-stat-value">{formatTime(elapsed)}</div>
              </div>
            </div>
            <div className="game-card game-card-roster">
              {renderRosterSections(rosterBuckets)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="game-root">
      <div className="game-layout">
        <div className="game-left">
          <div className="game-left-stack">
            <div className="game-spectrums">
              {hasOpponents ? (
                <div className="game-spectrums-grid">
                  {spectrumRows.map((row, rowIdx) => (
                    <div key={`spec-row-${rowIdx}`} className="game-spectrums-row" style={{ '--spec-cols': row.length }}>
                      {row.map((opponent, idx) => (
                        <div key={`spec-${rowIdx}-${idx}`} className="game-spectrum-card">
                          <div
                            className="game-spectrum-grid"
                            style={{ '--s-cell': `${spectrumCellSize}px` }}
                            aria-label={`Spectrum ${rowIdx * 4 + idx + 1} for ${opponent?.name || 'opponent'}`}
                          >
                            {Array.from({ length: BOARD_HEIGHT }, (_, rIdx) => (
                              <div key={`r-${rIdx}`} className="game-spectrum-row">
                                {Array.from({ length: BOARD_WIDTH }, (_, cIdx) => {
                                  const heightVal = Number(opponent?.spectrum?.[cIdx] || 0)
                                  const filled = BOARD_HEIGHT - rIdx <= heightVal
                                  return <div key={`c-${cIdx}`} className={`game-spectrum-cell ${filled ? 'filled' : ''}`} />
                                })}
                              </div>
                            ))}
                          </div>
                          <div className="game-spectrum-name">
                            {opponent?.name || `Player ${rowIdx * 4 + idx + 1}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="game-spectrums-empty"></div>
              )}
            </div>
          </div>
        </div>

        <div className="game-board-shell">
          <div className={`game-board ${eliminated ? 'eliminated' : ''}`}>
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
            {(eliminated || winnerName) && (
              <div className="game-board-overlay">
                <div className="game-over-text">Game Over</div>
                {winnerName && <div className="game-over-subtext">Winner: {winnerName}</div>}
              </div>
            )}
          </div>

          <div className="game-float-panel">
            <div className="game-card game-card-two">
              <div className="game-stat-inline">
                <div className="game-stat-label">Fortune Mult</div>
                <div className="game-stat-value">x{fortuneMultiplier.toFixed(2)}</div>
              </div>
            </div>

            <div className="game-card game-card-next">
              <div className="game-next">
                {nextPiece && Array.isArray(nextPiece) && nextPiece.length ? (
                  nextPiece.map((row, rIdx) => (
                    <div key={rIdx} className="game-next-row">
                      {row.map((cell, cIdx) => (
                        <div
                          key={cIdx}
                          className={`game-next-cell ${cell === 1 ? 'filled' : ''}`}
                          style={cell != 0 ? { backgroundImage: `url(${CELL_TEXTURES[cell]})` } : undefined}
                        />
                      ))}
                    </div>
                  ))
                ) : <div className="game-next-empty">Unknown</div>}
              </div>
            </div>

            <div className="game-card game-card-collect">
              <div className="game-stat-label">Collected Blocks</div>
              <div className="game-collect">
                <div className={`game-collect-row ${bonusFlash.dirt ? 'bonus-flash' : ''}`}><span>Dirt</span><span>{collected.dirt}</span></div>
                <div className={`game-collect-row ${bonusFlash.stone ? 'bonus-flash' : ''}`}><span>Stone</span><span>{collected.stone}</span></div>
                <div className={`game-collect-row ${bonusFlash.iron ? 'bonus-flash' : ''}`}><span>Iron</span><span>{collected.iron}</span></div>
                <div className={`game-collect-row ${bonusFlash.diamond ? 'bonus-flash' : ''}`}><span>Diamond</span><span>{collected.diamond}</span></div>
              </div>
            </div>

            <div className="game-card game-card-roster">
              {renderRosterSections(rosterBuckets)}
            </div>
          </div>
        </div>
      </div>

      <div className="game-timer-float game-card game-card-two">
        <div className="game-stat-inline">
          <div className="game-stat-label">Time Elapsed</div>
          <div className="game-stat-value">{formatTime(elapsed)}</div>
        </div>
      </div>

      <div className="game-footer">
        <div className="game-footer-left">
          {isHost && (
            <Button onClick={onStartGame} className="ui-btn-wide" disabled={running}>Start Game</Button>
          )}
        </div>
        <div className="game-footer-right">
          <Button onClick={handleLeave} className="ui-btn-wide">Back</Button>
        </div>
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
          {shards.map((s) => {
            const matKey = s.matKey || materialKeyFromVal(s.material)
            const matVal = materialValFromKey(matKey) || s.material || 1
            const texture = CELL_TEXTURES[matVal] || CELL_TEXTURES[1]
            return (
              <div
                key={s.id}
                className={`game-shard ${s.phase === 'accelerate' ? 'accelerate' : ''} ${s.phase === 'done' ? 'done' : ''} ${matKey ? `mat-${matKey}` : ''}`}
                style={{
                  left: s.start.x,
                  top: s.start.y,
                  transitionDelay: `${s.delay || 0}ms`,
                  backgroundImage: `url(${texture})`,
                  transform: (s.phase === 'accelerate' || s.phase === 'done')
                    ? `translate(${s.dest.x - s.start.x}px, ${s.dest.y - s.start.y}px) scale(0.7)`
                    : 'translate(0,0) scale(1)',
                }}
              />
            )
          })}
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
