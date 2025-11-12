const React = require('react')
const { act, create } = require('react-test-renderer')
const chai = require('chai')
const { setupDom } = require('./helpers/dom')
const Login = require('../frontend/src/pages/Login').default

chai.should()

describe('Login page', function () {
  let cleanup = null

  afterEach(function () {
    if (cleanup) cleanup()
    cleanup = null
  })

  it('navigates home if username already stored', function () {
    const env = setupDom({ storageData: { username: 'Speedrun' } })
    cleanup = env.cleanup
    act(() => {
      create(React.createElement(Login))
    })
    env.window.location.hash.should.equal('#/')
  })

  it('saves trimmed username on submit', function () {
    const env = setupDom()
    cleanup = env.cleanup
    let renderer
    act(() => {
      renderer = create(React.createElement(Login))
    })
    const input = renderer.root.findByProps({ id: 'username' })
    act(() => input.props.onChange({ target: { value: '  Builder  ' } }))
    const form = renderer.root.findByType('form')
    act(() => form.props.onSubmit({ preventDefault() {} }))
    env.storage.getItem('username').should.equal('Builder')
    env.window.location.hash.should.equal('#/')
    renderer.unmount()
  })

  it('ignores submit when username empty', function () {
    const env = setupDom()
    cleanup = env.cleanup
    env.window.location.hash = '#/login'
    let renderer
    act(() => {
      renderer = create(React.createElement(Login))
    })
    const form = renderer.root.findByType('form')
    act(() => form.props.onSubmit({ preventDefault() {} }))
    chai.expect(env.storage.getItem('username')).to.equal(null)
    env.window.location.hash.should.equal('#/login')
    renderer.unmount()
  })
})
