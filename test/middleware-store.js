const chai = require('chai')
const { storeStateMiddleWare } = require('../frontend/src/middleware/storeStateMiddleWare')

chai.should()

describe('storeStateMiddleWare', function () {
  it('passes actions through and returns next result', function () {
    const calls = []
    const store = { getState: () => ({}), dispatch: (a) => calls.push(a) }
    const next = (action) => { calls.push({ type: 'next', action }); return 42 }
    const mw = storeStateMiddleWare(store)(next)
    const res = mw({ type: 'TEST' })
    res.should.equal(42)
    calls.length.should.equal(1)
    calls[0].type.should.equal('next')
  })
})

