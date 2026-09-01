import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { QualityGovernor } from '../sim/QualityGovernor'
import { getBloomPipeline, supportsHdrPost } from './bloom'

/**
 * Bloom hattını süren sürücü. `useFrame`'e 1 önceliği verilmesi R3F'in
 * otomatik `gl.render(scene, camera)` çağrısını KAPATIR (fiber kaynağı:
 * `if (!state.internal.priority && state.gl.render) state.gl.render(...)`),
 * kareyi baştan sona hat çizer. Öncelik 0 olan tüm useFrame'ler (uniform
 * güncellemeleri, simülasyon adımı, kamera) önce koşar — R3F aboneleri
 * önceliğe göre artan sırada çağırır.
 *
 * Parlamanın AÇIK/KAPALI olması kalite kademesinin kararıdır (QualityLevel.bloom):
 * mip zinciri çözünürlükle doğrusal ölçeklenen bir maliyet (retina'da ~4 ms) ve
 * bu sahnede görsel katkısı ölçüm sınırında. Hat yine de kurulur ve kareyi çizer
 * — kapalı olan yalnız zincir; HDR hedefi, birleştirme ve ton eşleme aynı kalır,
 * yani kademe değişiminde çizim yolu değişmez, tek fark parlama katkısıdır.
 */
function BloomDriver({
  governor,
  pin,
  lensScale,
}: {
  governor: QualityGovernor
  pin: boolean | null
  lensScale: number
}) {
  const pipeline = useThree((s) => getBloomPipeline(s.gl))
  // Katmanlı render ölçeği KURULUMDA verilir (bkz. BloomPipeline.lensScale):
  // lens'in uToneMap/katman durumuyla senkron gitmesi gerektiği için çalışma
  // anında değiştirilmez.
  useEffect(() => {
    pipeline.setLensScale(lensScale)
  }, [pipeline, lensScale])
  useEffect(() => {
    if (pin !== null) {
      // ?bloom=0|1 → ölçüm/karşılaştırma pini: kademe kararını ezer
      pipeline.setEnabled(pin)
      return
    }
    pipeline.setEnabled(governor.current.bloom)
    return governor.onChange((level) => pipeline.setEnabled(level.bloom))
  }, [governor, pipeline, pin])
  useFrame(({ scene, camera }) => pipeline.render(scene, camera), 1)
  return null
}

/**
 * HDR hedefi desteklenmiyorsa hiçbir şey bağlanmaz: sürücü mount edilmez,
 * R3F kendi otomatik render'ını sürdürür ve lens shader'ı ton eşlemesini
 * kendi yapar (`uToneMap = 1`). Yani eski davranış birebir korunur.
 * Koşul renderer'ın ömrü boyunca sabittir; kanca sırası değişmez.
 */
export function PostFx({
  governor,
  pin,
  lensScale,
}: {
  governor: QualityGovernor
  pin: boolean | null
  /** lens fonunun çözünürlük ölçeği (?fon=); 1 = tam çözünürlük */
  lensScale: number
}) {
  const enabled = useThree((s) => supportsHdrPost(s.gl))
  return enabled ? <BloomDriver governor={governor} pin={pin} lensScale={lensScale} /> : null
}
