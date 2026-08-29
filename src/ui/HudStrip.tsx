import { useState, type ReactNode } from 'react'
import type { LabCommands, LabSnapshot } from '../sim/types'
import { Dialog } from './Dialog'
// import { fmtBig } from './format' // KIZILA KAYMA / ZAMAN GEN. hücreleri yorumda

type Pop = 'fps' | 'kalite' | 'spin' | null

function Stat({ k, v, onClick }: { k: string; v: ReactNode; onClick: () => void }) {
  return (
    <button className="stat stat-btn" onClick={onClick}>
      <div className="stat-k">{k}</div>
      <div className="stat-v">{v}</div>
    </button>
  )
}

/** Sağ üst HUD: hücreler tıklanınca açıklama/ayar popup'ları açılır. */
export function HudStrip({ s, lab }: { s: LabSnapshot; lab: LabCommands }) {
  const [pop, setPop] = useState<Pop>(null)
  const close = () => setPop(null)
  return (
    <>
      <div className="card hud">
        <Stat k="FPS" v={s.fps} onClick={() => setPop('fps')} />
        <Stat k="KALİTE" v={s.quality} onClick={() => setPop('kalite')} />
        <Stat k="SPİN a*" v={s.hole.spinLabel} onClick={() => setPop('spin')} />
        {/* kızıla kayma / zaman genişlemesi şimdilik gizli
        <Stat k="KIZILA KAYMA" v={s.focus ? 'z=' + fmtBig(s.focus.z, 2) : '—'} onClick={() => {}} />
        <Stat k="ZAMAN GEN." v={s.focus ? fmtBig(s.focus.dil) + '×' : '—'} onClick={() => {}} />
        */}
      </div>
      {pop === 'fps' && (
        <Dialog onClose={close} width="min(340px, 100%)">
          <div className="card controls-dialog">
            <div className="panel-title">FPS — KARE HIZI</div>
            <div className="body" style={{ marginTop: 8 }}>
              Saniyede çizilen kare sayısı. Gizli sekmede 10'a iner; FPS düşerse kalite yöneticisi
              çözünürlüğü ve ışın adımını kademeli düşürür (KALİTE hücresinden elle de seçilir).
              Tarayıcı kareleri ekran tazelemesine (vsync) hizaladığı için değer tavanın tam
              bölenlerinde takılı görünebilir.
            </div>
            <div className="lbl">KARE TAVANI</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              <button className={s.fpsCap === 60 ? 'on' : ''} onClick={() => lab.setFpsCap(60)}>
                60 fps — serin ve sessiz (varsayılan)
              </button>
              <button className={s.fpsCap === 120 ? 'on' : ''} onClick={() => lab.setFpsCap(120)}>
                120 fps — ProMotion akıcılığı
              </button>
            </div>
            <div className="body" style={{ marginTop: 8 }}>
              120, yalnız yüksek tazelemeli ekranlarda (ProMotion vb.) fark yaratır — 60 Hz ekranda
              vsync zaten 60'ta tutar. GPU işi yaklaşık iki katına çıkar.
            </div>
          </div>
        </Dialog>
      )}
      {pop === 'kalite' && (
        <Dialog onClose={close} width="min(340px, 100%)">
          <div className="card controls-dialog">
            <div className="panel-title">KALİTE</div>
            <div className="body" style={{ marginTop: 8 }}>
              Çözünürlük (piksel oranı) ve ışın izleme adım sayısı. <b>Otomatik</b> mod FPS'e göre seçer;
              elle seçim adaptasyonu kapatır — seviyeleri deneyip FPS'i canlı izleyebilirsiniz.
            </div>
            <div className="lbl">SEVİYE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
              {lab.qualityOptions().map((l) => (
                <button
                  key={l.label}
                  className={!s.qualityAuto && s.quality === l.label ? 'on' : ''}
                  onClick={() => lab.setQuality(l.label)}
                >
                  {l.label} · {l.dpr.toFixed(2)}× çözünürlük · {l.steps} adım
                </button>
              ))}
              <button className={s.qualityAuto ? 'on' : ''} onClick={() => lab.setQuality(null)}>
                otomatik — FPS'e göre seçilir
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {pop === 'spin' && (
        <Dialog onClose={close} width="min(340px, 100%)">
          <div className="card controls-dialog">
            <div className="panel-title">SPİN a* — DÖNME PARAMETRESİ</div>
            <div className="body" style={{ marginTop: 8 }}>
              Boyutsuz açısal momentum: a* = Jc/GM² (0 = dönmeyen, 1 = uç Kerr). {s.hole.name} için
              ölçülmüş değer <b>{s.hole.spinLabel}</b>. Spin, diskin iç kenarını (ISCO), ışıma verimini
              (η = 1 − E<sub>ISCO</sub>) ve ufka yakın zaman genişlemesi tavanını belirler — ayrıntılar
              FİZİK sekmesinde.
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}
