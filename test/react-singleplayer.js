const React = require('react')
const { act, create } = require('react-test-renderer')
const chai = require('chai')
const { setupDom } = require('./helpers/dom')
const Singleplayer = require('../frontend/src/pages/Singleplayer').default

chai.should()

describe('Singleplayer page', function () {
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

  function renderWithUser(name = 'Alex') {
    const env = setupDom({ storageData: { username: name } })
    cleanup = env.cleanup
    act(() => {
      renderer = create(React.createElement(Singleplayer))
    })
    return env
  }

  it('renders history rows and allows selecting one', function () {
    renderWithUser()
    const rows = renderer.root.findAll((node) =>
      node.props &&
      typeof node.props.className === 'string' &&
      node.props.className.includes('mp-row') &&
      typeof node.props.onClick === 'function'
    )
    rows.length.should.be.at.least(3)
    const findViewBtn = () => renderer.root.findAllByType('button').find((btn) => btn.children && btn.children.includes('View Game'))
    chai.expect(findViewBtn().props.disabled).to.equal(true)
    act(() => rows[0].props.onClick())
    chai.expect(findViewBtn().props.disabled).to.equal(false)
    act(() => findViewBtn().props.onClick())
    alerts[0].should.match(/Viewing/)
  })

  it('navigates on footer buttons', function () {
    const env = renderWithUser()
    const buttons = renderer.root.findAllByType('button')
    const createBtn = buttons.find((btn) => btn.children && btn.children.includes('Create New Game'))
    const cancelBtn = buttons.find((btn) => btn.children && btn.children.includes('Cancel'))
    act(() => createBtn.props.onClick())
    env.window.location.hash.should.equal('#/singleplayer/create')
    act(() => cancelBtn.props.onClick())
    env.window.location.hash.should.equal('#/')
  })
})
