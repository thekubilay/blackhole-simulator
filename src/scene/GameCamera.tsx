import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { GameController } from '../game/GameController'
import { useGameSnapshot } from '../hooks/useGameSnapshot'

// Kamera pod'un jeodezik konumuna çapalanır (CAM_H üstünde) ve KENETLENME
// HEDEFİNE bakar: Endurance önde-üstte olduğundan bakış kabaca prograd —
// delik iç kenardan kadraja girer ve battıkça büyür (tehdit çevresel görüşte),
// final yaklaşmada istasyon ekranı doldurur. Ders: deliğe bakan kamera hedefi
// ASLA gösteremiyordu (hedef yakınken hep arkada, uzakken karşı yakada benek).
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
    // konum: pod'un üstü; bakış: Endurance — ikisi de yoksa park pozu
    const podPos = game.podPosition()
    const endPos = game.endurancePosition()
    if (podPos) target.current.set(podPos.x, podPos.y + CAM_H, podPos.z)
    else target.current.copy(POV_FALLBACK)
    // kare hızından bağımsız üstel yumuşatma. Bakış, konumdan daha sıkı:
    // yakın geçişte hedefin açısal hızı yüksek — gevşek bakış (4.5 denendi)
    // Endurance'ı kadraj kenarına kaçırıyor
    const kPos = 1 - Math.exp(-8 * delta)
    const kLook = 1 - Math.exp(-12 * delta)
    camera.position.lerp(target.current, kPos)
    look.current.lerp(endPos ?? POV_TARGET, kLook)
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
