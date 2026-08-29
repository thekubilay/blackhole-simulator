import type { LabSnapshot } from '../sim/types'
import { fmt, fmtBig, fmtMs } from './format'

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

export function TelemetryPanel({ s }: { s: LabSnapshot }) {
  const F = s.focus
  return (
    <div
      className="card"
      style={{ position: 'fixed', left: 16, bottom: 14, width: 248, padding: '11px 14px', userSelect: 'none' }}
    >
      <div className="panel-title" style={{ fontSize: 11, marginBottom: 8 }}>
        TELEMETRİ
      </div>
      <Row k="Nesne" v={F ? F.label : '—'} />
      <Row k="Uzaklık" v={F ? fmt(F.r, F.r < 1.01 ? 5 : 2) + ' r₊' : '—'} />
      <Row k="Yerel hız" v={F && F.v != null ? fmt(F.v, 2) + ' c' : '—'} />
      <Row k="Kızıla kayma z (toplam)" v={F ? fmtBig(F.z) : '—'} />
      <Row k="Zaman genişlemesi" v={F ? fmtBig(F.dil) + '×' : '—'} />
      <div className="clocks">
        <Row k="Dünya saati" v={F ? fmtMs(F.tCoordMs) : '—'} />
        <Row k="Astronot saati (τ)" v={F ? fmtMs(F.tauMs) : '—'} />
        <Row k="Biriken fark" v={F ? fmtMs(Math.max(F.tCoordMs - F.tauMs, 0)) : '—'} />
        <Row k="Yolculuk ort. genişleme" v={F && F.tauMs > 0 ? '×' + fmt(F.tCoordMs / F.tauMs, 3) : '—'} />
      </div>
      <Row k="Gelgit gradyanı" v={F ? F.tidalG.toExponential(1) + ' g/m' : '—'} />
      <Row k="Özgül enerji E/mc²" v={F ? (F.E < 1 ? 'bağlı ' : 'serbest ') + fmt(F.E, 3) : '—'} />
      <Row k="Özgül L (rs·c)" v={F ? fmt(F.L, 2) : '—'} />
      <Row k="Gelgit uzaması" v={F ? '×' + fmt(F.stretch, 2) : '—'} />
      <Row k="Kütle kaybı" v={F ? fmt(F.massLost * 100, 0) + '%' : '—'} />
      <div className="meter">
        <div style={{ width: (F ? Math.min(F.tide, 100) : 0) + '%' }} />
      </div>
      <div style={{ marginTop: 7, color: '#ffd9b3', fontSize: 10 }}>
        {F ? F.status : s.busy ? 'Enkaz ufka düşüyor' : 'Sistem hazır'}
      </div>
    </div>
  )
}
