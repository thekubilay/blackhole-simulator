import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { GameController } from '../game/GameController'
import { useGameSnapshot } from '../hooks/useGameSnapshot'

// POV park pozu: disk düzleminin hemen üstü, bakış DÜMDÜZ yatay (pitch = 0) —
// ufuk çizgisi ekran ortasında, disk altımızdan akar (kullanıcının referans
// karesi). DİKKAT: r≲4'te gölge tüm gökyüzünü kaplar (siyah ekran, fiziksel
// olarak doğru) — parkı o bölgeye indirme. İleride pod'un jeodezik (r, φ)
// durumuna çapalanacak; şimdilik sabit rampa hedefi.
const POV_POS = new THREE.Vector3(0, 0.32, 9.5)
const POV_TARGET = new THREE.Vector3(0, 0.32, 0)

/**
 * Oyun modunda kamerayı devralır ve POV pozuna yumuşakça taşır. OrbitControls
 * oyun boyunca App tarafından `enabled={false}` yapılır; çıkışta buradaki
 * controls.reset() lab görünümünü geri getirir (CameraRewind ile aynı desen).
 */
export function GameCamera({ game }: { game: GameController }) {
  const active = useGameSnapshot(game).active
  const controls = useThree((s) => s.controls) as { reset?: () => void } | null
  const camera = useThree((s) => s.camera)
  const look = useRef(new THREE.Vector3())
  const wasActive = useRef(false)

  useEffect(() => {
    if (active) {
      // yumuşak geçiş mevcut bakış yönünden başlasın
      camera.getWorldDirection(look.current)
      look.current.multiplyScalar(camera.position.length()).add(camera.position)
    } else if (wasActive.current) {
      controls?.reset?.()
    }
    wasActive.current = active
  }, [active, controls, camera])

  useFrame((_, delta) => {
    if (!active) return
    // kare hızından bağımsız üstel yumuşatma
    const k = 1 - Math.exp(-2.5 * delta)
    camera.position.lerp(POV_POS, k)
    look.current.lerp(POV_TARGET, k)
    camera.lookAt(look.current)
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__gameCam = {
        p: camera.position.toArray(),
        l: look.current.toArray(),
      }
    }
  })

  return null
}
