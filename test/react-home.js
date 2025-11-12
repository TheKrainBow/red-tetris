const React = require('react')
const { act, create } = require('react-test-renderer')
const chai = require('chai')
const { setupDom } = require('./helpers/dom')
const Home = require('../frontend/src/pages/Home').default

chai.should()

describe('Home page', function () {
  let cleanup = null

  afterEach(function () {
    if (cleanup) cleanup()
    cleanup = null
  })

  it('redirects to login when username missing', function () {
    const env = setupDom()
    cleanup = env.cleanup
    let renderer
    act(() => {
      renderer = create(React.createElement(Home))
    })
    env.window.location.hash.should.equal('#/login')
    renderer.unmount()
  })

  it('greets existing user and shows logout button', function () {
    const env = setupDom({ storageData: { username: 'Alex' } })
    cleanup = env.cleanup
    let renderer
    act(() => {
      renderer = create(React.createElement(Home))
    })
    const heading = renderer.root.findByType('h2')
    heading.children.join('').should.contain('Alex')
    const button = renderer.root.findByType('button')
    button.props.children.should.equal('Logout')
    renderer.unmount()
  })

  it('logout clears storage and routes back to login', function () {
    const env = setupDom({ storageData: { username: 'Builder' } })
    cleanup = env.cleanup
    let renderer
    act(() => {
      renderer = create(React.createElement(Home))
    })
    const button = renderer.root.findByType('button')
    act(() => button.props.onClick())
    chai.expect(env.storage.getItem('username')).to.equal(null)
    env.window.location.hash.should.equal('#/login')
    renderer.unmount()
  })
})
