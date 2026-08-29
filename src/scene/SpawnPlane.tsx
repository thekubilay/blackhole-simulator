import type { ThreeEvent } from '@react-three/fiber'
import type * as THREE from 'three'

/** Disk düzleminde (y=0) tık yakalayan görünmez düzlem; sürükleme filtrelenir. */
export function SpawnPlane({ onSpawn }: { onSpawn: (point: THREE.Vector3) => void }) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta <= 6) onSpawn(e.point.clone())
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={handleClick}>
      <planeGeometry args={[120, 120]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}
