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
import { HorizonOccluders } from './scene/HorizonOccluders'
import { Lights } from './scene/Lights'
import { SimulationLayer } from './scene/SimulationLayer'
import { SpawnPlane } from './scene/SpawnPlane'
import { Overlay } from './ui/Overlay'
import { useGameSnapshot } from './hooks/useGameSnapshot'

/** Kompozisyon kökü: bağımlılıklar burada kurulur ve enjekte edilir (DIP). */
export default function App() {
  const coarsePointer = useMedia('(pointer: coarse)')
  // deps boş: simülasyon bir kez kurulur, kuruluştaki işaretçi türü kullanılır
  const { controller, governor, game } = useMemo(() => {
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
    const game = new GameController(controller)
    return { controller, governor, game }
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
        <LensedBackground controller={controller} governor={governor} />
        <HorizonOccluders />
        <Lights />
        <SimulationLayer controller={controller} />
        <SpawnPlane onSpawn={controller.spawnAt} />
      </Canvas>
      <Overlay controller={controller} game={game} />
    </>
  )
}
