import React, { useRef, Suspense, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CubeTexture, LinearFilter, SRGBColorSpace, Color } from 'three'

// Order required by Three.js: [px, nx, py, ny, pz, nz]
// Mapping from your images: right=1, left=3, up=5, down=4, front=2, back=0
// Keep the sides in the exact order you validated earlier.
// We will rotate top (py) and bottom (ny) by +/- 90° programmatically.
const FACE_FILES = [
  '1.21.9_panorama_2.png', // px (right)
  '1.21.9_panorama_0.png', // nx (left)
  '1.21.9_panorama_4.png', // py (up/sky)
  '1.21.9_panorama_5.png', // ny (down/ground)
  '1.21.9_panorama_1.png', // pz (front)
  '1.21.9_panorama_3.png', // nz (back)
]

// Cache the loaded cube texture across mounts to avoid flashing reloads
let cachedCube = null
let cachedPromise = null

export function loadSkyboxCube() {
  if (cachedCube) return Promise.resolve(cachedCube)
  if (cachedPromise) return cachedPromise

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = (e) => reject(e)
      img.src = '/main_menu/' + src
    })
  }

  function rotateImage(img, angleRad) {
    if (!angleRad) return img
    const c = document.createElement('canvas')
    const s = Math.max(img.width, img.height)
    c.width = s; c.height = s
    const ctx = c.getContext('2d')
    ctx.translate(s/2, s/2)
    ctx.rotate(angleRad)
    ctx.drawImage(img, -img.width/2, -img.height/2)
    return c
  }

  cachedPromise = Promise.all(FACE_FILES.map(loadImage))
    .then(([px, nx, py, ny, pz, nz]) => {
      // Rotate top (py) 90° CW and bottom (ny) 90° CCW to align seams
      const pyR = rotateImage(py, Math.PI / 2)
      const nyR = rotateImage(ny, -Math.PI / 2)

      const cube = new CubeTexture([px, nx, pyR, nyR, pz, nz])
      cube.colorSpace = SRGBColorSpace
      cube.minFilter = LinearFilter
      cube.magFilter = LinearFilter
      cube.generateMipmaps = false
      cube.needsUpdate = true
      cachedCube = cube
      return cube
    })
    .catch(err => {
      console.error('[skybox] load error', err)
      cachedCube = null
      throw err
    })

  return cachedPromise
}

// Exposed for tests: runs the effect logic once.
export function skyboxEffect(scene, onReady) {
  let disposed = false
  if (cachedCube) {
    scene.background = cachedCube
    onReady && onReady()
    return () => { disposed = true }
  }
  loadSkyboxCube()
    .then((cube) => { if (disposed) return; scene.background = cube; onReady && onReady() })
    .catch(err => { if (disposed) return; console.error('[skybox] manual cube build error', err); scene.background = new Color(0x000000) })
  return () => { disposed = true }
}

export function __resetSkyboxCacheForTests() { cachedCube = null; cachedPromise = null }

function SkyboxLoader({ onReady }) {
  const { scene } = useThree()

  useEffect(() => {
    return skyboxEffect(scene, onReady)
  }, [scene])
  return null
}

export function updatePanCamera(yawRef, camera, dt, speed) {
  yawRef.current += (dt || 0) * speed
  camera.position.set(0, 0, 0)
  camera.rotation.set(0, yawRef.current, 0)
}

function PanCamera({ speed = 0.05 }) {
  const yaw = useRef(0)
  useFrame(({ camera }, dt) => {
    updatePanCamera(yaw, camera, dt, speed)
  })
  return null
}

export function setupWebGLCanvas(gl, win = typeof window !== 'undefined' ? window : undefined) {
  try {
    if (win) gl.setPixelRatio(Math.min(win.devicePixelRatio || 1, 1.5))
    const el = gl.domElement
    el.addEventListener('webglcontextlost', () => { console.warn('[skybox] WebGL context lost') })
    el.addEventListener('webglcontextrestored', () => { console.warn('[skybox] WebGL context restored') })
  } catch (_) {}
}

export default function SkyboxBackground({ speed = 0.05, onReady }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 75, near: 0.1, far: 10000, position: [0, 0, 0] }}
      gl={{ powerPreference: 'high-performance', antialias: true, alpha: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, backgroundColor: '#000' }}
      onCreated={({ gl }) => setupWebGLCanvas(gl)}
    >
      <Suspense fallback={null}>
        <SkyboxLoader onReady={onReady} />
        <PanCamera speed={speed} />
      </Suspense>
    </Canvas>
  )
}
