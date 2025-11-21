import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import socketClient from '../utils/socketClient.js'
import { navigate } from '../utils/navigation'

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20

const makeEmptyBoard = () => Array.from({ length: BOARD_HEIGHT }, () => Array.from({ length: BOARD_WIDTH }, () => 0))

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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

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
      setBoard(cleanBoard)
      setRunning(true)
      setStartTime((prev) => prev || Date.now())

      const next = payload.NextPiece?.Shape || payload.nextPiece?.shape || payload.nextPiece || []
      setNextPiece(Array.isArray(next) ? next : [])

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

      const collectedCounts = { dirt: 0, stone: 0, iron: 0, diamond: 0 }
      cleanBoard.forEach((row) => {
        row.forEach((cell) => {
          switch (cell) {
            case 1: collectedCounts.dirt += 1; break
            case 2: collectedCounts.stone += 1; break
            case 3: collectedCounts.iron += 1; break
            case 4: collectedCounts.diamond += 1; break
            default: break
          }
        })
      })
      setCollected(collectedCounts)
    })

    const offStart = socketClient.on('game_start', (data = {}) => {
      const t = data.starting_time || data.start_time || Date.now()
      setStartTime(Number(t))
      setRunning(true)
    })
    const offEnd = socketClient.on('game_end', () => {
      setRunning(false)
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
          <div className="game-grid">
            {board.map((row, rIdx) => (
              <div key={rIdx} className="game-row">
                {row.map((cell, cIdx) => (
                  <div
                    key={cIdx}
                    className={`game-cell ${cell ? 'filled' : ''}`}
                    style={cell ? { backgroundImage: 'url(/ui/Dirt.png)' } : undefined}
                  />
                ))}
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
                        className={`game-next-cell ${cell ? 'filled' : ''}`}
                        style={cell ? { backgroundImage: 'url(/ui/Dirt.png)' } : undefined}
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
              <div className="game-collect-row"><span>Dirt</span><span>{collected.dirt}</span></div>
              <div className="game-collect-row"><span>Stone</span><span>{collected.stone}</span></div>
              <div className="game-collect-row"><span>Iron</span><span>{collected.iron}</span></div>
              <div className="game-collect-row"><span>Diamond</span><span>{collected.diamond}</span></div>
            </div>
          </div>

          <div className="game-stat">
            <div className="game-stat-label">Time Elapsed</div>
            <div className="game-stat-value">{formatTime(elapsed)}</div>
          </div>
        </div>
      </div>

      <div className="game-layout">
      </div>

      <div className="game-footer">
        <Button onClick={onStartGame} className="ui-btn-wide">Start Game</Button>
        <Button onClick={handleLeave} className="ui-btn-wide">Leave Lobby</Button>
      </div>

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
