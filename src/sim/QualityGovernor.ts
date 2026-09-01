export interface QualityLevel {
  label: string
  dpr: number
  steps: number
}

// Denetim eşikleri. ESKİ TASARIMIN HATASI: çıkış eşiği 48, iniş eşiği 26 idi —
// yani çıkış eşiği, çıkılan kademenin gerçekte verebildiği hızın (40 fps)
// ÜSTÜNDEYDİ. Governor sürdüremeyeceği kademeye kaçınılmaz olarak tırmanıyor,
// 40 fps hiçbir zaman 26'nın altına inmediği için de bir daha asla geri
// inmiyordu. Ölçüm: 11. saniyede 59 → 39 fps, kalıcı. Histerezis bandı artık
// kare tavanını bracket'liyor: 60'ın altına sarkan her kademe terk edilir.
// Eşikler KARE TAVANININ ORANI olarak tutulur, mutlak fps olarak değil: tavan
// çalışma anında 120'ye çıkabiliyor (LabController.setFpsCap, ?fps=120). Sabit
// 50/57 ile 120 tavanında 70 fps veren bir kademe hem "rahat" (57 üstü) hem
// "sorunsuz" (50 üstü) sayılır, governor en pahalı kademeye tırmanıp bir daha
// inmezdi — düzeltilen hatanın 120'lik ölçekte birebir tekrarı.
const DOWN_RATIO = 0.83 // tavanın belirgin altına sarkan kademe terk edilir (60 → 50)
const UP_RATIO = 0.95 // yalnız tavanı fiilen tutturan kademe yukarı denemesi yapar (60 → 57)
const DOWN_HOLD = 3 // sn — EMA'nın yeni kademede oturmasına izin ver
const UP_HOLD = 12 // sn
const PROOF_HOLD = 60 // sn kesintisiz rahatlık = kademe kendini kanıtladı
const RETRY_BASE = 10 // başarısız kademeye ilk dönüş beklemesi (sn)
const RETRY_GROWTH = 6 // 10 → 60 → kalıcı yasak: en fazla üç kısa çukur, sonra sessizlik
const RETRY_MAX = 60

/**
 * Adaptif kalite (SRP): yalnız FPS ölçer ve seviye seçer; renderer'a
 * dokunmaz — tüketiciler onChange ile dinleyip kendileri uygular (DIP).
 */
export class QualityGovernor {
  private readonly levels: QualityLevel[]
  /** gerçek başlangıç kademesi kurucuda etikete göre seçilir (indeks sabitlemeyin) */
  private level = 0
  private pinned = false
  private ema = 60
  private acc = 0
  private stable = 0
  /** mevcut kademede KESİNTİSİZ rahat geçen süre (sn) — ceza merdivenini yalnız
   *  bu sıfırlar; 12 sn'lik çıkış penceresi "kanıt" sayılmaz */
  private held = 0
  private cap = 60
  private downFps = 60 * DOWN_RATIO
  private upFps = 60 * UP_RATIO
  /** kademe başına "buraya geri tırmanma" beklemesi (sn) — 0 ise serbest */
  private readonly cool: number[]
  /** kademe başına bir sonraki ceza süresi; her başarısızlıkta katlanır */
  private readonly penalty: number[]
  private readonly listeners = new Set<(level: QualityLevel) => void>()

  constructor(deviceRatio: number, coarsePointer = false, pinLabel?: string) {
    this.levels = [
      { label: 'yüksek', dpr: Math.min(deviceRatio, 1.6), steps: 240 },
      // 60 fps bütçesi 'yüksek' ile 'orta' arasına düşüyordu: ara kademe olmadan
      // governor 40 fps'e ya da gereğinden yumuşak bir görüntüye mahkûmdu
      { label: 'iyi', dpr: Math.min(deviceRatio, 1.4), steps: 215 },
      { label: 'orta', dpr: Math.min(deviceRatio, 1.25), steps: 185 },
      // kalite tabanı (masaüstü): bundan daha bloklu asla olmaz
      { label: 'düşük', dpr: 1.0, steps: 150 },
    ]
    this.level = this.indexOf('orta')
    if (coarsePointer || pinLabel === 'mobil') {
      // telefon GPU'su tabana da yetişemezse son çare — yalnız dokunmatik cihazlarda
      // (pin ile masaüstünde de görsel/performans testi için zorlanabilir)
      this.levels.push({ label: 'mobil', dpr: 0.75, steps: 110 })
      this.level = this.indexOf('düşük') // dokunmatikte tabandan başla; güç yeterse tırmanır
    }
    this.cool = this.levels.map(() => 0)
    this.penalty = this.levels.map(() => RETRY_BASE)
    // test/karşılaştırma: ?kalite=... ile seviye sabitlenir, adaptasyon kapanır
    if (pinLabel) {
      const i = this.levels.findIndex((l) => l.label === pinLabel)
      if (i >= 0) {
        this.level = i
        this.pinned = true
      }
    }
  }

  private indexOf(label: string): number {
    const i = this.levels.findIndex((l) => l.label === label)
    return i < 0 ? 0 : i
  }

  get current(): QualityLevel {
    return this.levels[this.level]
  }

  /** Bu cihazda kullanılabilir seviyeler (HUD kalite menüsü için). */
  get options(): readonly QualityLevel[] {
    return this.levels
  }

  /** true = FPS'e göre adaptif; false = elle/URL ile sabitlenmiş. */
  get auto(): boolean {
    return !this.pinned
  }

  /**
   * Canlı kare tavanını bildirir (60 ya da 120). Eşikler buradan türer; tavan
   * değişince EMA ve ceza geçmişi SIFIRLANIR — bir tavanda ölçülen "rahat/dar"
   * yargısı diğerine taşınmaz (60'ta rahat olan kademe 120'de dar kalır).
   */
  setFrameCap(cap: number): void {
    if (cap === this.cap) return
    this.cap = cap
    this.downFps = cap * DOWN_RATIO
    this.upFps = cap * UP_RATIO
    this.ema = cap
    this.stable = 0
    this.acc = 0
    this.held = 0
    this.cool.fill(0)
    this.penalty.fill(RETRY_BASE)
  }

  /** Elle seviye seç (adaptasyonu kapatır); null = otomatiğe dön. */
  setLevel(label: string | null): void {
    if (label === null) {
      this.pinned = false
      this.stable = 0
      this.acc = 0
      this.held = 0
      // otomatiğe dönüş temiz bir sayfa: elle seçim sahne maliyetinin değiştiği
      // anlamına da gelebilir, eski cezalar keşfi kilitlemesin
      this.cool.fill(0)
      this.penalty.fill(RETRY_BASE)
      return
    }
    const i = this.levels.findIndex((l) => l.label === label)
    if (i < 0) return
    this.pinned = true
    if (i !== this.level) {
      this.level = i
      this.stable = 0
      this.notify()
    }
  }

  get fps(): number {
    return this.ema
  }

  get label(): string {
    return this.current.label
  }

  onChange(fn: (level: QualityLevel) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  tick(dt: number): void {
    const fps = 1 / Math.max(dt, 1e-4)
    this.ema += (fps - this.ema) * 0.06
    this.acc += dt
    this.stable += dt
    this.held = this.ema > this.upFps ? this.held + dt : 0
    for (let i = 0; i < this.cool.length; i++) {
      if (this.cool[i] > 0) this.cool[i] = Math.max(this.cool[i] - dt, 0)
    }
    if (this.pinned) return
    if (this.acc < 1.5) return
    this.acc = 0
    // Kademe kendini KANITLADI (bir dakika kesintisiz tavanda): tek seferlik bir
    // takılmanın (GC, GPU tökezlemesi) cezası oturum boyu taşınmasın. Ölçüt
    // bilerek çıkış penceresinden uzun — yoksa komşusu cezalı olduğu için yerinde
    // duran bir kademe merdivenini her turda silip kalıcı yasağa hiç ulaşamazdı.
    if (this.held > PROOF_HOLD) {
      this.penalty[this.level] = RETRY_BASE
      this.held = 0
    }
    if (this.ema < this.downFps && this.stable > DOWN_HOLD && this.level < this.levels.length - 1) {
      // Bu kademe hedefi tutturamadı: aynı yere hemen geri tırmanmak yasak.
      // Ceza katlanır (10 sn → 60 sn → kalıcı); yoksa iki kademe arasında
      // sonsuza dek salınırdı — kullanıcı için FPS'in sabit kalmasından beter.
      // Kalıcı yasağı yalnız elle kalite seçimi (setLevel) kaldırır.
      this.cool[this.level] = this.penalty[this.level]
      this.penalty[this.level] =
        this.penalty[this.level] >= RETRY_MAX ? Infinity : this.penalty[this.level] * RETRY_GROWTH
      this.level++
      this.stable = 0
      this.held = 0
      this.notify()
    } else if (
      this.ema > this.upFps &&
      this.stable > UP_HOLD &&
      this.level > 0 &&
      this.cool[this.level - 1] <= 0
    ) {
      this.level--
      this.stable = 0
      this.held = 0
      this.notify()
    }
  }

  private notify(): void {
    const level = this.current
    this.listeners.forEach((fn) => fn(level))
  }
}
