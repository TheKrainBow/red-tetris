const chai = require('chai')
const { getLocalStorageItem, setLocalStorageItem, removeLocalStorageItem } = require('../frontend/src/utils/storage')

chai.should()

describe('storage utils', function () {
  const oldWindow = global.window
  beforeEach(function () { delete global.window })
  after(function () { if (oldWindow) global.window = oldWindow })

  it('returns fallback when localStorage is unavailable', function () {
    const v = getLocalStorageItem('nope', 'fallback')
    v.should.equal('fallback')
  })

  it('reads/writes when localStorage exists', function () {
    const mem = {}
    global.window = { localStorage: {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v) },
      removeItem: (k) => { delete mem[k] }
    }}

    setLocalStorageItem('a', '1').should.equal(true)
    getLocalStorageItem('a', '').should.equal('1')
    removeLocalStorageItem('a').should.equal(true)
    ;(getLocalStorageItem('a', null) === null).should.equal(true)
  })
})

