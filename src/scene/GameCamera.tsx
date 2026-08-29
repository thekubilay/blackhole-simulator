import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { GameController } from '../game/GameController'
import { useGameSnapshot } from '../hooks/useGameSnapshot'

// Kamera pod'un jeodezik konumuna çapalanır: CAM_H üstünde, bakış DÜMDÜZ
// yatay (pitch = 0) hedefe — ufuk çizgisi ekran ortasında, disk altımızdan
// akar (kullanıcının referans karesi). Pod alçaldıkça gölge büyür; r≲4'te
// gökyüzünü kaplar (fiziksel olarak doğru) — ISCO ölümünün doğal karartması.
const CAM_H = 0.3
const POV_FALLBACK = new THREE.Vector3(0, CAM_H, 9.5)
const POV_TARGET = new THREE.Vector3(0, CAM_H, 0)

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
  const target = useRef(new THREE.Vector3())
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
    // hedef: pod'un üstü; pod yoksa (kurulum arası) park pozu
    const podPos = game.podPosition()
    if (podPos) target.current.set(podPos.x, podPos.y + CAM_H, podPos.z)
    else target.current.copy(POV_FALLBACK)
    // kare hızından bağımsız üstel yumuşatma — takip sıkı (4.5), yörünge
    // hareketinde yüzme hissi bırakmayacak kadar hızlı ama giriş geçişi yumuşak
    const k = 1 - Math.exp(-4.5 * delta)
    camera.position.lerp(target.current, k)
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
