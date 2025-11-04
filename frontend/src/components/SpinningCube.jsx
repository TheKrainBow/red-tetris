import React, { useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'

function Cube({ textureUrl, rotateSpeed = 0.008 }) {
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
        didInit.current = true
      }
      mesh.current.rotation.y += rotateSpeed
      // mesh.current.rotation.x = 0.50
    }
  })

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  )
}

export default function SpinningCube({ textureUrl, size = 50 }) {
  return (
    <div style={{ width: size, height: size }}>
      <Canvas
        orthographic
        camera={{ position: [2.6, 2.6, 2.6], zoom: 20 }}
        dpr={1}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <ambientLight intensity={1} />
        <Cube textureUrl={textureUrl} />
      </Canvas>
    </div>
  )
}
