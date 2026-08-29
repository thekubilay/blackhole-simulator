import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'

export function Lights() {
  const headlamp = useRef<THREE.DirectionalLight>(null)
  useFrame(({ camera }) => {
    headlamp.current?.position.copy(camera.position)
  })
  return (
    <>
      <ambientLight color={0x4a5068} intensity={2.4} />
      <pointLight color={0xff9a50} intensity={750} distance={0} decay={2} position={[0, 0.05, 0]} />
      <directionalLight color={0x8090c0} intensity={0.7} position={[-4, 6, 8]} />
      <directionalLight ref={headlamp} color={0xfff2e0} intensity={0.85} />
    </>
  )
}
