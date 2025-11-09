const chai = require('chai')

const { readUsername, navToMultiplayer, navToSingleplayer, navToShop, attachReady } = require('../frontend/src/pages/MainMenu')

chai.should()

describe('MainMenu helpers', function () {
  it('readUsername reads from localStorage via util', function () {
    const oldWindow = global.window
    const mem = { username: 'Alice' }
    global.window = { localStorage: {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v) },
      removeItem: (k) => { delete mem[k] }
    }}
    readUsername().should.equal('Alice')
    if (oldWindow) global.window = oldWindow; else delete global.window
  })

  it('navToMultiplayer updates hash on provided window', function () {
    const fakeWin = { location: { hash: '' } }
    navToMultiplayer(fakeWin)
    fakeWin.location.hash.should.equal('#/multiplayer')
  })

  it('navToSingleplayer and navToShop update hash; undefined window does nothing', function () {
    const fake = { location: { hash: '' } }
    navToSingleplayer(fake)
    fake.location.hash.should.equal('#/singleplayer')
    navToShop(fake)
    fake.location.hash.should.equal('#/shop')
    // call with undefined — should not throw or change anything
    navToShop(undefined)
  })

  it('attachReady calls setter and respects cleanup', async function () {
    let called = 0
    const setter = () => { called++ }
    const cleanup = attachReady(Promise.resolve(), setter)
    await Promise.resolve()
    called.should.equal(1)

    called = 0
    const cleanup2 = attachReady(new Promise(res => setTimeout(res, 2)), setter)
    cleanup2() // dispose before resolution
    await new Promise(r => setTimeout(r, 5))
    called.should.equal(0)
  })

  it('attachReady catch path still marks ready', async function () {
    let called = 0
    const setter = () => { called++ }
    const failing = new Promise((_, rej) => setTimeout(() => rej(new Error('x')), 0))
    attachReady(failing, setter)
    await new Promise(r => setTimeout(r, 5))
    called.should.equal(1)
  })
})
