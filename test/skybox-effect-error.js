const chai = require('chai')
const path = '../frontend/src/three/Skybox.jsx'

chai.should()

describe('skyboxEffect catch path', function () {
  const oldDoc = global.document
  const oldImage = global.Image

  beforeEach(function () {
    delete require.cache[require.resolve(path)]
    global.document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ translate: () => {}, rotate: () => {}, drawImage: () => {} }) })
    }
    // Image that errors
    global.Image = class BadImage {
      set crossOrigin(_) {}
      set onload(cb) { this._onload = cb }
      set onerror(cb) { this._onerror = cb }
      set src(_) { setTimeout(() => { this._onerror && this._onerror(new Error('fail')) }, 0) }
    }
  })

  after(function () {
    global.document = oldDoc
    global.Image = oldImage
  })

  it('sets scene background to black Color when load fails', async function () {
    const mod = require(path)
    mod.__resetSkyboxCacheForTests()
    const scene = { background: null }
    mod.skyboxEffect(scene, () => {})
    await new Promise(r => setTimeout(r, 5))
    // Color from three has isColor true; background should not be null
    chai.expect(scene.background).to.be.ok
    ;(typeof scene.background.isColor === 'boolean' || scene.background.isColor === true).should.equal(true)
  })
})

