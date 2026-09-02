import type { QualityGovernor, QualityLevel } from '../sim/QualityGovernor'

/**
 * BÜTÇE PROBE'U — açılışta GPU-MEŞGUL kare süresini ölçer, kalite TAVANINI seçer
 * (SRP: tek iş — ölç, tahmin et, governor'a tavanı söyle).
 *
 * NEDEN: governor FPS'e bakıyordu ve tasarım gereği tökezlediği yere kadar
 * tırmanıyordu — 48-60 fps bandı GPU %100 doluluk demek, fan döner. Hedef
 * "fan dönmesin" = GPU doluluğu ≤ ~%60 = 60 Hz'de ≤ 10 ms MEŞGUL süre. Ama:
 *   • rAF deltası tavanı aşamaz — 6 ms'lik kare de 16.7 okunur, pay görünmez;
 *   • GPU zamanlayıcısı ANGLE/Metal'de per-draw izole etmez (hafıza:
 *     gpu-maliyet-olcum-kosumu), güvenilmez.
 * ÇÖZÜM: hattın tamamını AYNI KAREDE k kez çizip kareyi tavanın üstüne
 * çıkarmak. İki k noktasının EĞİMİ = bir hattın GPU-meşgul süresi; sunum /
 * zamanlama boşluğu (ölçülen ~2 ms, ısıtmaz) kesim noktasına düşer ve
 * bütçeden sayılmaz. Uyarlanır k: hedef ~40 ms'lik kare (tavanın rahat üstü,
 * takılma sınırlı); yavaş cihazda k küçük, hızlıda büyük.
 *
 * TUZAK: Apple TBDR özdeş çizimleri tekilleştirir (10 çizim = 1 çizim süresi).
 * Bu yüzden her tekrar öncesi lens'in uTime'ı dürtülür (BloomPipeline.lensNudge)
 * — çizimler özdeş değil, eğim gerçek.
 *
 * TAHMİN: ölçüm governor'ın BAŞLANGIÇ kademesinde yapılır (kademe değiştirme
 * yok, titreme yok). Diğer kademeler modelle: lens maliyeti lens Mpix'ine
 * doğrusal (ölçüldü, 1.47 ms/Mpix M1), bloom tuval Mpix'ine doğrusal ve lens'in
 * ~%25'i (0.37/1.47 M1 — cihazdan bağımsız VARSAYIM; şaşarsa FPS ağı düzeltir).
 * Adım sayısı yok sayılır (duyarlılık 12× azaldı, 0.0025 ms/adım/Mpix).
 *
 * ROLLER: probe TAVANI koyar (cihazın çıkabileceği en yüksek kademe), FPS
 * histerezisi GÜVENLİK AĞI kalır — yalnız aşağı iner, en fazla tavana döner:
 * ısıl kısılma, arka plan GPU işi, gerçekçi modda jet (marşta), kenetlenmede
 * büyüyen gemi hedefi. 120 Hz'de bütçe DEĞİŞMEZ (bilinçli "akıcılık" tercihi;
 * HUD söyler: fan dönebilir). Tuval CSS boyutu %20'den çok değişince yeniden
 * ölçülür. `?butce=<ms>` pini; 0 = kapalı (eski davranış, A/B).
 */

/** bloom / lens ms-per-Mpix oranı (M1 Pro: 0.37 / 1.47) */
const BLOOM_RATIO = 0.25
/** çıktı tarafı (kompozit blit, gemi, parçacık) / lens oranı; TUVAL Mpix'iyle
 *  ölçeklenir, lens Mpix'iyle değil (M1: ~0.4 / 1.47). Eksikken 'orta'dan
 *  'yüksek' tahmini %24 fazlaydı (6.47 vs 5.22 ölçülen); bununla %5. */
const OUT_RATIO = 0.27
/** tuval sunumu (kompozitör kopyası) eğime girmez; küçük ama gerçek GPU işi */
const MARGIN_MS = 1.0
/** shader derlemesi, tablo/gürültü pişirme ve ilk kareler otursun */
const SETTLE_FRAMES = 12
/** nokta başına kare (ilki atılır, kalanların medyanı) */
const FRAMES_PER_POINT = 7
/** geçerli nokta: kare bu oranda tavanın üstünde olmalı (vsync titremesi değil) */
const ABOVE_CAP = 1.3
/** k1 bu kadar tavan hedefler (≈27 ms @ 60 Hz), k2 = 2·k1 (≈53 ms) */
const K1_TARGET_CAPS = 1.6
const K_MIN = 2
const K_MAX = 32
/** bu oranda CSS piksel değişimi yeniden ölçüm ister … */
const RESIZE_RATIO = 0.2
/** … ama ancak bu kadar kare (≈1 sn) boyunca sürerse (sürükleme bitmiş olsun) */
const RESIZE_SETTLE_FRAMES = 60

type Phase = 'off' | 'settle' | 'scout' | 'scout2' | 'p1' | 'p2' | 'done'

export interface BudgetPrediction {
  label: string
  /** tahmini GPU-meşgul kare süresi (ms), pay dahil */
  ms: number
}

export interface BudgetResult {
  /** ölçüm kademesinde bir hattın GPU-meşgul süresi (ms) — eğim */
  busyMs: number
  k: [number, number]
  medians: [number, number]
  measuredAt: string
  mpix: number
  predicted: BudgetPrediction[]
  ceiling: string
  budgetMs: number
}

export class BudgetProbe {
  private phase: Phase
  private frames = 0
  private samples: number[] = []
  private lastRepeats = 1
  private k1 = 4
  private k2 = 8
  private m1 = 0
  private cssMpixAtDone = 0
  /** tuval boyutu sapması bu kadar ARDIŞIK kare sürmeli (sürükleyerek boyutlandırma
   *  sırasında her ara boyutta yeniden ölçüm yapılmasın — ölçüm ~25 ağır kare) */
  private resizedFrames = 0
  /** son ölçüm karesinin dt'si bir sonraki karede gelir: ağ ondan sonra kalkar */
  private pendingResume = false
  /** son ölçüm (DEV konsolu / `__butce`) */
  result: BudgetResult | null = null

  private readonly governor: QualityGovernor
  private budgetMs: number
  /** PowerPolicy'nin basınç nedeniyle istediği ek kademe düşüşü */
  private extraDrop = 0

  constructor(governor: QualityGovernor, budgetMs: number) {
    this.governor = governor
    this.budgetMs = budgetMs
    this.phase = budgetMs > 0 ? 'settle' : 'off'
  }

  /** Yeniden ölç (DEV / tuval değişimi). */
  restart(): void {
    if (this.budgetMs <= 0) return
    this.phase = 'settle'
    this.frames = 0
    this.samples = []
  }

  /**
   * Bütçe değişti (güç modu, pil, pin). Yeniden ÖLÇÜM gerekmez: tahminler
   * duruyor, tavan yeniden seçilir. 0 = kapalı (eski davranış, tavan yok).
   */
  setBudget(ms: number): void {
    if (ms === this.budgetMs) return
    const wasOff = this.budgetMs <= 0
    this.budgetMs = ms
    if (ms <= 0) {
      // ölçüm ortasında kapatılırsa ağ askıda kalmasın
      this.governor.setSuspended(false)
      this.pendingResume = false
      this.phase = 'off'
      this.governor.setCeiling(0)
      return
    }
    if (wasOff || this.phase === 'off') this.restart()
    else if (this.phase === 'done') this.applyCeiling()
  }

  setExtraDrop(n: number): void {
    if (n === this.extraDrop) return
    this.extraDrop = n
    if (this.phase === 'done') this.applyCeiling()
  }

  /** Tahminlerden tavanı seç (bütçeye sığan ilk kademe + basınç düşüşü) ve uygula. */
  private applyCeiling(): void {
    const r = this.result
    if (!r) return
    let ceiling = r.predicted.findIndex((p) => p.ms <= this.budgetMs)
    if (ceiling < 0) ceiling = r.predicted.length - 1
    ceiling = Math.min(ceiling + this.extraDrop, r.predicted.length - 1)
    r.ceiling = r.predicted[ceiling].label
    r.budgetMs = this.budgetMs
    this.governor.setCeiling(ceiling)
  }

  /**
   * Her karede, hat çizilmeden ÖNCE çağrılır. `dt` bir ÖNCEKİ karenin süresidir
   * (rAF aralığı), yani önceki karenin tekrar sayısına ait örnektir. Dönen değer
   * bu karede hattın kaç kez çizileceği.
   */
  frame(dt: number, mpix: number): number {
    if (this.phase === 'off') return 1
    // Governor pinliyken (?kalite=, elle seçim) tavan yok sayılır: ölçüm kimsenin
    // kullanmadığı bir sayı için ~25 ağır kare ve ölçüm oturumunun ilk saniyesini
    // kirletir. Koşma; otomatiğe dönülünce settle'dan başla. Pin ölçüm ortasında
    // gelirse askıyı kaldır.
    if (!this.governor.auto) {
      if (this.phase !== 'done' && this.phase !== 'settle') {
        this.governor.setSuspended(false)
        this.enter('settle')
      }
      return (this.lastRepeats = 1)
    }
    const capMs = 1000 / this.governor.frameCap
    // gizli sekme / uzun takılma: örnek değil, durum ilerlemez
    const valid = dt > 0 && dt < 0.5 && !document.hidden
    const dtMs = dt * 1000

    if (this.phase === 'done') {
      if (this.pendingResume) {
        // bu karenin tick'i (öncelik 0, bizden önce) son ağır kareyi askıda yedi
        this.pendingResume = false
        this.governor.setSuspended(false)
      }
      const cssMpix = this.cssMpix(mpix)
      const resized = Math.abs(cssMpix - this.cssMpixAtDone) > RESIZE_RATIO * this.cssMpixAtDone
      this.resizedFrames = resized ? this.resizedFrames + 1 : 0
      if (this.resizedFrames >= RESIZE_SETTLE_FRAMES) {
        this.resizedFrames = 0
        this.restart()
      }
      return (this.lastRepeats = 1)
    }

    if (this.phase === 'settle') {
      if (valid) this.frames++
      if (this.frames >= SETTLE_FRAMES) {
        // ölçüm kareleri FPS ağına sızmasın (bkz. QualityGovernor.setSuspended)
        this.governor.setSuspended(true)
        this.enter('scout')
      }
      return (this.lastRepeats = 1)
    }

    // ölçüm fazları: önceki karenin örneğini topla
    const k =
      this.phase === 'scout' ? 4 : this.phase === 'scout2' ? 12 : this.phase === 'p1' ? this.k1 : this.k2
    if (valid && this.lastRepeats === k) this.samples.push(dtMs)
    const need = this.phase === 'p1' || this.phase === 'p2' ? FRAMES_PER_POINT : 5
    if (this.samples.length >= need) {
      const m = median(this.samples.slice(1))
      if (this.phase === 'scout' || this.phase === 'scout2') {
        // Kaba tahmin: kare tavanın üstündeyse m/k. k=4 tavanda kalırsa (hızlı
        // cihaz: meşgul < ~4 ms) k=12 ile bir tur daha; o da tavandaysa üst sınır.
        if (m <= ABOVE_CAP * capMs && this.phase === 'scout') {
          this.enter('scout2')
        } else {
          const busyEst = m > ABOVE_CAP * capMs ? m / k : (ABOVE_CAP * capMs) / k
          this.k1 = Math.min(Math.max(Math.ceil((K1_TARGET_CAPS * capMs) / busyEst), K_MIN), K_MAX / 2)
          this.k2 = Math.min(this.k1 * 2, K_MAX)
          this.enter('p1')
        }
      } else if (this.phase === 'p1') {
        this.m1 = m
        this.enter('p2')
      } else {
        this.finish(m, mpix, capMs)
      }
    }
    return (this.lastRepeats = k)
  }

  private enter(phase: Phase): void {
    this.phase = phase
    this.samples = []
    this.frames = 0
  }

  private cssMpix(mpix: number): number {
    const d = this.governor.current.dpr
    return mpix / (d * d)
  }

  private finish(m2: number, mpix: number, capMs: number): void {
    const { k1, k2, m1 } = this
    // İki nokta da tavanın üstündeyse EĞİM (kesim noktası = sunum boşluğu, dışarıda
    // kalır). Yalnız k2 üstteyse m2/k2 (boşluk/k2 kadar fazla tahmin, muhafazakâr).
    // İkisi de tavandaysa meşgul süre ölçülemeyecek kadar küçük: 0.
    const above = (m: number) => m > ABOVE_CAP * capMs
    const busy = above(m1) && above(m2) ? Math.max((m2 - m1) / (k2 - k1), 0) : above(m2) ? m2 / k2 : 0
    const at = this.governor.current
    const cssMpix = this.cssMpix(mpix)
    // model: meşgul = lensPer × [lensMpix + OUT·mpix + (bloom ? BLOOM·mpix : 0)]
    const weight = (l: QualityLevel, px: number) =>
      px * l.lensScale * l.lensScale + OUT_RATIO * px + (l.bloom ? BLOOM_RATIO * px : 0)
    const w0 = weight(at, mpix)
    const lensPerMpix = w0 > 0 ? busy / w0 : 0
    const predicted: BudgetPrediction[] = this.governor.options.map((l: QualityLevel) => {
      const px = cssMpix * l.dpr * l.dpr
      return { label: l.label, ms: +(lensPerMpix * weight(l, px) + MARGIN_MS).toFixed(2) }
    })
    this.result = {
      busyMs: +busy.toFixed(2),
      k: [k1, k2],
      medians: [+m1.toFixed(1), +m2.toFixed(1)],
      measuredAt: at.label,
      mpix: +mpix.toFixed(2),
      predicted,
      ceiling: '',
      budgetMs: this.budgetMs,
    }
    this.cssMpixAtDone = cssMpix
    this.phase = 'done'
    this.pendingResume = true
    this.applyCeiling()
    if (import.meta.env.DEV) {
      console.info(
        `[bütçe] ${at.label} @ ${mpix.toFixed(2)} Mpix: meşgul ${busy.toFixed(2)} ms/hat ` +
          `(k ${k1}/${k2} → ${m1.toFixed(1)}/${m2.toFixed(1)} ms) · bütçe ${this.budgetMs} ms · tavan ${this.result.ceiling} · ` +
          predicted.map((p) => `${p.label} ${p.ms}`).join(' · '),
      )
    }
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[s.length >> 1] : 0
}
