/**
 * URL PİNLERİ — ölçüm ve A/B araçlarının tek listesi (OCP: yeni pin buraya
 * eklenir, App.tsx'e dokunulmaz). Hepsi yalnız yüklenişte okunur; hiçbiri
 * kullanıcıya dönük ayar değildir (onlar HUD'da). Ölçüm kullanımı:
 * scripts/olcum-protokolu.md §5. `?oyun=` pini kenetlenme oyununun kurulum
 * parametresidir ve GameController'da okunur (burada değil).
 */
export interface Pins {
  /** ?kalite=yuksek|iyi|orta|dusuk|mobil → governor o kademeye sabitlenir (adaptasyon ve bütçe tavanı kapalı) */
  qualityPin: string | undefined
  /** ?fps=120 → kare tavanı 120 başlar (HUD'dan da değişir); varsayılan 60 */
  fpsCap: 60 | 120
  /** ?delik=sgra|ss433|grs1915|3c273|cygx1 → o delikle açılır (ölçüm/paylaşım) */
  hole: string | null
  /** ?bloom=0|1 → parlama pini; null = kalite kademesi karar verir */
  bloomPin: boolean | null
  /** ?tablo=0 → Bruneton tabloları kapalı, her ışın eski marşa girer (A/B) */
  tables: boolean
  /**
   * ?b2=0 → disk kesişimleri tablodan ÇIKARILIR, hepsi marşa döner (A/B).
   * Varsayılan AÇIK: Faz B3'ten beri yakalanan ışın da tabloda, marş yalnız jet
   * için. Ölçüm ('yüksek', 2.89 Mpix): B2 11.55 → B3 7.9 ms; aynı karede tam
   * marş 30.85 ms. Ayrıntı: scripts/bruneton-dogrulama/README.md.
   */
  b2: boolean
  /** ?fon=0.3..1 → katmanlı render ölçeği pinlenir; null = kalite kademesi belirler */
  lensScale: number | null
  /**
   * ?aa=1 → tuvale 4× MSAA (ESKİ yol). Varsayılan kapalı: 0.27 ms/Mpix ölçüldü ve
   * yalnız gemi kenarına hizmet ediyordu; kenar yumuşatmayı kırpılmış hedef verir
   * (scene/shipPass.ts). Bağlam özniteliği: çalışma anında değişmez.
   */
  aa: boolean
  /** ?gemiaa=0 → gemi kırpılmış MSAA hedefi yerine doğrudan tuvale (eski yol). ?aa=1 ile birlikte = tam eski görüntü */
  shipMsaa: boolean
  /**
   * ?butce=<ms> → GPU-meşgul bütçesi PİNLENİR (güç modu, pil ve basınç tepkisi
   * kapalı); 0 = açılış ölçümü kapalı, eski FPS-tek governor. null = PowerPolicy
   * karar verir (cihaz sınıfı → mod, pil, Compute Pressure, HUD seçimi).
   */
  budgetOverride: number | null
}

const QUALITY_ASCII: Record<string, string> = { yuksek: 'yüksek', dusuk: 'düşük' }

export function readPins(search: string): Pins {
  const p = new URLSearchParams(search)
  const q = p.get('kalite')
  const fonRaw = p.get('fon')
  const fon = Number(fonRaw)
  const b = p.get('bloom')
  const butceRaw = p.get('butce')
  return {
    qualityPin: q ? (QUALITY_ASCII[q] ?? q) : undefined,
    fpsCap: p.get('fps') === '120' ? 120 : 60,
    hole: p.get('delik'),
    bloomPin: b === null ? null : b !== '0',
    tables: p.get('tablo') !== '0',
    b2: p.get('b2') !== '0',
    lensScale: fonRaw !== null && Number.isFinite(fon) && fon > 0 ? Math.min(Math.max(fon, 0.3), 1) : null,
    aa: p.get('aa') === '1',
    shipMsaa: p.get('gemiaa') !== '0',
    budgetOverride: butceRaw === null ? null : Math.max(0, Number(butceRaw) || 0),
  }
}
