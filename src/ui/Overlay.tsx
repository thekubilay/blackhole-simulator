import { useEffect, useState } from 'react'
import type { LabController } from '../sim/LabController'
import type { GameController } from '../game/GameController'
import { useLabSnapshot } from '../hooks/useLabSnapshot'
import { useGameSnapshot } from '../hooks/useGameSnapshot'
import { HudStrip } from './HudStrip'
import { ControlsPanel } from './ControlsPanel'
import { TelemetryPanel } from './TelemetryPanel'
import { PhysicsPanel } from './PhysicsPanel'
import { QuantumPanel } from './QuantumPanel'
import { Dialog } from './Dialog'

type Tab = 'genel' | 'fizik' | 'kuantum'

export function Overlay({ controller, game }: { controller: LabController; game: GameController }) {
  const s = useLabSnapshot(controller)
  const g = useGameSnapshot(game)
  const [tab, setTab] = useState<Tab | null>(null)
  // oyun modunda ESC = lab'a dön
  useEffect(() => {
    if (!g.active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') game.exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [g.active, game])
  if (g.active) {
    // oyun görünümü: lab UI'si tamamen çekilir, sadece marka + çıkış kalır
    return (
      <div className="ui">
        <div className="brand">
          <div className="title">
            KARA DELİK <span className="thin">LAB.</span>
          </div>
          <div className="brand-sub">KENETLENME · {s.hole.name}</div>
        </div>
        <button className="icon-btn game-exit" onClick={() => game.exit()} aria-label="Oyundan çık (ESC)">
          <i className="fa-regular fa-xmark" aria-hidden="true" />
        </button>
        <div className="game-note">iskelet sürüm — itki, yakıt ve Endurance sonraki adımda</div>
      </div>
    )
  }
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
      {!s.busy && !tab && (
        <button className="play-btn" onClick={() => game.enter()}>
          <span key="play" style={{ display: 'contents' }}>
            <i className="fa-regular fa-play" aria-hidden="true" />
          </span>
          OYNA
        </button>
      )}
      <TelemetryPanel s={s} lab={controller} />
      <div className="footnote">
        tam Kerr ekvatoral jeodezikleri (BPT 1972) · uzak gözlemci zamanı · jeodezik ışın izleme
      </div>
    </div>
  )
}
