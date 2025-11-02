const chai = require('chai')
const { setupWebGLCanvas } = require('../frontend/src/three/Skybox.jsx')

chai.should()

describe('setupWebGLCanvas', function () {
  it('sets pixel ratio and attaches listeners', function () {
    const events = {}
    const fakeGL = {
      setPixelRatio: () => {},
      domElement: { addEventListener: (name, cb) => { events[name] = cb } }
    }
    const fakeWin = { devicePixelRatio: 2 }
    setupWebGLCanvas(fakeGL, fakeWin)
    Object.keys(events).should.include('webglcontextlost')
    Object.keys(events).should.include('webglcontextrestored')
  })
})
