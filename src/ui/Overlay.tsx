import { useState } from 'react'
import type { LabController } from '../sim/LabController'
import { useLabSnapshot } from '../hooks/useLabSnapshot'
import { HudStrip } from './HudStrip'
import { ControlsPanel } from './ControlsPanel'
import { TelemetryPanel } from './TelemetryPanel'
import { PhysicsPanel } from './PhysicsPanel'
import { QuantumPanel } from './QuantumPanel'
import { Dialog } from './Dialog'

export function Overlay({ controller }: { controller: LabController }) {
  const s = useLabSnapshot(controller)
  const [physOpen, setPhysOpen] = useState(false)
  const [quantOpen, setQuantOpen] = useState(false)
  return (
    <div className="ui">
      <HudStrip s={s} />
      <ControlsPanel s={s} lab={controller} />
      <TelemetryPanel s={s} lab={controller} />
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
      </div>
      {quantOpen && (
        <Dialog onClose={() => setQuantOpen(false)}>
          <QuantumPanel onClose={() => setQuantOpen(false)} />
        </Dialog>
      )}
      {physOpen && (
        <Dialog onClose={() => setPhysOpen(false)}>
          <PhysicsPanel onClose={() => setPhysOpen(false)} />
        </Dialog>
      )}
      <div className="footnote">
        tam Kerr ekvatoral jeodezikleri (BPT 1972) · uzak gözlemci zamanı · jeodezik ışın izleme
      </div>
    </div>
  )
}
