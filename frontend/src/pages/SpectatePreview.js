import React, { useMemo } from 'react'
import Game from './Game'

const BOARD_WIDTH = 10
const BOARD_HEIGHT = 20

const makeBoard = (filled = []) => {
  const grid = Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0))
  filled.forEach(([r, c, val]) => {
    if (r < 0 || r >= BOARD_HEIGHT || c < 0 || c >= BOARD_WIDTH) return
    grid[r][c] = val || 1
  })
  return grid
}

export default function SpectatePreview() {
  const mockData = useMemo(() => {
    const players = [
      { name: 'Alex', status: 'playing', host: true },
      { name: 'Blaze', status: 'playing' },
      { name: 'Creeper', status: 'playing' },
      { name: 'Drowned', status: 'playing' },
      { name: 'Ender', status: 'eliminated' },
      { name: 'Fisher', status: 'eliminated' },
      // { name: 'Ghast', status: 'playing' },
      // { name: 'Herobrine', status: 'playing' },
      // { name: 'Illager', status: 'playing' },
      // { name: 'Jeb', status: 'playing' },
      // { name: 'Kelvin', status: 'playing' },
      // { name: 'Lapis', status: 'playing' },
      // { name: 'Miner', status: 'playing' },
      // { name: 'Nether', status: 'eliminated' },
      // { name: 'Ocean', status: 'playing' },
      // { name: 'Piglin', status: 'eliminated' },
    ]

    const boards = {
      Alex: {
        board: makeBoard([[18, 4, 2], [18, 5, 2], [18, 6, 2], [18, 7, 2], [17, 6, 3], [16, 6, 3], [15, 6, 3]]),
        currentPiece: { shape: [[1, 1, 1], [0, 1, 0]], pos: [3, 3], material: 4 },
        nextPiece: [[1, 1], [1, 1]],
      },
      Blaze: {
        board: makeBoard([[19, 0, 1], [19, 1, 1], [18, 0, 1], [18, 1, 1], [17, 1, 2], [16, 1, 2], [19, 8, 4], [18, 8, 4], [17, 8, 4]]),
        currentPiece: { shape: [[1], [1], [1], [1]], pos: [5, 4], material: 3 },
        nextPiece: [[0, 1, 0], [1, 1, 1]],
      },
      // Creeper: {
      //   board: makeBoard([[19, 4, 2], [19, 5, 2], [18, 4, 2], [18, 5, 2], [17, 4, 2], [17, 5, 2], [16, 5, 3], [15, 5, 3], [14, 5, 3]]),
      //   currentPiece: { shape: [[1, 1, 0], [0, 1, 1]], pos: [6, 6], material: 4 },
      //   nextPiece: [[1, 0, 0], [1, 1, 1]],
      // },
      // Drowned: {
      //   board: makeBoard([[19, 9, 1], [19, 8, 1], [18, 9, 1], [18, 8, 1], [17, 9, 2], [17, 8, 2], [16, 7, 2], [16, 6, 2]]),
      //   currentPiece: { shape: [[1, 1, 1], [1, 0, 0]], pos: [1, 5], material: 2 },
      //   nextPiece: [[1, 1, 1, 1]],
      // },
      // Ender: {
      //   board: makeBoard([[19, 0, 4], [19, 1, 4], [19, 2, 4], [18, 2, 4], [17, 2, 4], [16, 2, 4], [15, 2, 4]]),
      //   currentPiece: { shape: [[1, 1], [1, 1]], pos: [6, 10], material: 3 },
      //   nextPiece: [[0, 1, 0], [1, 1, 1]],
      // },
      // Fisher: {
      //   board: makeBoard([[19, 9, 2], [19, 8, 2], [19, 7, 2], [18, 9, 2], [18, 8, 2], [18, 7, 2], [17, 9, 1], [17, 8, 1], [16, 8, 1], [15, 8, 1]]),
      //   currentPiece: { shape: [[1, 1, 1], [0, 0, 1]], pos: [2, 7], material: 2 },
      //   nextPiece: [[1, 1, 0], [0, 1, 1]],
      // },
      // Ghast: {
      //   board: makeBoard([[19, 3, 1], [19, 4, 1], [18, 3, 1], [18, 4, 1], [17, 4, 3]]),
      //   currentPiece: { shape: [[1, 1, 1], [0, 0, 1]], pos: [6, 4], material: 4 },
      //   nextPiece: [[1, 1, 1, 1]],
      // },
      // Herobrine: {
      //   board: makeBoard([[19, 0, 2], [19, 1, 2], [19, 2, 2], [18, 2, 2], [17, 2, 2], [16, 2, 2]]),
      //   currentPiece: { shape: [[1, 1, 0], [0, 1, 1]], pos: [5, 5], material: 3 },
      //   nextPiece: [[0, 1, 0], [1, 1, 1]],
      // },
      // Illager: {
      //   board: makeBoard([[19, 8, 4], [19, 9, 4], [18, 9, 4], [17, 9, 4], [16, 9, 4]]),
      //   currentPiece: { shape: [[1], [1], [1], [1]], pos: [2, 8], material: 2 },
      //   nextPiece: [[1, 1], [1, 1]],
      // },
      // Jeb: {
      //   board: makeBoard([[19, 5, 1], [19, 6, 1], [19, 7, 1], [18, 5, 1], [18, 6, 1], [18, 7, 1]]),
      //   currentPiece: { shape: [[1, 1, 1], [1, 0, 0]], pos: [1, 3], material: 2 },
      //   nextPiece: [[1, 0, 0], [1, 1, 1]],
      // },
      // Kelvin: {
      //   board: makeBoard([[19, 4, 3], [19, 5, 3], [18, 4, 3], [18, 5, 3], [17, 4, 3]]),
      //   currentPiece: { shape: [[1, 1, 1, 1]], pos: [4, 2], material: 1 },
      //   nextPiece: [[1, 1], [1, 1]],
      // },
      // Lapis: {
      //   board: makeBoard([[19, 2, 4], [19, 3, 4], [18, 2, 4], [18, 3, 4], [17, 3, 4], [16, 3, 4]]),
      //   currentPiece: { shape: [[1, 1, 0], [0, 1, 1]], pos: [6, 7], material: 2 },
      //   nextPiece: [[0, 1, 0], [1, 1, 1]],
      // },
      // Miner: {
      //   board: makeBoard([[19, 7, 1], [19, 8, 1], [18, 7, 1], [18, 8, 1], [17, 7, 1], [16, 7, 1]]),
      //   currentPiece: { shape: [[1], [1], [1]], pos: [4, 6], material: 3 },
      //   nextPiece: [[1, 1, 1], [0, 1, 0]],
      // },
      // Nether: {
      //   board: makeBoard([[19, 0, 2], [18, 0, 2], [17, 0, 2], [16, 0, 2], [15, 0, 2]]),
      //   currentPiece: { shape: [[1, 1], [1, 1]], pos: [6, 9], material: 4 },
      //   nextPiece: [[1, 1, 0], [0, 1, 1]],
      // },
      // Ocean: {
      //   board: makeBoard([[19, 6, 1], [19, 7, 1], [18, 6, 1], [18, 7, 1], [17, 6, 1]]),
      //   currentPiece: { shape: [[1, 1, 1], [1, 0, 0]], pos: [2, 4], material: 2 },
      //   nextPiece: [[1, 1, 1, 1]],
      // },
      // Piglin: {
      //   board: makeBoard([[19, 9, 3], [18, 9, 3], [17, 9, 3], [16, 9, 3], [15, 9, 3]]),
      //   currentPiece: { shape: [[1], [1], [1]], pos: [3, 1], material: 1 },
      //   nextPiece: [[1, 0, 0], [1, 1, 1]],
      // },
    }

    return {
      startTime: Date.now() - 45_000,
      players,
      boards,
    }
  }, [])

  return (
    <Game
      room="spectate-demo"
      player="Spectator"
      forceSpectator
      mockSpectatorData={mockData}
    />
  )
}
