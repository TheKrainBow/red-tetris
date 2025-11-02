const chai = require('chai')
const React = require('react')
const ShallowRenderer = require('react-test-renderer/shallow')

const SkyboxBackground = require('../frontend/src/three/Skybox.jsx').default

chai.should()

describe('SkyboxBackground render structure', function () {
  it('renders Canvas with expected props', function () {
    const r = new ShallowRenderer()
    r.render(React.createElement(SkyboxBackground, { speed: 0.02 }))
    const out = r.getRenderOutput()
    // Some renderers may wrap components; just assert presence of props
    out.props.should.have.property('dpr')
    out.props.should.have.property('camera')
    out.props.should.have.property('gl')
    out.props.should.have.property('style')
    out.props.should.have.property('onCreated')
  })
})
