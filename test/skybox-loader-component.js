const chai = require('chai')
const proxyquire = require('proxyquire')

chai.should()

describe('SkyboxLoader component', function () {
  const oldDoc = global.document
  const oldImage = global.Image

  it('invokes effect with scene and onReady when cache is warm', async function () {
    // Fake React that executes useEffect immediately and exposes cleanup
    let cleanup
    const fakeReact = {
      createElement: () => null,
      useEffect: (cb) => { cleanup = cb() },
      useRef: (v) => ({ current: v })
    }
    const fakeScene = { background: null }
    const stubs = {
      react: fakeReact,
      '@react-three/fiber': {
        useThree: () => ({ scene: fakeScene }),
        useFrame: () => {},
        Canvas: function Canvas() { return null },
        __esModule: true
      }
    }

    delete require.cache[require.resolve('../frontend/src/three/Skybox.jsx')]
    const mod = proxyquire('../frontend/src/three/Skybox.jsx', stubs)

    // Prepare cache by making images load instantly
    global.document = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ translate: () => {}, rotate: () => {}, drawImage: () => {} }) })
    }
    global.Image = class Img {
      set crossOrigin(_) {}
      set onload(cb) { this._onload = cb }
      set src(_) { setTimeout(() => { this.width = 16; this.height = 16; this._onload && this._onload() }, 0) }
    }
    await mod.loadSkyboxCube()

    let ready = 0
    // Call component function (our fake useEffect will trigger skyboxEffect immediately)
    mod.SkyboxLoader({ onReady: () => { ready++ } })
    // Allow microtasks to flush
    await new Promise(r => setTimeout(r, 5))

    ready.should.equal(1)
    chai.expect(fakeScene.background).to.exist
    chai.expect(typeof cleanup).to.equal('function')

    // Cleanup
    cleanup && cleanup()
    global.document = oldDoc
    global.Image = oldImage
  })
})

