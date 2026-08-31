import { PRESETS, fmtDistanceLy, fmtHorizon } from '../physics/presets'
import type { LabCommands, LabSnapshot } from '../sim/types'

/**
 * KARA DELİKLER sekmesi (dialogun ilk sekmesi): delik seçimi + seçili deliğin
 * tanıtımı. Künye değerleri preset'ten okunur (yayımlanmış ölçümler) ve
 * sahnedeki görüntünün nedenini anlatır — spin farkı ISCO'da, besleme rejimi
 * diskin kalınlık/parlaklığında, dönme ekseni jette görünür.
 */
export function HolesPanel({ s, lab }: { s: LabSnapshot; lab: LabCommands }) {
  const sel = PRESETS[s.hole.id]
  return (
    <>
      <div className="lbl" style={{ marginTop: 0 }}>
        KARA DELİK
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
        {Object.values(PRESETS).map((p) => (
          <button
            key={p.id}
            className={`hole-btn${s.hole.id === p.id ? ' on' : ''}`}
            onClick={() => lab.setHole(p.id)}
          >
            <span className="hole-btn-name">{p.label}</span>
            <span className="hole-btn-tag">{p.tag}</span>
          </button>
        ))}
      </div>
      {sel && (
        <div className="about-box">
          <div className="about-box-head">{sel.name}</div>
          <p>{sel.about}</p>
          <div className="hole-facts">
            <div className="gstat">
              <span>KÜTLE</span>
              <b>{sel.massLabel}</b>
            </div>
            <div className="gstat">
              <span>SPİN a*</span>
              <b>{sel.spinLabel}</b>
            </div>
            <div className="gstat">
              <span>OLAY UFKU</span>
              <b>{fmtHorizon(sel.rPlusMeters)}</b>
            </div>
            <div className="gstat">
              <span>ISCO</span>
              <b>{sel.profile.diskIn.toFixed(2)} r₊</b>
            </div>
            <div className="gstat">
              <span>VERİM η</span>
              <b>%{(sel.efficiency * 100).toFixed(0)}</b>
            </div>
            <div className="gstat">
              <span>UZAKLIK</span>
              <b>{fmtDistanceLy(sel.distanceLy)}</b>
            </div>
          </div>
          <div className="hole-traits">
            <div>
              <span>DİSK</span>
              {sel.diskLabel}
            </div>
            <div>
              <span>JET</span>
              {sel.jetLabel}
            </div>
          </div>
          <div className="hole-refs">{sel.refs}</div>
        </div>
      )}
    </>
  )
}
