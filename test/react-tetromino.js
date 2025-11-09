const React = require('react')
const TestRenderer = require('react-test-renderer')

describe('Tetromino render', () => {
  it('renders correct number of cells for T rotated 90', () => {
    const Tetromino = require('../frontend/src/components/Tetromino.jsx').default
    const test = TestRenderer.create(React.createElement(Tetromino, { type: 'T', rotation: 90, size: 8 }))
    const json = test.toJSON()
    // Walk tree and count divs with className tetro-cell
    let count = 0
    const walk = (node) => {
      if (!node) return
      if (Array.isArray(node)) return node.forEach(walk)
      if (node.props && node.props.className === 'tetro-cell') count++
      if (node.children) node.children.forEach(walk)
    }
    walk(json)
    if (count !== 4) throw new Error('expected 4 occupied cells, got ' + count)
    test.unmount()
  })
})
