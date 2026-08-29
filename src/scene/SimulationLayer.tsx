import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { LabController } from '../sim/LabController'

/**
 * Simülasyonu her karede ilerletir (öncelik -2: kontroller ve uniform
 * kopyalarından önce) ve motorun kök grubunu sahneye bağlar. Kor parçacık
 * boyutları için piksel ölçeğini simülasyona bildirir.
 */
export function SimulationLayer({ controller }: { controller: LabController }) {
  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera
    const scaleH = 0.5 * cam.projectionMatrix.elements[5] * state.size.height * state.viewport.dpr
    controller.sim.setEmberScale(scaleH)
    controller.advance(delta)
  }, -2)
  return <primitive object={controller.sim.root} />
}
