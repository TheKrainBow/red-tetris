const chai = require('chai')
const { updatePanCamera } = require('../frontend/src/three/Skybox.jsx')

chai.should()

describe('updatePanCamera', function () {
  it('updates yaw and sets camera transforms', function () {
    const yaw = { current: 0 }
    const calls = { pos: [], rot: [] }
    const camera = {
      position: { set: (...a) => calls.pos.push(a) },
      rotation: { set: (...a) => calls.rot.push(a) }
    }
    updatePanCamera(yaw, camera, 0.5, 0.2) // adds 0.1
    yaw.current.should.be.closeTo(0.1, 1e-6)
    calls.pos.length.should.equal(1)
    calls.rot.length.should.equal(1)
    calls.pos[0].should.deep.equal([0,0,0])
    calls.rot[0][0].should.equal(0)
    calls.rot[0][2].should.equal(0)
  })
})

