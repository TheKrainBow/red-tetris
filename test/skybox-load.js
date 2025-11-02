const chai = require('chai')
const { loadSkyboxCube } = require('../frontend/src/three/Skybox.jsx')
const { CubeTexture } = require('three')

chai.should()

describe('Skybox loader cache', function () {
  let created = 0
  const oldImage = global.Image
  const oldDoc = global.document

  before(function () {
    // Minimal canvas + 2d context mock
    global.document = {
      createElement: (tag) => {
        if (tag !== 'canvas') throw new Error('expected canvas')
        return {
          width: 0,
          height: 0,
          getContext: () => ({ translate: () => {}, rotate: () => {}, drawImage: () => {} })
        }
      }
    }
    // Fake Image that immediately loads
    global.Image = class FakeImage {
      constructor () { created++ }
      set crossOrigin(_) {}
      set onload(cb) { this._onload = cb }
      set onerror(cb) { this._onerror = cb }
      set src(_) {
        // simulate async load
        setTimeout(() => {
          if (this._onload) {
            this.width = 256; this.height = 256
            this._onload()
          }
        }, 0)
      }
    }
  })

  after(function () {
    global.Image = oldImage
    global.document = oldDoc
  })

  it('loads cube once and caches subsequent calls', async function () {
    const c1 = await loadSkyboxCube()
    ;(c1 instanceof CubeTexture).should.equal(true)
    created.should.equal(6) // six faces

    const before = created
    const c2 = await loadSkyboxCube()
    c2.should.equal(c1)
    created.should.equal(before)
  })
})

