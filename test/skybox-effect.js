const chai = require('chai')
const path = '../frontend/src/three/Skybox.jsx'

chai.should()

describe('skyboxEffect', function () {
  const oldDoc = global.document
  const oldImage = global.Image

  beforeEach(function () {
    delete require.cache[require.resolve(path)]
    // Minimal canvas mock
    global.document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ translate: () => {}, rotate: () => {}, drawImage: () => {} }) })
    }
  })

  after(function () {
    global.document = oldDoc
    global.Image = oldImage
  })

  it('applies cached cube immediately', async function () {
    const mod = require(path)
    // make successful image loads to populate cache
    let created = 0
    global.Image = class Img { constructor(){ created++ } set crossOrigin(_){} set onload(cb){ this._onload = cb } set src(_){ setTimeout(()=>{ this.width=256; this.height=256; this._onload && this._onload() },0) } }
    await mod.loadSkyboxCube()
    created.should.equal(6)

    const scene = { background: null }
    let called = 0
    const cleanup = mod.skyboxEffect(scene, () => { called++ })
    scene.background.should.be.ok
    called.should.equal(1)
    cleanup()
  })

  it('loads when not cached and respects dispose', async function () {
    const mod = require(path)
    // reset cache
    mod.__resetSkyboxCacheForTests()
    let loaders = 0
    global.Image = class Img { constructor(){ loaders++ } set crossOrigin(_){} set onload(cb){ this._onload = cb } set src(_){ setTimeout(()=>{ this.width=128; this.height=128; this._onload && this._onload() },0) } }

    const scene = { background: null }
    let called = 0
    const cleanup = mod.skyboxEffect(scene, () => { called++ })
    // Dispose before images resolve to test guard
    cleanup()
    await new Promise(r => setTimeout(r, 5))
    // background remains null due to disposal
    chai.expect(scene.background).to.equal(null)

    // Try again without disposing; first attempt has already populated the cache,
    // so no new Image objects should be created.
    const scene2 = { background: null }
    mod.skyboxEffect(scene2, () => { called++ })
    await new Promise(r => setTimeout(r, 5))
    scene2.background.should.be.ok
    loaders.should.equal(6) // still 6; cache used
  })
})
