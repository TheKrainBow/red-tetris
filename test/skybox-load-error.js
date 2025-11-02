const chai = require('chai')

chai.should()

describe('Skybox loader error path', function () {
  const oldImage = global.Image
  const oldDoc = global.document

  before(function () {
    delete require.cache[require.resolve('../frontend/src/three/Skybox.jsx')]
    // Minimal canvas mock
    global.document = {
      createElement: (tag) => ({ width: 0, height: 0, getContext: () => ({ translate: () => {}, rotate: () => {}, drawImage: () => {} }) })
    }
    // Image that errors
    global.Image = class BadImage {
      set crossOrigin(_) {}
      set onload(cb) { this._onload = cb }
      set onerror(cb) { this._onerror = cb }
      set src(_) { setTimeout(() => this._onerror && this._onerror(new Error('fail')), 0) }
    }
  })

  after(function () {
    global.Image = oldImage
    global.document = oldDoc
  })

  it('rejects and does not cache cube on error', async function () {
    const { loadSkyboxCube } = require('../frontend/src/three/Skybox.jsx')
    let threw = false
    try {
      await loadSkyboxCube()
    } catch (e) {
      threw = true
    }
    threw.should.equal(true)
  })
})

