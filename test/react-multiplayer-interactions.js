const chai = require('chai')
const React = require('react')
const ShallowRenderer = require('react-test-renderer/shallow')

const Multiplayer = require('../frontend/src/pages/Multiplayer').default

chai.should()

describe('Multiplayer interactions', function () {
  const oldWindow = global.window
  const oldAlert = global.alert
  let alertCount

  beforeEach(function () {
    global.window = { location: { hash: '#/multiplayer' } }
    alertCount = 0
    global.alert = () => { alertCount++ }
  })

  after(function () {
    if (oldWindow) global.window = oldWindow; else delete global.window
    if (oldAlert) global.alert = oldAlert; else delete global.alert
  })

  it('selects a server enabling Join; Create and Cancel trigger actions', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(Multiplayer))
    const out1 = r.getRenderOutput()
    const content1 = out1.props.children.find(c => c && c.props && c.props.className === 'mp-content')
    const list1 = content1.props.children.find(c => c && c.props && c.props.className === 'mp-list-wrap').props.children
    const rows = list1.props.children
    rows.length.should.be.at.least(1)

    // Footer buttons
    const footer1 = content1.props.children.find(c => c && c.props && c.props.className === 'mp-footer')
    let [joinBtn, createBtn, cancelBtn] = footer1.props.children
    joinBtn.props.disabled.should.equal(true)

    // Click create server -> alert
    createBtn.props.onClick()
    alertCount.should.equal(1)

    // Select a server row
    rows[0].props.onClick()
    const out2 = r.getRenderOutput()
    const content2 = out2.props.children.find(c => c && c.props && c.props.className === 'mp-content')
    const footer2 = content2.props.children.find(c => c && c.props && c.props.className === 'mp-footer')
    ;[joinBtn, createBtn, cancelBtn] = footer2.props.children
    joinBtn.props.disabled.should.equal(false)

    // Now Join should invoke alert
    joinBtn.props.onClick()
    alertCount.should.equal(2)

    // Cancel updates hash
    cancelBtn.props.onClick()
    global.window.location.hash.should.equal('#/')
  })
})

