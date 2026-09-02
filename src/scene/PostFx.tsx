import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { QualityGovernor } from '../sim/QualityGovernor'
import type { PowerPolicy } from '../sim/PowerPolicy'
import { getBloomPipeline, supportsHdrPost } from './bloom'
import { BudgetProbe } from './budgetProbe'
import { classifyDevice, persistPowerMode, rendererString, watchBattery, watchPressure } from './powerSensors'

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
  shipMsaa,
  power,
}: {
  governor: QualityGovernor
  pin: boolean | null
  lensScale: number | null
  shipMsaa: boolean
  power: PowerPolicy
}) {
  const gl = useThree((s) => s.gl)
  const pipeline = useThree((s) => getBloomPipeline(s.gl))
  useEffect(() => pipeline.setShipMsaa(shipMsaa), [pipeline, shipMsaa])
  // Açılış bütçe ölçümü: hattı birkaç karede k kez çizdirir, GPU-meşgul süreyi
  // eğimden alır, governor'a kalite TAVANINI koyar (bkz. budgetProbe.ts).
  const probe = useMemo(() => new BudgetProbe(governor, power.budgetMs), [governor, power])
  useEffect(() => {
    // Politika yığını: cihaz sınıfı → varsayılan güç modu; pil ve sistem basıncı
    // sensörleri → politika; politika → probe (bütçe + basınç düşüşü). Bkz.
    // sim/PowerPolicy.ts, scene/powerSensors.ts.
    const { cls, mode } = classifyDevice(rendererString(gl), window.matchMedia('(pointer: coarse)').matches)
    power.setDevice(cls, mode)
    // elle seçilmiş güç modu kalıcıdır (localStorage); cihaz varsayılanından sonra
    // uygulanır ki elle seçim kazansın
    const stopPersist = persistPowerMode(power)
    const apply = () => {
      probe.setBudget(power.budgetMs)
      probe.setExtraDrop(power.extraDrop)
    }
    apply()
    const stopPolicy = power.onChange(apply)
    const stopBattery = watchBattery(power)
    const stopPressure = watchPressure(power)
    if (import.meta.env.DEV) {
      // ölçüm kancaları: `__butce.result/restart()`, `__guc.reportPressure('serious', t)`
      const w = window as unknown as Record<string, unknown>
      w.__butce = probe
      w.__guc = power
    }
    return () => {
      stopPolicy()
      stopPersist()
      stopBattery()
      stopPressure()
    }
  }, [gl, power, probe])
  const size = useMemo(() => new THREE.Vector2(), [])
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
  useFrame(({ scene, camera, gl }, delta) => {
    // delta = bir ÖNCEKİ karenin süresi (rAF aralığı): probe onu önceki karenin
    // tekrar sayısıyla eşler ve bu kare için tekrar sayısını döndürür (çoğu kare 1)
    gl.getDrawingBufferSize(size)
    const repeats = probe.frame(delta, (size.x * size.y) / 1e6)
    pipeline.render(scene, camera, repeats)
  }, 1)
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
  shipMsaa,
  power,
}: {
  governor: QualityGovernor
  pin: boolean | null
  /** ?fon= pini; null ise kalite kademesinin lensScale'i kullanılır */
  lensScale: number | null
  /** ?gemiaa=0 → false: gemi doğrudan tuvale (eski yol, A/B) */
  shipMsaa: boolean
  /** güç politikası: bütçe (ms) + basınç düşüşü; ?butce= pini içinde */
  power: PowerPolicy
}) {
  const enabled = useThree((s) => supportsHdrPost(s.gl))
  return enabled ? (
    <BloomDriver governor={governor} pin={pin} lensScale={lensScale} shipMsaa={shipMsaa} power={power} />
  ) : null
}
