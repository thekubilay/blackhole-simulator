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
  lensScale: number | null
}) {
  const pipeline = useThree((s) => getBloomPipeline(s.gl))
  // Parlama ve katmanlı render ölçeğinin ikisi de kalite kademesinden gelir;
  // pinler (?bloom=, ?fon=) kademe kararını ezer. Hat bu isteklerin ikisini de
  // kare SONUNDA işler (BloomPipeline.commit) — geçiş karesinde lens'in
  // uToneMap/katman durumuyla çizilen yol asla ayrışmaz.
  useEffect(() => {
    const uygula = (level: { bloom: boolean; lensScale: number }) => {
      pipeline.setEnabled(pin !== null ? pin : level.bloom)
      pipeline.setLensScale(lensScale !== null ? lensScale : level.lensScale)
    }
    uygula(governor.current)
    return governor.onChange(uygula)
  }, [governor, pipeline, pin, lensScale])
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
  /** ?fon= pini; null ise kalite kademesinin lensScale'i kullanılır */
  lensScale: number | null
}) {
  const enabled = useThree((s) => supportsHdrPost(s.gl))
  return enabled ? <BloomDriver governor={governor} pin={pin} lensScale={lensScale} /> : null
}
