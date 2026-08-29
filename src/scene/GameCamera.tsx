import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { END_VIS_LIFT, type GameController } from '../game/GameController'
import { useGameSnapshot } from '../hooks/useGameSnapshot'

// Kamera pod'un jeodezik konumuna çapalanır (CAM_H üstünde) ve KENETLENME
// HEDEFİNİN GÖRSELİNE bakar: Endurance modeli END_VIS_LIFT kadar yukarı
// kaldırılmıştır — istasyon ufkun üstünde süzülür, halkanın ALT yüzünü
// görürüz (alttan kenetlenme, film gibi). Ders 1: deliğe bakan kamera
// hedefi asla gösteremiyordu. Ders 2: kamerayı düzlemin ALTINA indirmek
// (CAM_H<0) "bulutun altı" demek — disk üst yarıyı kaplıyor, dünya ters.
const CAM_H = 0.3
const POV_FALLBACK = new THREE.Vector3(0, CAM_H, 9.5)
const POV_TARGET = new THREE.Vector3(0, CAM_H, 0)
const HOLE_CENTER = new THREE.Vector3(0, 0, 0)
const liftTmp = new THREE.Vector3()
/** POV serbest bakış: fare merkezden kenara gidince her eksende görüş
 * alanının bu oranı kadar bakınılır (kullanıcı isteği: her yöne %30) */
const LOOK_FRAC = 0.3

/**
 * Oyun modunda kamerayı devralır ve POV pozuna yumuşakça taşır. OrbitControls
 * oyun boyunca App tarafından `enabled={false}` yapılır; çıkışta buradaki
 * controls.reset() lab görünümünü geri getirir (CameraRewind ile aynı desen).
 */
export function GameCamera({ game }: { game: GameController }) {
  const snap = useGameSnapshot(game)
  const active = snap.active
  const phase = snap.phase
  const controls = useThree((s) => s.controls) as { reset?: () => void } | null
  const camera = useThree((s) => s.camera)
  const look = useRef(new THREE.Vector3())
  const target = useRef(new THREE.Vector3())
  const wasActive = useRef(false)
  const mouse = useRef({ x: 0, y: 0 }) // hedef bakınma (normalize −1..1)
  const sway = useRef({ x: 0, y: 0 }) // yumuşatılmış bakınma

  useEffect(() => {
    if (!active) return undefined
    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [active])

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
    // oyun sonu: dünya donuk, kamera olduğu yerde kalır (son kare fotoğraf) —
    // özellikle ISCO plonjonundan sonra bakış Endurance'a GERİ dönmemeli
    if (phase === 'docked' || phase === 'failed') return
    // konum: pod'un üstü; bakış: Endurance — ikisi de yoksa park pozu.
    // Plonjonda ('dying') bakış DELİK MERKEZİNE kilitlenir: pod spiral atarken
    // gölge merkezde büyür — "dönüyorum" değil "içine düşüyorum" okunur,
    // ekran fiziksel olarak simsiyaha gider.
    const podPos = game.podPosition()
    const endPos = phase === 'dying' ? HOLE_CENTER : game.endurancePosition()
    if (podPos) target.current.set(podPos.x, podPos.y + CAM_H, podPos.z)
    else target.current.copy(POV_FALLBACK)
    // kare hızından bağımsız üstel yumuşatma. Bakış, konumdan daha sıkı:
    // yakın geçişte hedefin açısal hızı yüksek — gevşek bakış (4.5 denendi)
    // Endurance'ı kadraj kenarına kaçırıyor
    const kPos = 1 - Math.exp(-8 * delta)
    const kLook = 1 - Math.exp(-12 * delta)
    camera.position.lerp(target.current, kPos)
    // bakış istasyonun GÖRSEL konumuna (kaldırılmış); plonjonda delik merkezi
    const lookGoal =
      endPos && phase !== 'dying'
        ? liftTmp.set(endPos.x, endPos.y + END_VIS_LIFT, endPos.z)
        : (endPos ?? POV_TARGET)
    look.current.lerp(lookGoal, kLook)
    camera.lookAt(look.current)
    // POV serbest bakış: fare konumuna doğru hafif dönüş (lookAt ÜSTÜNE,
    // yerel eksenlerde) — çapa ve hedef takibi bozulmaz, bakış esner
    const kSway = 1 - Math.exp(-6 * delta)
    sway.current.x += (mouse.current.x - sway.current.x) * kSway
    sway.current.y += (mouse.current.y - sway.current.y) * kSway
    const persp = camera as THREE.PerspectiveCamera
    const halfV = (persp.fov * Math.PI) / 360
    const halfH = Math.atan(Math.tan(halfV) * persp.aspect)
    camera.rotateY(-sway.current.x * halfH * LOOK_FRAC)
    camera.rotateX(sway.current.y * halfV * LOOK_FRAC)
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__gameCam = {
        p: camera.position.toArray(),
        l: look.current.toArray(),
      }
    }
  })

  return null
}
