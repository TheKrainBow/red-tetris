import React, { useRef, Suspense, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CubeTextureLoader, LinearFilter, SRGBColorSpace, Color } from 'three'

// Order required by Three.js: [px, nx, py, ny, pz, nz]
// Mapping from your images: right=1, left=3, up=5, down=4, front=2, back=0
const FACE_FILES = [
  '1.21.9_panorama_2.png', // px (right)
  '1.21.9_panorama_0.png', // nx (left)
  '1.21.9_panorama_4.png', // py (up/sky)
  '1.21.9_panorama_5.png', // ny (down/ground)
  '1.21.9_panorama_1.png', // pz (front)
  '1.21.9_panorama_3.png', // nz (back)
]

function SkyboxLoader() {
  const { scene } = useThree()
  // Debug: quickly verify files are reachable from dev server
  useEffect(() => {
    const urls = ['0','1','2','3','4','5'].map(i => `/main_menu/1.21.9_panorama_${i}.png`)
    urls.forEach(u => {
      fetch(u, { method: 'GET' })
        .then(r => console.log('[skybox] fetch', u, r.status))
        .catch(e => console.warn('[skybox] fetch error', u, e?.message))
    })
  }, [])

  useEffect(() => {
    let disposed = false
    const loader = new CubeTextureLoader().setPath('/main_menu/')
    loader.load(
      FACE_FILES,
      (tex) => {
        if (disposed) return
        tex.colorSpace = SRGBColorSpace
        tex.minFilter = LinearFilter
        tex.magFilter = LinearFilter
        tex.generateMipmaps = false
        scene.background = tex
      },
      undefined,
      (err) => {
        if (disposed) return
        console.error('[skybox] cube load error', err)
        scene.background = new Color(0x000000)
      }
    )
    return () => { disposed = true }
  }, [scene])
  return null
}

function PanCamera({ speed = 0.05 }) {
  const yaw = useRef(0)
  useFrame(({ camera }, dt) => {
    yaw.current += (dt || 0) * speed
    camera.position.set(0, 0, 0)
    camera.rotation.set(0, yaw.current, 0)
  })
  return null
}

export default function SkyboxBackground({ speed = 0.05 }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 75, near: 0.1, far: 10000, position: [0, 0, 0] }}
      gl={{ powerPreference: 'high-performance', antialias: true, alpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      onCreated={({ gl }) => {
        try {
          gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
          const el = gl.domElement
          el.addEventListener('webglcontextlost', (e) => {
            console.warn('[skybox] WebGL context lost')
          })
          el.addEventListener('webglcontextrestored', () => {
            console.warn('[skybox] WebGL context restored')
          })
        } catch (_) {}
      }}
    >
      <Suspense fallback={null}>
        <SkyboxLoader />
        <PanCamera speed={speed} />
      </Suspense>
    </Canvas>
  )
}
