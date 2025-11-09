const { expect } = require('chai')
const proxyquire = require('proxyquire').noCallThru()

describe('backend/main bootstrap', () => {
  it('calls server.create with params', async () => {
    let called = false
    const fakeServer = { create: async () => { called = true } }
    const fakeParams = { server: { port: 0 } }
    proxyquire('../backend/main.js', {
      './index': fakeServer,
      './params': fakeParams,
    })
    // give the async call a microtask
    await new Promise(r => setTimeout(r, 0))
    expect(called).to.equal(true)
  })
})

