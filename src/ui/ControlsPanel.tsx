import { useState } from 'react'
// import { BODY_REGISTRY } from '../sim/bodies/registry' // NESNE bölümü şimdilik gizli
import { PRESETS } from '../physics/presets'
import type { LabCommands, LabSnapshot, SpawnMode } from '../sim/types'
import { Dialog } from './Dialog'

const MODES: [SpawnMode, string][] = [
  ['orbit', 'Yörünge'],
  ['flyby', 'Yakın geçiş'],
  ['fall', 'Serbest düşüş'],
]

export function ControlsPanel({ s, lab }: { s: LabSnapshot; lab: LabCommands }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* logo: her zaman görünür */}
      <div className="brand">
        <div className="title">
          KARA DELİK <span className="thin">LAB.</span>
        </div>
      </div>
      {/* sol alt köşe araçları: kontrol dialogu aç/kapa + tam başa sarma */}
      <div className="corner-tools">
        <button
          className="icon-btn"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Kontrol panelini kapat' : 'Kontrol panelini aç'}
        >
          {/* FA kit <i>'yi SVG ile değiştirir; React'ın söküp yeniden kurabilmesi
              için ikon, key'li ve React'a ait bir span içinde yaşar */}
          <span key={open ? 'x' : 'sliders'} style={{ display: 'contents' }}>
            <i className={open ? 'fa-regular fa-xmark' : 'fa-regular fa-sliders'} aria-hidden="true" />
          </span>
        </button>
        <button className="icon-btn" onClick={() => lab.rewind()} aria-label="Sahneyi başa sar">
          <i className="fa-regular fa-arrow-rotate-right" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <Dialog onClose={() => setOpen(false)} width="min(320px, 100%)">
          <div className="card controls-dialog">
            <div className="subtitle" style={{ margin: '0 0 4px' }}>
              {s.hole.name} · {s.hole.massLabel} · r₊ = 1 birim
            </div>
            <div className="lbl">KARA DELİK</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              {Object.values(PRESETS).map((p) => (
                <button key={p.id} className={s.hole.id === p.id ? 'on' : ''} onClick={() => lab.setHole(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="lbl">GÖRÜNÜM</div>
            <div className="seg">
              <button className={s.realistic ? '' : 'on'} onClick={() => lab.setRealistic(false)}>
                Sanatsal
              </button>
              <button className={s.realistic ? 'on' : ''} onClick={() => lab.setRealistic(true)}>
                Gerçekçi (g⁴)
              </button>
            </div>
            {/* NESNE seçimi şimdilik gizli — tek nesne türü (Astronot) var
            <div className="lbl">NESNE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              {Object.entries(BODY_REGISTRY).map(([type, def]) => (
                <button key={type} className={s.armed === type ? 'on' : ''} onClick={() => lab.setArmed(type)}>
                  {def.label}
                </button>
              ))}
            </div>
            */}
            <div className="lbl">BAŞLANGIÇ HIZI</div>
            <div className="seg">
              {MODES.map(([mode, label]) => (
                <button key={mode} className={s.mode === mode ? 'on' : ''} onClick={() => lab.setMode(mode)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="lbl">ZAMAN HIZI × {s.timeScale.toFixed(1)}</div>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={s.timeScale}
              onChange={(e) => lab.setTimeScale(Number(e.target.value))}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button style={{ flex: 1 }} onClick={() => lab.togglePause()}>
                {s.paused ? 'Devam' : 'Duraklat'}
              </button>
              <button style={{ flex: 1 }} onClick={() => lab.clear()}>
                Temizle
              </button>
            </div>
            <div style={{ marginTop: 10, color: '#ffb877', fontSize: 10, minHeight: 26, lineHeight: 1.4 }}>
              {s.hint}
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}
