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

/**
 * Duruma göre koçluk satırı — "W'ye basınca ne oluyor, şimdi ne yapmalıyım"
 * sorusunun oyun içi cevabı. Yörünge fiziğinin tersliği anlatılmadan oynanamıyor
 * (playtest bulgusu): derin = açısal hızlı, W = gecikmeli tırmanış.
 */
function coachLine(h: { sep: number; closure: number; podR: number; endR: number }): string {
  const dr = h.podR - h.endR
  if (dr > 0.35) return 'Endurance ÜSTÜNE çıktın — S ile alçal, salınıma izin verme'
  if (dr < -0.35 && h.sep > 3)
    return 'Altındasın = ondan hızlı dönüyorsun; süzül, ara kendiliğinden kapanıyor (erken tırmanma)'
  if (dr < -0.35) return 'Ara kapandı — W ile DOZLU tırman (yanıt gecikmelidir), yüksekliğini onunkine getir'
  if (h.sep > 1.2) return 'Hizadasın — küçük dokunuşlarla yaklaşmayı koru'
  return h.closure > 0.008
    ? 'ÇOK HIZLI YAKLAŞIYORSUN — W ile frene bas (limit 0.008c)'
    : 'Son yaklaşma — kapanmayı 0.008c altında tut, dokunuşlar minik olsun'
}

export function Overlay({ controller, game }: { controller: LabController; game: GameController }) {
  const s = useLabSnapshot(controller)
  const g = useGameSnapshot(game)
  const [tab, setTab] = useState<Tab | null>(null)
  // oyun modunda ESC: uçuşta brifingi açar (dünya donar); brifingde veya
  // oyun sonunda lab'a döner
  useEffect(() => {
    if (!g.active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!g.briefing && g.phase === 'flying') game.openBriefing()
      else game.exit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [g.active, g.briefing, g.phase, game])
  if (g.active) {
    const h = g.hud
    // oyun görünümü: lab UI'si çekilir — marka + çıkış + kenetlenme HUD'u
    return (
      <div className="ui">
        <div className="brand">
          <div className="title">
            KARA DELİK <span className="thin">LAB.</span>
          </div>
          <div className="brand-sub">
            KENETLENME · {s.hole.name}
            {game.pin ? ` · TEST PİNİ: ${game.pin}` : ''}
          </div>
        </div>
        <button
          className="icon-btn game-exit"
          onClick={() => (!g.briefing && g.phase === 'flying' ? game.openBriefing() : game.exit())}
          aria-label={!g.briefing && g.phase === 'flying' ? 'Brifingi aç (ESC)' : 'Oyundan çık'}
        >
          <i className="fa-regular fa-xmark" aria-hidden="true" />
        </button>
        {g.briefing && (
          <div className="game-brief card">
            <div className="panel-title" style={{ marginBottom: 10 }}>
              KENETLENME — GÖREV BRİFİNGİ
            </div>
            <p>
              Mekiğin hasarlı: disk plazmasının akıntısına kapıldın ve kara deliğe doğru sürükleniyorsun.
              Hiçbir şey yapmazsan bir dakika içinde <b>ISCO</b>'yu (son kararlı yörünge) geçersin — oradan
              dönüş yok. Üstünde, sağlam yörüngede süzülen <b>Endurance</b> tek kurtuluşun: ona tırmanıp
              kenetleneceksin.
            </p>
            <p>
              <b>Yörüngenin tersliği:</b> derindeki daha hızlı döner. Endurance'dan derinde olduğun için
              ondan hızlısın — beklersen ara <i>kendiliğinden</i> kapanır; acele edersen her şeyi bozarsın.
              <b> W</b> ileri itki verir: seni dışarı savurur, <b>tırmanırsın</b> ama açısal olarak
              yavaşlayıp fazda geri düşersin. <b>S</b> frendir: <b>dalarsın</b> ve daha da hızlanırsın.
              İkisi de asansör değil — yarıçap saniyeler <i>sonra</i> tepki verir, fazla bastırırsan
              yörüngen salınır (yükselip geri düşersin). SEN r hücresindeki ↑/↓ oku bu gecikmeyi gösterir.
            </p>
            <p>
              <b>Plan:</b> ① Süzül — ara kapanırken yüksekliğini koru, yakıt harcama. ② Ara 2-3 r₊'ye
              inince W ile <b>dozlu</b> tırman; hedefe vardığında onun yüksekliğinde ol. ③ Son yaklaşmada
              kapanma hızını <b>0.008c</b> altına indirip dokun — hızlı temas çarpışmadır. Yakıt sınırlı:
              her itki bir karar. Alttaki satır sana o an ne yapman gerektiğini fısıldar;
              <b> R</b> her an yeniden başlatır.
            </p>
            <div className="brief-actions">
              <button className="on" onClick={() => game.begin()}>
                DEVAM ET
              </button>
              <button onClick={() => game.exit()}>ÇIKIŞ</button>
            </div>
          </div>
        )}
        {!g.briefing && h && g.phase === 'flying' && (
          <div className="game-hud card">
            <div className="gstat">
              <span>MESAFE</span>
              <b>{h.sep.toFixed(2)} r₊</b>
            </div>
            <div className="gstat">
              <span>KAPANMA</span>
              <b className={h.closure > 0 ? 'g-ok' : 'g-warn'}>
                {h.closure >= 0 ? '+' : ''}
                {h.closure.toFixed(3)} c
              </b>
            </div>
            <div className="gstat">
              <span>YAKIT</span>
              <b className={h.fuel < 0.25 ? 'g-warn' : ''}>%{Math.round(h.fuel * 100)}</b>
            </div>
            <div className="gstat">
              <span>SEN r</span>
              <b className={h.podR < h.isco * 1.15 ? 'g-warn' : h.vr > 0.01 ? 'g-ok' : ''}>
                {h.podR.toFixed(1)} {h.vr > 0.01 ? '↑' : h.vr < -0.01 ? '↓' : '·'}
              </b>
            </div>
            <div className="gstat">
              <span>END r</span>
              <b>{h.endR.toFixed(1)}</b>
            </div>
            <div className="gstat">
              <span>ISCO</span>
              <b>{h.isco.toFixed(1)}</b>
            </div>
            <div className="gstat">
              <span>İTKİ</span>
              <b className={h.thrust !== 0 ? 'g-ok' : ''}>
                {h.thrust > 0 ? '▲ W' : h.thrust < 0 ? '▼ S' : '—'}
              </b>
            </div>
          </div>
        )}
        {!g.briefing && h && g.phase === 'flying' && (
          <div className="game-note">
            {coachLine(h)} · R yeniden başlat
          </div>
        )}
        {!g.briefing && (g.phase === 'docked' || g.phase === 'failed') && (
          <div className="game-msg card">
            <div className={g.phase === 'docked' ? 'g-ok' : 'g-warn'} style={{ fontSize: 13 }}>
              {g.reason}
            </div>
            <div style={{ marginTop: 8, color: 'var(--ink-muted)', fontSize: 10 }}>
              R — yeniden dene · ESC — lab'a dön
            </div>
          </div>
        )}
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
