import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import type { HoleVisual } from '../physics/presets'
import type { LabController } from '../sim/LabController'
import type { QualityGovernor } from '../sim/QualityGovernor'
import { LENS_FRAGMENT, LENS_VERTEX, createLensUniforms, type LensUniforms } from './lensShader'
import { LENS_LAYER, getBloomPipeline, supportsHdrPost } from './bloom'
import { getNebulaCube } from './nebulaBake'
import { getNoiseLattice } from './noiseBake'
import { getLensTables } from './lensTables'

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
  tables,
  b2,
}: {
  controller: LabController
  governor: QualityGovernor
  /** false = tablo yolu kapalı, her ışın eski marşa girer (?tablo=0 — A/B ölçümü) */
  tables: boolean
  /** true = disk kesişimleri de tablodan, marş yalnız jet için (?b2=0 kapatır) */
  b2: boolean
}) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const gl = useThree((s) => s.gl)
  // Bulutsu alanı zamandan bağımsızdır: renderer başına BİR KEZ küp haritasına
  // pişirilir (getNebulaCube önbelleklidir), sonra her karede tek doku
  // okumasıyla gelir — eskiden piksel başına 7 oktav 3B gürültüydü.
  //
  // HDR yolu açıkken lens DOĞRUSAL HDR yazar (uToneMap 0) ve ayrı bir katmana
  // çekilir: hat yalnız o katmanı HDR hedefe çizip parlamayı ondan üretir.
  // Kapalıyken mesh normal katmanda kalır ve shader kendi ton eşlemesini yapar.
  //
  // Bu artık cihaz yeteneğine bağlı SABİT bir seçim değil: kalite kademesi
  // parlamayı kapatınca hat bütünüyle devre dışı kalır (ölçüm: 2.89 Mpix'te
  // 2.0 ms — bkz. bloom.ts render()). Kararın sahibi hattır, biz her karede
  // usesTarget'ı okur ve materyali ona uydururuz. SIRALAMA TUZAĞI YOK: hat
  // kademe değişimini o an uygulamaz, çizdiği karenin SONUNDA işler
  // (bkz. setEnabled/commit) — yani bu useFrame ile hattın render'ı bir kare
  // içinde daima aynı değeri görür. Uygulanmasaydı geçiş karesinde mesh yanlış
  // katmanda kalıp lens hiç çizilmezdi: tek karelik siyah ekran.
  const pipeline = useMemo(() => (supportsHdrPost(gl) ? getBloomPipeline(gl) : null), [gl])
  const initialUniforms = useMemo(() => {
    const uniforms = createLensUniforms()
    uniforms.uNebTex.value = getNebulaCube(gl)
    // hash12 kafesi de renderer başına bir kez pişer (~8 MB, tek çizim):
    // disk/atmosfer gürültüsü 88 hash yerine 22 doku tap'iyle, alan birebir aynı
    uniforms.uNoiseTex.value = getNoiseLattice(gl)
    uniforms.uToneMap.value = pipeline?.usesTarget ? 0 : 1
    // Tablolar sahneden bağımsız: süreç başına bir kez pişer (~175 ms, açılış
    // dolly'si sırasında). Bulutsu küpünün aksine renderer'a değil modüle ait.
    const lt = getLensTables()
    uniforms.uDeflTex.value = lt.deflection
    // 𝕌 tablosu YALNIZ B2 açıkken pişirilir (tembel getter): ?b2=0 ile
    // kapatıldığında kimse örneklemiyor ve pişirmesi açılışta ~120 ms yiyor.
    if (b2) uniforms.uInvRTex.value = lt.inverseRadius
    return uniforms
  }, [gl, pipeline, b2])
  // son uygulanan görsel imza: preset.visual sabit nesnedir, referans
  // karşılaştırması delik değişimini bedelsiz yakalar
  const appliedVisual = useRef<HoleVisual | null>(null)
  // DEV ölçüm kancası; kimliği sabit kalsın diye ref'te tutulur (aşağıya bak)
  const devHook = useRef<{ b2?: number; time?: number; probe?: number; uniforms?: LensUniforms }>({})
  useFrame(({ camera }) => {
    const uniforms = material.current?.uniforms as LensUniforms | undefined
    if (!uniforms) return
    const hdrPath = pipeline?.usesTarget ?? false
    uniforms.uToneMap.value = hdrPath ? 0 : 1
    mesh.current?.layers.set(hdrPath ? LENS_LAYER : 0)
    camera.updateMatrixWorld()
    uniforms.uTime.value = controller.simTime
    uniforms.uCamPos.value.copy(camera.position)
    uniforms.uCamMat.value.copy(camera.matrixWorld)
    uniforms.uProjInv.value.copy(camera.projectionMatrixInverse)
    // kaçış yarıçapı jetin ucunu da kapsamalı: yoksa dikey huzme kesilir.
    // Jet yalnız gerçekçi modda çizilir; kapı SOLAN uniform değerine bakar ki
    // moddan çıkarken jet ucu kırpılmadan sönsün, sanatsalda pay ödenmesin
    const jetLen =
      uniforms.uRealism.value > 0 && controller.holeVisual.jetA[0] > 0
        ? controller.holeVisual.jetB[1] + 4
        : 0
    uniforms.uEsc.value = Math.max(44, jetLen, camera.position.length() + 8)
    uniforms.uSteps.value = governor.current.steps
    uniforms.uTables.value = tables ? 1 : 0
    uniforms.uB2.value = b2 ? 1 : 0
    if (import.meta.env.DEV) {
      // Ölçüm kancası (__bloom / __lab ile aynı desen). GÖRSEL A/B'nin TEK
      // dürüst yolu: ?b2=0 sayfayı yeniler, yenileme hem simTime'ı hem dolly
      // kamerasını kaydırır ve iki kare piksel piksel karşılaştırılamaz.
      // `__lens.b2 = 0` ise AYNI karede, aynı zaman ve kamerayla tablo yolunu
      // marşla yan yana koyar. TERS YÖN KAPALI: ?b2=0 ile açılan oturumda 𝕌
      // dokusu hiç pişmemiştir (tembel getter), b2'yi elle açmak boş
      // sampler'dan okutur — o yüzden yalnız doku varsa 1'e izin verilir.
      // Nesne KARE BAŞINA YENİDEN KURULMAZ: ölçüm yaparken çöp üretmesin.
      const w = window as unknown as Record<string, unknown>
      const dev = devHook.current
      if (w.__lens !== dev) w.__lens = dev
      if (dev.b2 !== undefined && (dev.b2 < 0.5 || uniforms.uInvRTex.value)) {
        uniforms.uB2.value = dev.b2
      }
      // `__lens.time = <sayı>` diski dondurur. A/B'nin ŞARTI: disk sürekli
      // döndüğü için iki ardışık kare kendiliğinden %31 piksel farkı verir ve
      // yol farkı o gürültünün altında kaybolur.
      if (dev.time !== undefined) uniforms.uTime.value = dev.time
      // `__lens.probe = 1..10` bütçe kalemlerini tek tek kapatır (lensShader PROBE)
      uniforms.uProbe.value = dev.probe ?? 0
      dev.uniforms = uniforms
    }
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
    <mesh ref={mesh} renderOrder={-10} frustumCulled={false}>
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
