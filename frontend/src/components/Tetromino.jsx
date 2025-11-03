import React from 'react'

export const TetrominoType = Object.freeze({
  I: 'I',
  O: 'O',
  T: 'T',
  S: 'S',
  Z: 'Z',
  J: 'J',
  L: 'L',
})

const SHAPES = {
  [TetrominoType.I]: [[1,1,1,1]],
  [TetrominoType.O]: [[1,1],[1,1]],
  [TetrominoType.T]: [[1,1,1],[0,1,0]],
  [TetrominoType.S]: [[0,1,1],[1,1,0]],
  [TetrominoType.Z]: [[1,1,0],[0,1,1]],
  [TetrominoType.J]: [[1,0],[1,0],[1,1]],
  [TetrominoType.L]: [[0,1],[0,1],[1,1]],
}

// shape: 2D array of 0/1 indicating occupied cells
// size: pixel size of each cell
function rotateShape(shape, rotation) {
  const steps = ((rotation % 360) + 360) % 360 / 90
  let out = shape
  for (let i = 0; i < steps; i++) {
    // rotate 90deg clockwise: transpose + reverse rows
    const rows = out.length, cols = out[0]?.length || 0
    const next = Array.from({ length: cols }, () => Array(rows).fill(0))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        next[c][rows - 1 - r] = out[r][c]
      }
    }
    out = next
  }
  return out
}

export default function Tetromino({ type, shape: shapeProp, size = 32, texture = '/blocks/Dirt.jpg', className = '', style, outline = true, rotation = 0 }) {
  const baseShape = (type && SHAPES[type]) || shapeProp || SHAPES[TetrominoType.I]
  const shape = rotateShape(baseShape, rotation)
  const rows = shape.length
  const cols = shape[0]?.length || 0

  const gridStyle = {
    gridTemplateColumns: `repeat(${cols}, ${size}px)`,
    gridTemplateRows: `repeat(${rows}, ${size}px)`,
    ...style,
  }

  return (
    <div className={["tetro", className].filter(Boolean).join(' ')} style={gridStyle}>
      {shape.map((row, r) => row.map((v, c) => {
        const key = r * cols + c
        if (!v) return <div key={key} className="tetro-empty" />

        // neighbors for inner 1px lines only where two blocks touch
        const hasUp = r > 0 && !!shape[r-1][c]
        const hasLeft = c > 0 && !!shape[r][c-1]

        const cellStyle = {
          backgroundImage: `url('${texture}')`,
          borderTop: hasUp ? '1px solid #333' : 'none',
          borderLeft: hasLeft ? '1px solid #333' : 'none',
          boxSizing: 'border-box',
        }

        return <div key={key} className="tetro-cell" style={cellStyle} />
      }))}

      {outline && (
        <svg className="tetro-outline" width={cols * size} height={rows * size} style={{position:'absolute', left:0, top:0, pointerEvents:'none'}}>
          {shape.map((row, r) => row.map((v, c) => {
            if (!v) return null
            const x = c * size
            const y = r * size
            const lines = []
            const up = r === 0 || !shape[r-1][c]
            const down = r === rows - 1 || !shape[r+1][c]
            const left = c === 0 || !shape[r][c-1]
            const right = c === cols - 1 || !shape[r][c+1]
            if (up) lines.push(<line key={`u-${r}-${c}`} x1={x} y1={y} x2={x+size} y2={y} stroke="#000" strokeWidth={2} />)
            if (down) lines.push(<line key={`d-${r}-${c}`} x1={x} y1={y+size} x2={x+size} y2={y+size} stroke="#000" strokeWidth={2} />)
            if (left) lines.push(<line key={`l-${r}-${c}`} x1={x} y1={y} x2={x} y2={y+size} stroke="#000" strokeWidth={2} />)
            if (right) lines.push(<line key={`r-${r}-${c}`} x1={x+size} y1={y} x2={x+size} y2={y+size} stroke="#000" strokeWidth={2} />)
            return lines
          }))}
        </svg>
      )}
    </div>
  )
}
