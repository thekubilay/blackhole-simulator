import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'

/**
 * Ufuk + gölge örtücüleri: raster geçişi nesneleri düz ışınla çizer, ama
 * deliğin ARKASINDAN gelen ve etki parametresi < ~2.6 rs olan ışık yakalanır —
 * kameraya bakan görünmez disk tam o nesneleri gizler, ön taraftakiler görünür.
 * colorWrite kapalı: yalnız derinlik yazarlar.
 */
export function HorizonOccluders() {
  const shadowDisk = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => {
    shadowDisk.current?.lookAt(camera.position)
  })
  return (
    <>
      <mesh renderOrder={-5}>
        {/* 1.0003: ufku sıyıran yörüngeler örtücünün içinde kaybolmasın */}
        <sphereGeometry args={[1.0003, 48, 32]} />
        <meshBasicMaterial colorWrite={false} />
      </mesh>
      <mesh ref={shadowDisk} renderOrder={-5}>
        <circleGeometry args={[2.55, 64]} />
        <meshBasicMaterial colorWrite={false} />
      </mesh>
    </>
  )
}
