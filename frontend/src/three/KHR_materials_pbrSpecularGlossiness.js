// Minimal shim for KHR_materials_pbrSpecularGlossiness
// Maps spec-gloss workflow to approximate metal-rough on MeshStandardMaterial
// Supports: diffuseFactor, diffuseTexture, glossinessFactor (roughness approx)
// If anything fails, it degrades gracefully to default material.

import * as THREE from 'three'

// Implemented without using the `this` keyword. The export is a factory
// that returns the object expected by GLTFLoader.register.
export default function KHRMaterialsPbrSpecularGlossiness(parser) {
  const name = 'KHR_materials_pbrSpecularGlossiness'
  const parserRef = parser

  async function extendMaterialParams(materialIndex, materialParams) {
    try {
      const materialDef = parserRef.json.materials?.[materialIndex] || {}
      const ext = materialDef.extensions?.[name]
      if (!ext) return

      // Base color from diffuseFactor
      if (ext.diffuseFactor && Array.isArray(ext.diffuseFactor)) {
        const [r, g, b, a = 1] = ext.diffuseFactor
        materialParams.color = new THREE.Color(r, g, b)
        materialParams.opacity = a
        materialParams.transparent = a < 1 || materialParams.transparent
      }

      // Map diffuse texture if present
      if (ext.diffuseTexture && typeof ext.diffuseTexture.index === 'number') {
        const texture = await parserRef.getDependency('texture', ext.diffuseTexture.index)
        if (texture) {
          texture.colorSpace = THREE.SRGBColorSpace
          materialParams.map = texture
        }
      }

      // Roughness approximation from glossinessFactor (0..1)
      if (typeof ext.glossinessFactor === 'number') {
        const gloss = THREE.MathUtils.clamp(ext.glossinessFactor, 0, 1)
        materialParams.roughness = 1 - gloss
      }

      // Ignore specularFactor/specularGlossinessTexture — acceptable approximation
      materialParams.metalness = 0.0
    } catch (e) {
      // Swallow to avoid breaking load; show one log for debugging
      console.warn('[gltf] spec-gloss extension fallback failed', e)
    }
  }

  return {
    name,
    getMaterialType() { return THREE.MeshStandardMaterial },
    extendMaterialParams,
  }
}
