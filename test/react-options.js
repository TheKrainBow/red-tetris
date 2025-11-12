const React = require('react')
const { act, create } = require('react-test-renderer')
const chai = require('chai')
const { setupDom } = require('./helpers/dom')
const Options = require('../frontend/src/pages/Options').default

chai.should()

describe('Options page', function () {
  let cleanup = null
  let renderer = null
  let windowMock = null

  afterEach(function () {
    if (renderer) renderer.unmount()
    renderer = null
    if (cleanup) cleanup()
    cleanup = null
    windowMock = null
  })

  function renderPage(storageData = {}) {
    const env = setupDom({
      storageData,
      windowOverrides: {
        setSfxVolume: function (value) {
          this._sfx = value
        },
        setMusicVolume: function (value) {
          this._music = value
        },
      },
    })
    windowMock = env.window
    cleanup = env.cleanup
    act(() => {
      renderer = create(React.createElement(Options))
    })
    return env
  }

  function findButton(label) {
    return renderer.root.findAllByType('button').find((btn) => {
      const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
      return typeof text === 'string' && text.includes(label)
    })
  }

  it('updates stored volumes and invokes global setters', function () {
    const env = renderPage({ 'music.volume': '0.5', 'sfx.volume': '0.4' })
    const sliders = renderer.root.findAllByProps({ className: 'opt-range' })
    chai.expect(sliders).to.have.lengthOf(2)
    act(() => sliders[0].props.onChange({ target: { value: '0.75' } }))
    act(() => sliders[1].props.onChange({ target: { value: '0.25' } }))
    env.storage.getItem('music.volume').should.equal('0.75')
    env.storage.getItem('sfx.volume').should.equal('0.25')
    windowMock._music.should.equal(0.75)
    windowMock._sfx.should.equal(0.25)
  })

  it('Change Username clears username and navigates to login', function () {
    const env = renderPage({ username: 'PlayerOne' })
    env.window.location.hash = '#/options'
    act(() => findButton('Change Username').props.onClick())
    chai.expect(env.storage.getItem('username')).to.equal(null)
    env.window.location.hash.should.equal('#/login')
  })

  it('Reset my account stores default inventory and Done navigates home', function () {
    const env = renderPage()
    act(() => findButton('Reset my account').props.onClick())
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.should.deep.equal({ Dirt: 0, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0 })
    chai.expect(env.storage.getItem('shop.purchases')).to.equal(null)
    env.window.location.hash = '#/options'
    act(() => findButton('Done').props.onClick())
    env.window.location.hash.should.equal('#/')
  })
})
