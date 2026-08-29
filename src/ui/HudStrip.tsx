import type { ReactNode } from 'react'
import type { LabSnapshot } from '../sim/types'
import { fmtBig } from './format'

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className="stat-v">{v}</div>
    </div>
  )
}

export function HudStrip({ s }: { s: LabSnapshot }) {
  const F = s.focus
  return (
    <div className="card hud">
      <Stat k="FPS" v={s.fps} />
      <Stat k="KALİTE" v={s.quality} />
      <Stat k="SPİN a*" v={s.hole.spinLabel} />
      <Stat k="KIZILA KAYMA" v={F ? 'z=' + fmtBig(F.z, 2) : '—'} />
      <Stat k="ZAMAN GEN." v={F ? fmtBig(F.dil) + '×' : '—'} />
    </div>
  )
}
