import { useMemo } from 'react'
import { useMedia } from 'react-use'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { DEFAULT_PRESET_ID, PRESETS } from './physics/presets'
import { BODY_REGISTRY } from './sim/bodies/registry'
import { Simulation } from './sim/Simulation'
import { QualityGovernor } from './sim/QualityGovernor'
import { LabController } from './sim/LabController'
import { CameraRewind } from './scene/CameraRewind'
import { FrameLoopDriver } from './scene/FrameLoopDriver'
import { QualityManager } from './scene/QualityManager'
import { LensedBackground } from './scene/LensedBackground'
import { HorizonOccluders } from './scene/HorizonOccluders'
import { Lights } from './scene/Lights'
import { SimulationLayer } from './scene/SimulationLayer'
import { SpawnPlane } from './scene/SpawnPlane'
import { Overlay } from './ui/Overlay'

/** Kompozisyon kökü: bağımlılıklar burada kurulur ve enjekte edilir (DIP). */
export default function App() {
  const coarsePointer = useMedia('(pointer: coarse)')
  // deps boş: simülasyon bir kez kurulur, kuruluştaki işaretçi türü kullanılır
  const { controller, governor } = useMemo(() => {
    const governor = new QualityGovernor(window.devicePixelRatio, coarsePointer)
    const initial = PRESETS[DEFAULT_PRESET_ID]
    const sim = new Simulation(initial.engine, BODY_REGISTRY, initial.profile)
    const controller = new LabController(sim, governor, BODY_REGISTRY, PRESETS, DEFAULT_PRESET_ID)
    return { controller, governor }
  }, [])
  return (
    <>
      <Canvas
        style={{ position: 'fixed', inset: 0, cursor: 'crosshair' }}
        flat
        frameloop="never"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 55, near: 0.05, far: 300, position: [2.2, 1.15, 13.2] }}
      >
        <FrameLoopDriver />
        <QualityManager governor={governor} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.06} minDistance={3} maxDistance={42} enablePan={false} />
        <CameraRewind controller={controller} />
        <LensedBackground controller={controller} governor={governor} />
        <HorizonOccluders />
        <Lights />
        <SimulationLayer controller={controller} />
        <SpawnPlane onSpawn={controller.spawnAt} />
      </Canvas>
      <Overlay controller={controller} />
    </>
  )
}
