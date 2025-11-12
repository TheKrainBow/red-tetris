const React = require('react')
const { act, create } = require('react-test-renderer')
const proxyquire = require('proxyquire').noCallThru()
const chai = require('chai')
const { setupDom } = require('./helpers/dom')

if (typeof global.document === 'undefined') {
  global.document = { addEventListener() {}, removeEventListener() {} }
}
if (typeof global.window === 'undefined') {
  global.window = { addEventListener() {}, removeEventListener() {}, location: { hash: '' } }
}
if (typeof global.localStorage === 'undefined') {
  global.localStorage = {
    getItem() { return null },
    setItem() {},
    removeItem() {},
  }
}

const Leaderboard = proxyquire('../frontend/src/pages/Leaderboard', {
  '../components/SpinningCube.jsx': () => React.createElement('div', { className: 'cube-stub' }),
}).default

chai.should()

describe('Leaderboard page', function () {
  let cleanup = null
  let renderer = null

  afterEach(function () {
    if (renderer) renderer.unmount()
    renderer = null
    if (cleanup) cleanup()
    cleanup = null
  })

  function renderPage(storageData = { username: 'Steve' }) {
    const env = setupDom({ storageData })
    cleanup = env.cleanup
    act(() => {
      renderer = create(React.createElement(Leaderboard))
    })
    return env
  }

  function buttonByText(label) {
    return renderer.root.findAllByType('button').find((btn) => {
      const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
      return typeof text === 'string' && text.includes(label)
    })
  }

  it('renders rows and highlights current user when present', function () {
    renderPage({ username: 'Alex' })
    const rows = renderer.root.findAll((node) =>
      node.props &&
      typeof node.props.className === 'string' &&
      node.props.className.includes('lb-row')
    )
    rows.length.should.be.at.least(10)
    const hasMe = rows.some((row) => row.props.className.includes('lb-row-me'))
    chai.expect(hasMe).to.equal(true)
  })

  it('changes metric via dropdown and navigates back', function () {
    const env = renderPage({ username: 'Speedrunner' })
    const labelNode = () => renderer.root.findByProps({ className: 'lb-dd-label' })
    labelNode().children[0].should.equal('Per Emerald')
    const toggle = renderer.root.findByProps({ className: 'lb-dd-button' })
    act(() => toggle.props.onClick())
    const menu = renderer.root.findByProps({ className: 'lb-dd-menu' })
    chai.expect(menu.children.length).to.be.greaterThan(1)
    act(() => menu.children[1].props.onClick())
    labelNode().children[0].should.not.equal('Per Emerald')
    env.window.location.hash = '#/leaderboard'
    act(() => buttonByText('Back').props.onClick())
    env.window.location.hash.should.equal('#/')
  })
})
