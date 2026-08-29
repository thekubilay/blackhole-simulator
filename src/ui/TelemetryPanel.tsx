import type { ReactNode } from 'react'
import type { LabCommands, LabSnapshot } from '../sim/types'
import { fmt, fmtMs } from './format'

function Cell({ k, v, accent, children }: { k: string; v: ReactNode; accent?: boolean; children?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v" style={accent ? { color: '#ffd9b3' } : undefined}>
        {v}
      </div>
      {children}
    </div>
  )
}

/**
 * Kompakt telemetri şeridi: yalnız bir cisim bırakıldığında, alt-ortadan
 * animasyonla yükselir. Sahneyi doldurmaz — beş hücre + durum + gelgit çizgisi.
 * Kızıla kayma / anlık genişleme burada yoktur (HUD'daki hücreleri de şimdilik yorumda).
 */
export function TelemetryPanel({ s, lab }: { s: LabSnapshot; lab: LabCommands }) {
  const F = s.focus
  if (!F) return null
  // ufka yaklaşma: r₊/r — uzakta ~0, ufukta 1 (doğal GR ölçüsü)
  const approach = Math.min(1 / F.r, 1)
  return (
    <div className="card telemetry">
      {!F.alive && (
        <button className="telemetry-clear" onClick={() => lab.clear()}>
          <i className="fa-regular fa-eraser" aria-hidden="true" /> TEMİZLE
        </button>
      )}
      <div className="telemetry-row">
        <Cell k="UFKA UZAKLIK" v={fmt(Math.max(F.r - 1, 0), F.r - 1 < 0.01 ? 4 : 2) + ' r₊'}>
          <div className="meter">
            <div style={{ width: approach * 100 + '%' }} />
          </div>
        </Cell>
        <Cell k="YEREL HIZ" v={F.v != null ? fmt(F.v, 2) + ' c' : '—'} />
        <Cell k="DÜNYA SAATİ" v={fmtMs(F.tCoordMs)} accent />
        <Cell k="ASTRONOT τ" v={fmtMs(F.tauMs)} accent />
        <Cell k="BİRİKEN FARK" v={fmtMs(Math.max(F.tCoordMs - F.tauMs, 0))} accent />
      </div>
      <div className="telemetry-status">{F.status}</div>
      <div className="meter tide">
        <div style={{ width: Math.min(F.tide, 100) + '%' }} />
      </div>
    </div>
  )
}
