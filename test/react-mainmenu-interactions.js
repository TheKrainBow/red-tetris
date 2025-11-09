const chai = require('chai')
const React = require('react')
const ShallowRenderer = require('react-test-renderer/shallow')

const MainMenu = require('../frontend/src/pages/MainMenu').default

chai.should()

describe('MainMenu interactions', function () {
  const oldWindow = global.window
  beforeEach(function () { global.window = { location: { hash: '#/' } } })
  after(function () { if (oldWindow) global.window = oldWindow; else delete global.window })

  it('Multiplayer button navigates to #/multiplayer', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(MainMenu))
    const out = r.getRenderOutput()
    const content = out.props.children.find(c => c && c.props && String(c.props.className).includes('mm-content'))
    const primary = content.props.children.find(c => c && c.props && c.props.className === 'mm-primary')
    const [singleBtn, multiBtn] = primary.props.children
    multiBtn.props.onClick()
    global.window.location.hash.should.equal('#/multiplayer')
  })

  it('Singleplayer and Shop buttons navigate correctly; Options sets #/options', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(MainMenu))
    const out = r.getRenderOutput()
    const content = out.props.children.find(c => c && c.props && String(c.props.className).includes('mm-content'))
    const primary = content.props.children.find(c => c && c.props && c.props.className === 'mm-primary')
    const [singleBtn, multiBtn, shopBtn] = primary.props.children
    singleBtn.props.onClick()
    global.window.location.hash.should.equal('#/singleplayer')
    shopBtn.props.onClick()
    global.window.location.hash.should.equal('#/shop')

    const row = content.props.children.find(c => c && c.props && c.props.className === 'mm-row')
    const center = row.props.children.find(c => c && c.props && c.props.className === 'mm-row-center')
    const [optBtn] = center.props.children
    optBtn.props.onClick()
    global.window.location.hash.should.equal('#/options')
  })
})
