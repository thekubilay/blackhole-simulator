import { useState } from 'react'
import type { LabController } from '../sim/LabController'
import { useLabSnapshot } from '../hooks/useLabSnapshot'
import { HudStrip } from './HudStrip'
import { ControlsPanel } from './ControlsPanel'
import { TelemetryPanel } from './TelemetryPanel'
import { PhysicsPanel } from './PhysicsPanel'
import { QuantumPanel } from './QuantumPanel'
import { Dialog } from './Dialog'

type Tab = 'genel' | 'fizik' | 'kuantum'

export function Overlay({ controller }: { controller: LabController }) {
  const s = useLabSnapshot(controller)
  const [tab, setTab] = useState<Tab | null>(null)
  return (
    <div className="ui">
      <HudStrip s={s} lab={controller} />
      {/* logo + seçili delik adı: her zaman görünür */}
      <div className="brand">
        <div className="title">
          KARA DELİK <span className="thin">LAB.</span>
        </div>
        <div className="brand-sub">{s.hole.name}</div>
      </div>
      {/* sol alt köşe araçları: ayarlar dialogu aç/kapa + tam başa sarma */}
      <div className="corner-tools">
        <button
          className="icon-btn"
          onClick={() => setTab(tab ? null : 'genel')}
          aria-label={tab ? 'Ayarlar dialogunu kapat' : 'Ayarlar dialogunu aç'}
        >
          {/* FA kit <i>'yi SVG ile değiştirir; React'ın söküp yeniden kurabilmesi
              için ikon, key'li ve React'a ait bir span içinde yaşar */}
          <span key={tab ? 'x' : 'sliders'} style={{ display: 'contents' }}>
            <i className={tab ? 'fa-regular fa-xmark' : 'fa-regular fa-sliders'} aria-hidden="true" />
          </span>
        </button>
        <button className="icon-btn" onClick={() => controller.rewind()} aria-label="Sahneyi başa sar">
          <i className="fa-regular fa-arrow-rotate-right" aria-hidden="true" />
        </button>
      </div>
      {/* sağ üst kısayollar: aynı dialogu ilgili sekmede açar */}
      <div className="dock">
        <div className="dock-toggles">
          <button className="card" style={{ padding: '8px 14px', letterSpacing: '.14em' }} onClick={() => setTab('fizik')}>
            FİZİK PANELİ
          </button>
          <button className="card" style={{ padding: '8px 14px', letterSpacing: '.14em' }} onClick={() => setTab('kuantum')}>
            KUANTUM
          </button>
        </div>
      </div>
      {tab && (
        <Dialog onClose={() => setTab(null)} width="min(620px, 100%)">
          <div className="card panel">
            <div className="panel-head-row">
              <div className="seg" style={{ flex: 1 }}>
                <button className={tab === 'genel' ? 'on' : ''} onClick={() => setTab('genel')}>
                  GENEL AYARLAR
                </button>
                <button className={tab === 'fizik' ? 'on' : ''} onClick={() => setTab('fizik')}>
                  FİZİK
                </button>
                <button className={tab === 'kuantum' ? 'on' : ''} onClick={() => setTab('kuantum')}>
                  KUANTUM
                </button>
              </div>
              <button className="icon-btn" onClick={() => setTab(null)} aria-label="Kapat">
                <i className="fa-regular fa-xmark" aria-hidden="true" />
              </button>
            </div>
            <div className="panel-body">
              {tab === 'genel' && <ControlsPanel s={s} lab={controller} />}
              {tab === 'fizik' && <PhysicsPanel />}
              {tab === 'kuantum' && <QuantumPanel />}
            </div>
          </div>
        </Dialog>
      )}
      <TelemetryPanel s={s} lab={controller} />
      <div className="footnote">
        tam Kerr ekvatoral jeodezikleri (BPT 1972) · uzak gözlemci zamanı · jeodezik ışın izleme
      </div>
    </div>
  )
}
