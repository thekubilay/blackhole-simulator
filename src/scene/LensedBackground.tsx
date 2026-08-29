import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { LabController } from '../sim/LabController'
import type { QualityGovernor } from '../sim/QualityGovernor'
import { LENS_FRAGMENT, LENS_VERTEX, createLensUniforms, type LensUniforms } from './lensShader'

/**
 * Piksel başına geriye ışın izleme yapılan tam ekran arka plan.
 * renderOrder -10 + depthTest kapalı: her şeyin arkasına çizilir.
 */
export function LensedBackground({
  controller,
  governor,
}: {
  controller: LabController
  governor: QualityGovernor
}) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const initialUniforms = useMemo(() => createLensUniforms(), [])
  useFrame(({ camera }) => {
    const uniforms = material.current?.uniforms as LensUniforms | undefined
    if (!uniforms) return
    camera.updateMatrixWorld()
    uniforms.uTime.value = controller.simTime
    uniforms.uCamPos.value.copy(camera.position)
    uniforms.uCamMat.value.copy(camera.matrixWorld)
    uniforms.uProjInv.value.copy(camera.projectionMatrixInverse)
    uniforms.uEsc.value = Math.max(44, camera.position.length() + 8)
    uniforms.uSteps.value = governor.current.steps
    // deliğe özgü GERÇEK türetimler: disk iç kenarı = ISCO, verim η = 1 − E_ISCO
    uniforms.uDiskIn.value = controller.visual.diskIn
    uniforms.uEff.value = controller.visual.efficiency
    // görsel moda yumuşak geçiş (0 ↔ 1 arası 0.35 s ease)
    const target = controller.visual.realism
    uniforms.uRealism.value += (target - uniforms.uRealism.value) * 0.12
    if (Math.abs(uniforms.uRealism.value - target) < 0.002) uniforms.uRealism.value = target
  })
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        vertexShader={LENS_VERTEX}
        fragmentShader={LENS_FRAGMENT}
        uniforms={initialUniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}
