const { expect } = require('chai')

describe('KHR_materials_pbrSpecularGlossiness shim', () => {
  it('maps diffuse and glossiness to standard params', async () => {
    const makeTex = () => ({ colorSpace: null })
    const parser = {
      json: {
        materials: [
          { extensions: { KHR_materials_pbrSpecularGlossiness: {
            diffuseFactor: [0.2, 0.4, 0.6, 0.5],
            diffuseTexture: { index: 0 },
            glossinessFactor: 0.25,
          } } }]
      },
      async getDependency(kind, idx) { return makeTex() },
    }
    const extFactory = require('../frontend/src/three/KHR_materials_pbrSpecularGlossiness.js').default
    const ext = extFactory(parser)
    const params = {}
    await ext.extendMaterialParams(0, params)
    expect(params).to.have.property('map')
    expect(params).to.have.property('roughness')
    expect(params.metalness).to.equal(0)
    expect(params.transparent).to.equal(true)
  })
})

