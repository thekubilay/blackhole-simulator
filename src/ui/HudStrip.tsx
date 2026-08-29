import type { ReactNode } from 'react'
import type { LabSnapshot } from '../sim/types'
// import { fmtBig } from './format' // KIZILA KAYMA / ZAMAN GEN. hücreleri yorumda

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v">{v}</div>
    </div>
  )
}

export function HudStrip({ s }: { s: LabSnapshot }) {
  return (
    <div className="card hud">
      <Stat k="FPS" v={s.fps} />
      <Stat k="KALİTE" v={s.quality} />
      <Stat k="SPİN a*" v={s.hole.spinLabel} />
      {/* kızıla kayma / zaman genişlemesi şimdilik gizli
      <Stat k="KIZILA KAYMA" v={s.focus ? 'z=' + fmtBig(s.focus.z, 2) : '—'} />
      <Stat k="ZAMAN GEN." v={s.focus ? fmtBig(s.focus.dil) + '×' : '—'} />
      */}
    </div>
  )
}
