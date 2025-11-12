const React = require('react')
const { act, create } = require('react-test-renderer')
const proxyquire = require('proxyquire').noCallThru()
const chai = require('chai')
const { setupDom } = require('./helpers/dom')

const CreateGame = proxyquire('../frontend/src/pages/CreateGame', {
  '../components/SpinningCube.jsx': () => React.createElement('div', { className: 'cube-stub' }),
}).default

chai.should()

describe('CreateGame page', function () {
  let cleanup = null
  let renderer = null
  let alerts = null

  beforeEach(function () {
    alerts = []
    global.alert = (msg) => alerts.push(msg)
  })

  afterEach(function () {
    if (renderer) renderer.unmount()
    renderer = null
    delete global.alert
    if (cleanup) cleanup()
    cleanup = null
  })

  function renderPage() {
    const env = setupDom({ storageData: { username: 'Alex' } })
    cleanup = env.cleanup
    act(() => {
      renderer = create(React.createElement(CreateGame))
    })
    return env
  }

  function findButton(label) {
    return renderer.root.findAllByType('button').find((btn) => {
      const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
      return typeof text === 'string' && text.includes(label)
    })
  }

  function inputsByType(type) {
    return renderer.root.findAllByType('input').filter((el) => el.props.type === type)
  }

  function readDistributionSum() {
    const vals = renderer.root.findAllByProps({ className: 'gc-prob-val' })
      .map((node) => parseFloat(Array.isArray(node.children) ? node.children.join('') : node.children))
      .filter((n) => !Number.isNaN(n))
    return vals.reduce((acc, n) => acc + n, 0)
  }

  it('disables Start when auto distribution off and totals drift', function () {
    renderPage()
    const slider = () => inputsByType('range')[0]
    const checkbox = () => inputsByType('checkbox')[0]
    act(() => checkbox().props.onChange({ target: { checked: false } }))
    act(() => slider().props.onChange({ target: { value: 0.1 } }))
    chai.expect(findButton('Start Game').props.disabled).to.equal(true)
  })

  it('auto distribution keeps totals near 1 when adjusting sliders', function () {
    renderPage()
    const slider = inputsByType('range')[0]
    act(() => slider.props.onChange({ target: { value: 0.8 } }))
    chai.expect(readDistributionSum()).to.be.closeTo(1, 0.01)
  })

  it('re-enabling auto distribution rebalances probabilities', function () {
    renderPage()
    const slider = inputsByType('range')[0]
    const checkbox = inputsByType('checkbox')[0]
    act(() => checkbox.props.onChange({ target: { checked: false } }))
    act(() => slider.props.onChange({ target: { value: 0.15 } }))
    chai.expect(readDistributionSum()).to.be.below(1)
    act(() => checkbox.props.onChange({ target: { checked: true } }))
    chai.expect(readDistributionSum()).to.be.closeTo(1, 0.01)
  })

  it('starts game and reports probabilities', function () {
    renderPage()
    act(() => findButton('Start Game').props.onClick())
    alerts[0].should.match(/probabilities/i)
  })

  it('cancel navigates back to singleplayer', function () {
    const env = renderPage()
    env.window.location.hash = '#/create'
    act(() => findButton('Cancel').props.onClick())
    env.window.location.hash.should.equal('#/singleplayer')
  })
})
