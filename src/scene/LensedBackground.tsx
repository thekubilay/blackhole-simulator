import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { HoleVisual } from '../physics/presets'
import type { LabController } from '../sim/LabController'
import type { QualityGovernor } from '../sim/QualityGovernor'
import { LENS_FRAGMENT, LENS_VERTEX, createLensUniforms, type LensUniforms } from './lensShader'

/** Deliğin gözlenmiş imzasını uniform'lara aktarır — yalnız delik değişince. */
function applyHoleVisual(u: LensUniforms, h: HoleVisual): void {
  u.uDiskThick.value = h.diskThick
  u.uDiskGlow.value = h.diskGlow
  u.uDiskVar.value.set(h.diskVar[0], h.diskVar[1])
  u.uDiskPatch.value.set(h.diskPatch[0], h.diskPatch[1])
  u.uNebColor.value.set(h.nebColor[0], h.nebColor[1], h.nebColor[2])
  u.uNebPar.value.set(h.nebPar[0], h.nebPar[1])
  u.uJetA.value.set(h.jetA[0], h.jetA[1], h.jetA[2], h.jetA[3])
  u.uJetB.value.set(h.jetB[0], h.jetB[1], h.jetB[2], h.jetB[3])
  u.uJetC.value.set(h.jetC[0], h.jetC[1], h.jetC[2], h.jetC[3])
  u.uJetColor.value.set(h.jetColor[0], h.jetColor[1], h.jetColor[2])
}

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
  // son uygulanan görsel imza: preset.visual sabit nesnedir, referans
  // karşılaştırması delik değişimini bedelsiz yakalar
  const appliedVisual = useRef<HoleVisual | null>(null)
  useFrame(({ camera }) => {
    const uniforms = material.current?.uniforms as LensUniforms | undefined
    if (!uniforms) return
    camera.updateMatrixWorld()
    uniforms.uTime.value = controller.simTime
    uniforms.uCamPos.value.copy(camera.position)
    uniforms.uCamMat.value.copy(camera.matrixWorld)
    uniforms.uProjInv.value.copy(camera.projectionMatrixInverse)
    // kaçış yarıçapı jetin ucunu da kapsamalı: yoksa dikey huzme kesilir
    const jetLen = controller.holeVisual.jetA[0] > 0 ? controller.holeVisual.jetB[1] + 4 : 0
    uniforms.uEsc.value = Math.max(44, jetLen, camera.position.length() + 8)
    uniforms.uSteps.value = governor.current.steps
    // deliğe özgü GERÇEK türetimler: disk iç kenarı = ISCO, verim η = 1 − E_ISCO
    uniforms.uDiskIn.value = controller.visual.diskIn
    uniforms.uEff.value = controller.visual.efficiency
    const hv = controller.holeVisual
    if (appliedVisual.current !== hv) {
      appliedVisual.current = hv
      applyHoleVisual(uniforms, hv)
    }
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
