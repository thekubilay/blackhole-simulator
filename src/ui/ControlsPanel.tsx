// import { BODY_REGISTRY } from '../sim/bodies/registry' // NESNE bölümü şimdilik gizli
import { ASTRONAUT_ENABLED } from '../sim/LabController'
import type { LabCommands, LabSnapshot, SpawnMode } from '../sim/types'

const MODES: [SpawnMode, string][] = [
  ['orbit', 'Yörünge'],
  ['flyby', 'Yakın geçiş'],
  ['fall', 'Serbest düşüş'],
]

/** GÖRÜNÜM seçimi altındaki tanıtım: iki modun da ışın izleme fiziği aynıdır,
 * değişen yalnız diskin renklendirilmesi ve pozlamasıdır (lensShader uRealism). */
const VIEW_ABOUT: Record<'artistic' | 'realistic', { head: string; text: string }> = {
  artistic: {
    head: 'SANATSAL',
    text: 'Filmlerden tanıdığın görüntü: sıcak altın paleti, yumuşatılmış Doppler asimetrisi. Fizik aynı kalır — ışınlar yine gerçek jeodezikleri izler, disk iç kenarı yine ISCO’dur; değişen sadece renklendirme ve pozlamadır. Yıldız alanı kısılmadığı için arka plan ve diskin her yeri okunaklı durur.',
  },
  realistic: {
    head: 'GERÇEKÇİ (g⁴)',
    text: 'Oraya gönderilen bir kameranın gerçekte kaydedeceği şey: parlaklık toplam kaymanın dördüncü kuvvetiyle ölçeklenir (I ∝ g⁴). Sana doğru dönen kenar kat kat parlar ve maviye kayar, uzaklaşan kenar söner; iç kenar kütleçekimsel kaymayla kararır ve disk kara cisim renginde görünür. Disk o kadar parlaktır ki ona pozlanmış kamerada arka plan yıldızları sönük kalır (Luminet 1979).',
  },
}

/**
 * GENEL AYARLAR sekmesinin içeriği — dialog kabuğunu Overlay sahiplenir.
 * Delik seçimi buradan KARA DELİKLER sekmesine taşındı (HolesPanel).
 */
export function ControlsPanel({ s, lab }: { s: LabSnapshot; lab: LabCommands }) {
  return (
    <>
      <div className="subtitle" style={{ margin: '0 0 4px' }}>
        {s.hole.name} · {s.hole.massLabel} · r₊ = 1 birim
      </div>
      <div className="lbl" style={{ marginTop: 8 }}>
        GÖRÜNÜM
      </div>
      <div className="seg">
        <button className={s.realistic ? '' : 'on'} onClick={() => lab.setRealistic(false)}>
          Sanatsal
        </button>
        <button className={s.realistic ? 'on' : ''} onClick={() => lab.setRealistic(true)}>
          Gerçekçi (g⁴)
        </button>
      </div>
      {(() => {
        const v = VIEW_ABOUT[s.realistic ? 'realistic' : 'artistic']
        return (
          <div className="about-box">
            <div className="about-box-head">{v.head}</div>
            <p>{v.text}</p>
          </div>
        )
      })()}
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
      {ASTRONAUT_ENABLED && (
        <>
          <div className="lbl">BAŞLANGIÇ HIZI</div>
          <div className="seg">
            {MODES.map(([mode, label]) => (
              <button key={mode} className={s.mode === mode ? 'on' : ''} onClick={() => lab.setMode(mode)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="lbl">ZAMAN HIZI × {s.timeScale.toFixed(1)}</div>
      <input
        type="range"
        min={0.1}
        max={5}
        step={0.1}
        value={s.timeScale}
        onChange={(e) => lab.setTimeScale(Number(e.target.value))}
      />
      {/* Duraklat/Temizle satırı kaldırıldı (kullanıcı isteği) — Temizle
          telemetri şeridinde duruyor, duraklatmayı oyun programlı kullanır */}
      <div style={{ marginTop: 10, color: '#ffb877', fontSize: 10, minHeight: 26, lineHeight: 1.4 }}>
        {s.hint}
      </div>
    </>
  )
}
