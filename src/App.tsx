import { useMemo } from 'react'
import { useMedia } from 'react-use'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { DEFAULT_PRESET_ID, PRESETS } from './physics/presets'
import { BODY_REGISTRY } from './sim/bodies/registry'
import { Simulation } from './sim/Simulation'
import { QualityGovernor } from './sim/QualityGovernor'
import { LabController } from './sim/LabController'
import { GameController } from './game/GameController'
import { CameraRewind } from './scene/CameraRewind'
import { GameCamera } from './scene/GameCamera'
import { GameLoop } from './scene/GameLoop'
import { FrameLoopDriver } from './scene/FrameLoopDriver'
import { QualityManager } from './scene/QualityManager'
import { LensedBackground } from './scene/LensedBackground'
import { PostFx } from './scene/PostFx'
import { HorizonOccluders } from './scene/HorizonOccluders'
import { Lights } from './scene/Lights'
import { SimulationLayer } from './scene/SimulationLayer'
import { SpawnPlane } from './scene/SpawnPlane'
import { Overlay } from './ui/Overlay'
import { RotateGate } from './ui/RotateGate'
import { useGameSnapshot } from './hooks/useGameSnapshot'

/** Kompozisyon kökü: bağımlılıklar burada kurulur ve enjekte edilir (DIP). */
export default function App() {
  const coarsePointer = useMedia('(pointer: coarse)')
  // deps boş: simülasyon bir kez kurulur, kuruluştaki işaretçi türü kullanılır
  const { controller, governor, game, bloomPin, tables, b2, lensScale } = useMemo(() => {
    // ?kalite=yuksek|orta|dusuk|mobil → governor sabitlenir (test/ölçüm aracı)
    const ASCII: Record<string, string> = { yuksek: 'yüksek', dusuk: 'düşük' }
    const params = new URLSearchParams(window.location.search)
    const q = params.get('kalite')
    const pin = q ? (ASCII[q] ?? q) : undefined
    const governor = new QualityGovernor(window.devicePixelRatio, coarsePointer, pin)
    const initial = PRESETS[DEFAULT_PRESET_ID]
    const sim = new Simulation(initial.engine, BODY_REGISTRY, initial.profile)
    // ?fps=120 → kare tavanı pinli başlar (test/ölçüm; HUD'dan da değişir)
    const fpsCap = params.get('fps') === '120' ? 120 : 60
    const controller = new LabController(sim, governor, BODY_REGISTRY, PRESETS, DEFAULT_PRESET_ID, fpsCap)
    // ?delik=sgra|ss433|grs1915|3c273|cygx1 → o delikle açılır (ölçüm/paylaşım)
    const hole = params.get('delik')
    if (hole && PRESETS[hole]) controller.setHole(hole)
    const game = new GameController(controller)
    // ?bloom=0|1 → parlama pini (ölçüm/karşılaştırma); yoksa kalite kademesi karar verir
    const b = params.get('bloom')
    const bloomPin = b === null ? null : b !== '0'
    // ?tablo=0 → Bruneton tabloları kapalı, eski marş (A/B ölçümü)
    const tables = params.get('tablo') !== '0'
    // ?b2=0 → disk kesişimleri tablodan ÇIKARILIR, hepsi marşa döner (A/B ölçümü).
    // Varsayılan AÇIK. Faz B3'ten beri YAKALANAN ışın da tabloda (gölge önündeki
    // disk): marşa düşen piksel %0, marş yalnız jet için kaldı. Ölçüm 'yüksek',
    // 2.89 Mpix: B2 11.55 ms → B3 7.9 ms; aynı karede tam marş 30.85 ms.
    // (B3'ün ilk ölçümü 8.55 ms idi ve ?fps=120'nin 8.33 ms'lik kare yuvasına
    //  çarpmış bir vsync artefaktıydı; doğrusu ölçek eğrisinden geliyor —
    //  kare ≈ 2.2 ms + 1.97 ms × Mpix. Bkz. bruneton-dogrulama/README.md.)
    const b2 = params.get('b2') !== '0'
    // ?fon=0.6 → katmanlı render ölçeği PİNLENİR (A/B ölçümü). Pin yoksa
    // ölçeği kalite kademesi belirler (QualityGovernor.levels).
    const fonRaw = params.get('fon')
    const fon = Number(fonRaw)
    const lensScale =
      fonRaw !== null && Number.isFinite(fon) && fon > 0 ? Math.min(Math.max(fon, 0.3), 1) : null
    return { controller, governor, game, bloomPin, tables, b2, lensScale }
  }, [])
  // oyun modunda serbest kamera kapanır; GameCamera devralır
  const gameActive = useGameSnapshot(game).active
  return (
    <>
      <Canvas
        style={{ position: 'fixed', inset: 0, cursor: 'crosshair' }}
        flat
        frameloop="never"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 55, near: 0.05, far: 300, position: [2.2, 1.15, 13.2] }}
      >
        <FrameLoopDriver controller={controller} />
        <QualityManager governor={governor} />
        <OrbitControls
          makeDefault
          enabled={!gameActive}
          enableDamping
          dampingFactor={0.06}
          minDistance={3}
          maxDistance={42}
          enablePan={false}
        />
        <CameraRewind controller={controller} />
        <GameLoop game={game} />
        <GameCamera game={game} />
        <LensedBackground controller={controller} governor={governor} tables={tables} b2={b2} />
        <HorizonOccluders />
        <Lights />
        <SimulationLayer controller={controller} />
        <SpawnPlane onSpawn={controller.spawnAt} />
        {/* En sonda: öncelikli useFrame ile kareyi devralır (bkz. PostFx) */}
        <PostFx governor={governor} pin={bloomPin} lensScale={lensScale} />
      </Canvas>
      <Overlay controller={controller} game={game} />
      <RotateGate />
    </>
  )
}
