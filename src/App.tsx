import { useMemo } from 'react'
import { useMedia } from 'react-use'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { DEFAULT_PRESET_ID, PRESETS } from './physics/presets'
import { BODY_REGISTRY } from './sim/bodies/registry'
import { Simulation } from './sim/Simulation'
import { QualityGovernor } from './sim/QualityGovernor'
import { PowerPolicy } from './sim/PowerPolicy'
import { LabController } from './sim/LabController'
import { GameController } from './game/GameController'
import { CameraRewind } from './scene/CameraRewind'
import { GameCamera } from './scene/GameCamera'
import { GameLoop } from './scene/GameLoop'
import { FrameLoopDriver } from './scene/FrameLoopDriver'
import { QualityManager } from './scene/QualityManager'
import { LensedBackground } from './scene/LensedBackground'
import { PostFx } from './scene/PostFx'
import { PARTICLE_LAYER } from './scene/shipPass'
import { HorizonOccluders } from './scene/HorizonOccluders'
import { Lights } from './scene/Lights'
import { SimulationLayer } from './scene/SimulationLayer'
import { SpawnPlane } from './scene/SpawnPlane'
import { Overlay } from './ui/Overlay'
import { RotateGate } from './ui/RotateGate'
import { useGameSnapshot } from './hooks/useGameSnapshot'
import { readPins } from './pins'

/** Kompozisyon kökü: bağımlılıklar burada kurulur ve enjekte edilir (DIP). */
export default function App() {
  const coarsePointer = useMedia('(pointer: coarse)')
  // deps boş: simülasyon bir kez kurulur, kuruluştaki işaretçi türü kullanılır
  const { controller, governor, game, power, pins } = useMemo(() => {
    // ölçüm/A-B pinlerinin tamamı tek yerde okunur ve belgelenir (bkz. pins.ts)
    const pins = readPins(window.location.search)
    const governor = new QualityGovernor(window.devicePixelRatio, coarsePointer, pins.qualityPin)
    const initial = PRESETS[DEFAULT_PRESET_ID]
    const sim = new Simulation(initial.engine, BODY_REGISTRY, initial.profile)
    // kıvılcım akışları (toplamalı Points) gemi MSAA hedefine girmez; render
    // hattının katmanını kompozisyon kökü verir (bkz. shipPass.ts)
    sim.particleLayer = PARTICLE_LAYER
    // güç politikası: bütçe pini varsa onu, yoksa cihaz sınıfı/pil/basınç/HUD seçimi
    const power = new PowerPolicy(pins.budgetOverride)
    const controller = new LabController(sim, governor, BODY_REGISTRY, PRESETS, DEFAULT_PRESET_ID, pins.fpsCap, power)
    if (pins.hole && PRESETS[pins.hole]) controller.setHole(pins.hole)
    const game = new GameController(controller)
    return { controller, governor, game, power, pins }
  }, [])
  // oyun modunda serbest kamera kapanır; GameCamera devralır
  const gameActive = useGameSnapshot(game).active
  return (
    <>
      <Canvas
        style={{ position: 'fixed', inset: 0, cursor: 'crosshair' }}
        flat
        frameloop="never"
        gl={{ antialias: pins.aa, powerPreference: 'high-performance' }}
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
        <LensedBackground controller={controller} governor={governor} tables={pins.tables} b2={pins.b2} />
        <HorizonOccluders />
        <Lights />
        <SimulationLayer controller={controller} />
        <SpawnPlane onSpawn={controller.spawnAt} />
        {/* En sonda: öncelikli useFrame ile kareyi devralır (bkz. PostFx) */}
        <PostFx
          governor={governor}
          pin={pins.bloomPin}
          lensScale={pins.lensScale}
          shipMsaa={pins.shipMsaa}
          power={power}
        />
      </Canvas>
      <Overlay controller={controller} game={game} />
      <RotateGate />
    </>
  )
}
