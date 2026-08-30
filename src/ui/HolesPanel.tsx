import { PRESETS } from '../physics/presets'
import type { LabCommands, LabSnapshot } from '../sim/types'

/**
 * KARA DELİKLER sekmesi (dialogun ilk sekmesi): delik seçimi + seçili deliğin
 * tanıtımı. Künye değerleri preset'ten okunur (yayımlanmış ölçümler) ve
 * sahnedeki görüntünün nedenini anlatır — spin farkı ISCO'da görünür.
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
          <button key={p.id} className={s.hole.id === p.id ? 'on' : ''} onClick={() => lab.setHole(p.id)}>
            {p.label}
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
              <b>{sel.massSolar} M☉</b>
            </div>
            <div className="gstat">
              <span>SPİN a*</span>
              <b>{sel.spinLabel}</b>
            </div>
            <div className="gstat">
              <span>OLAY UFKU</span>
              <b>{(sel.rPlusMeters / 1000).toFixed(1)} km</b>
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
              <b>{sel.distanceLy.toLocaleString('tr-TR')} ıy</b>
            </div>
          </div>
          <div className="hole-refs">{sel.refs}</div>
        </div>
      )}
    </>
  )
}
