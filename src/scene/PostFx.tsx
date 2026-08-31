import { useFrame, useThree } from '@react-three/fiber'
import { getBloomPipeline, supportsHdrPost } from './bloom'

/**
 * Bloom hattını süren sürücü. `useFrame`'e 1 önceliği verilmesi R3F'in
 * otomatik `gl.render(scene, camera)` çağrısını KAPATIR (fiber kaynağı:
 * `if (!state.internal.priority && state.gl.render) state.gl.render(...)`),
 * kareyi baştan sona hat çizer. Öncelik 0 olan tüm useFrame'ler (uniform
 * güncellemeleri, simülasyon adımı, kamera) önce koşar — R3F aboneleri
 * önceliğe göre artan sırada çağırır.
 */
function BloomDriver() {
  const pipeline = useThree((s) => getBloomPipeline(s.gl))
  useFrame(({ scene, camera }) => pipeline.render(scene, camera), 1)
  return null
}

/**
 * HDR hedefi desteklenmiyorsa hiçbir şey bağlanmaz: sürücü mount edilmez,
 * R3F kendi otomatik render'ını sürdürür ve lens shader'ı ton eşlemesini
 * kendi yapar (`uToneMap = 1`). Yani eski davranış birebir korunur.
 * Koşul renderer'ın ömrü boyunca sabittir; kanca sırası değişmez.
 */
export function PostFx() {
  const enabled = useThree((s) => supportsHdrPost(s.gl))
  return enabled ? <BloomDriver /> : null
}
