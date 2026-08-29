import { useState } from 'react'
import type { LabController } from '../sim/LabController'
import { useLabSnapshot } from '../hooks/useLabSnapshot'
import { HudStrip } from './HudStrip'
import { ControlsPanel } from './ControlsPanel'
import { TelemetryPanel } from './TelemetryPanel'
import { PhysicsPanel } from './PhysicsPanel'
import { QuantumPanel } from './QuantumPanel'

export function Overlay({ controller }: { controller: LabController }) {
  const s = useLabSnapshot(controller)
  const [physOpen, setPhysOpen] = useState(false)
  const [quantOpen, setQuantOpen] = useState(false)
  return (
    <div className="ui">
      <HudStrip s={s} />
      <ControlsPanel s={s} lab={controller} />
      <TelemetryPanel s={s} />
      <div className="dock">
        <div className="dock-toggles">
          {!physOpen && (
            <button className="card" style={{ padding: '8px 14px', letterSpacing: '.14em' }} onClick={() => setPhysOpen(true)}>
              FİZİK PANELİ
            </button>
          )}
          {!quantOpen && (
            <button className="card" style={{ padding: '8px 14px', letterSpacing: '.14em' }} onClick={() => setQuantOpen(true)}>
              KUANTUM
            </button>
          )}
        </div>
        {quantOpen && <QuantumPanel onClose={() => setQuantOpen(false)} />}
        {physOpen && <PhysicsPanel onClose={() => setPhysOpen(false)} />}
      </div>
      <div style={{ position: 'fixed', right: 16, bottom: 10, fontSize: 9, color: '#6b6055', letterSpacing: '.04em' }}>
        tam Kerr ekvatoral jeodezikleri (BPT 1972) · uzak gözlemci zamanı · jeodezik ışın izleme
      </div>
    </div>
  )
}
