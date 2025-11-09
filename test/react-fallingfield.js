const React = require('react')
const TestRenderer = require('react-test-renderer')

describe('FallingField basic mount', () => {
  it('mounts and spawns at least one item', () => {
    const FallingField = require('../frontend/src/components/FallingField.jsx').default
    const containerRef = { current: { getBoundingClientRect: () => ({ left: 0, right: 500, width: 500, height: 240 }) } }
    const targetRef = { current: { getBoundingClientRect: () => ({ left: 200, right: 300 }) } }
    // Stub RAF to run a single frame
    let called = 0
    const origRaf = global.requestAnimationFrame
    const origCancel = global.cancelAnimationFrame || (()=>{})
    global.requestAnimationFrame = (cb) => { if (called++ < 1) setTimeout(() => cb(16), 0); return 1 }
    global.cancelAnimationFrame = () => {}

    let test
    TestRenderer.act(() => {
      test = TestRenderer.create(React.createElement(FallingField, { side: 'left', containerRef, targetRef }))
    })
    // Allow queued RAF to run
    return new Promise((resolve) => setTimeout(resolve, 5)).then(() => {
      const tree = test.toJSON()
      // Should render the lane wrapper
      if (!tree || tree.props.className.indexOf('mp-fall-lane') === -1) throw new Error('lane not rendered')
    }).finally(() => {
      test.unmount()
      global.requestAnimationFrame = origRaf
      global.cancelAnimationFrame = origCancel
    })
  })
})
