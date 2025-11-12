import React, { useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

function Cube({ textureUrl, rotateSpeed, speedX = 0, speedY = 0.008, scale = 1 }) {
  const mesh = useRef()
  const texture = useLoader(THREE.TextureLoader, textureUrl)
  // Pixelated look and disable mipmaps for crispness
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false

  const didInit = useRef(false)
  useFrame(() => {
    if (mesh.current) {
      if (!didInit.current) {
        mesh.current.rotation.y = 0.35
        // Apply scale once to avoid clipping in tight containers (e.g., dropdowns)
        mesh.current.scale.set(scale, scale, scale)
        didInit.current = true
      }
      const ry = rotateSpeed !== undefined ? rotateSpeed : speedY
      mesh.current.rotation.y += ry
      if (speedX) mesh.current.rotation.x += speedX
    }
  })

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  )
}

export default function SpinningCube({ textureUrl, size = 50, speedX = 0, speedY = 0.008, rotateSpeed, scale = 1 }) {
  return (
    <div style={{ width: size, height: size }}>
      <Canvas
        orthographic
        camera={{ position: [2.6, 2.6, 2.6], zoom: 20 }}
        dpr={1}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false, stencil: false, depth: true }}
        frameloop="always"
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <ambientLight intensity={1} />
        <Cube textureUrl={textureUrl} speedX={speedX} speedY={speedY} rotateSpeed={rotateSpeed} scale={scale} />
      </Canvas>
    </div>
  )
}
