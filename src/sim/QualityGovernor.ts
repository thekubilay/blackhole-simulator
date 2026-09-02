export interface QualityLevel {
  label: string
  dpr: number
  steps: number
  /** bloom mip zinciri bu kademede çizilsin mi (bkz. levels tanımındaki not) */
  bloom: boolean
  /**
   * KATMANLI RENDER: lens fonunun çözünürlük ölçeği (1 = tam). Gemi, parçacık
   * ve HUD bundan ETKİLENMEZ — onlar dpr'da çizilir. Bkz. levels tanımı.
   */
  lensScale: number
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
// 0.83 iken ÖLÇÜLDÜ: 'iyi' kademesi 1512x803 penceresinde 53 fps veriyor, yani
// iniş eşiği (50) ile çıkış eşiği (57) arasına tam ortasına düşüyor — governor
// onu deneyip deneyip geri bırakıyordu. 0.80 bandı genişletir: 48 fps üstünü
// "kabul edilebilir" sayar ve daha keskin kademe yerleşir. BEDELİ ISI: tavanı
// tutturamayan kademe GPU'yu %100 doluluğa çıkarır (60 fps'te 'orta' %86'da
// kalır), fan daha erken döner. Bkz. lens-maliyet-butcesi / ısı çalışması.
// ISI BEDELİNİN ÇÖZÜMÜ TAVAN (2026-09-02): FPS bandı tek başına eldeki tüm payı
// harcar. Açılışta BudgetProbe (scene/budgetProbe.ts) GPU-meşgul süreyi ölçüp
// bütçeye (≤10 ms @ 60 Hz) sığan en yüksek kademeyi TAVAN olarak koyar; FPS
// histerezisi artık yalnız güvenlik ağıdır — aşağı iner, en fazla tavana döner.
const DOWN_RATIO = 0.8 // tavanın altında kabul edilebilir bant (60 → 48)
const UP_RATIO = 0.95 // yalnız tavanı fiilen tutturan kademe yukarı denemesi yapar (60 → 57)
const DOWN_HOLD = 3 // sn — EMA'nın yeni kademede oturmasına izin ver
const UP_HOLD = 12 // sn
const PROOF_HOLD = 60 // sn kesintisiz rahatlık = kademe kendini kanıtladı
// Üstteki kademeyi affetmek çok daha ağır bir kanıt ister: bu kademede rahat
// olmak üsttekinin çalışacağını göstermez. Af eşiği kısa tutulursa (60 sn)
// eskalasyonu tümden yer ve sahne dakikada bir 3 sn'lik kalite çukuruna girer —
// ölçüldü: B senaryosunda 10 dakikada 10 çukur. 15 dk KESİNTİSİZ rahatlık
// (kademe değişimi sayacı sıfırlar) yalnız makine gerçekten boşaldığında dolar;
// tutturamayan bir kademede kararlı hal ~15 dakikada bir 3 sn'lik tek çukurdur.
const FORGIVE_HOLD = 900
const RETRY_BASE = 10 // başarısız kademeye ilk dönüş beklemesi (sn)
const RETRY_GROWTH = 6 // bekleme merdiveni: 10 sn → 60 sn → 6 dk → 30 dk (tavan)
// KALICI YASAK YOKTUR. Sonsuz bekleme, sürdürülemez kademeye çivilenmenin ayna
// görüntüsüdür: üç geçici tökezleme (GC duraklaması, arka planda başka bir GPU
// işi) makine yeniden boşaldığında bile görüntü kalitesini oturum boyu düşürürdü.
// Bekleme üst sınırla kesilir, uzun sakinlik ise cezayı basamak basamak indirir.
const RETRY_MAX = 1800

/**
 * Adaptif kalite (SRP): yalnız FPS ölçer ve seviye seçer; renderer'a
 * dokunmaz — tüketiciler onChange ile dinleyip kendileri uygular (DIP).
 */
export class QualityGovernor {
  private readonly levels: QualityLevel[]
  /** gerçek başlangıç kademesi kurucuda etikete göre seçilir (indeks sabitlemeyin) */
  private level = 0
  private pinned = false
  /**
   * BÜTÇE TAVANI: izin verilen en yüksek kademe (indeks; 0 = kısıt yok). Açılış
   * ölçümü (BudgetProbe) koyar. FPS ağı bunun üstüne tırmanmaz; tavan konunca
   * kademe iki yönde de doğrudan oraya taşınır ("doğru kademe ilk karede").
   */
  private ceiling = 0
  /** BudgetProbe ölçüm karelerinde (hat k kez çizilir, 30-60 ms) askıda: o kareler
   *  FPS ağına sızarsa ağ kademe düşürür ve ölçüm yeniden boyutlanan hedeflerle
   *  kirlenir (yaşandı: yeniden ölçümde 'iyi'ye düştü, 4.2 vs beklenen 2.9 ms) */
  private suspended = false
  private ema = 60
  private acc = 0
  private stable = 0
  /** mevcut kademede KESİNTİSİZ rahat geçen süre (sn) — ceza merdivenini yalnız
   *  bu sıfırlar; 12 sn'lik çıkış penceresi "kanıt" sayılmaz */
  private held = 0
  /** af sayacı: aynı rahatlık serisinde FORGIVE_HOLD'da bir tetiklenir */
  private forgive = 0
  private cap = 60
  private downFps = 60 * DOWN_RATIO
  private upFps = 60 * UP_RATIO
  /** kademe başına "buraya geri tırmanma" beklemesi (sn) — 0 ise serbest */
  private readonly cool: number[]
  /** kademe başına bir sonraki ceza süresi; her başarısızlıkta katlanır */
  private readonly penalty: number[]
  private readonly listeners = new Set<(level: QualityLevel) => void>()

  constructor(deviceRatio: number, coarsePointer = false, pinLabel?: string) {
    // BLOOM YALNIZ EN ÜST KADEMEDE. Maliyeti 2026-09-01'de yeniden ölçüldü ve
    // eski atıf YANLIŞ ÇIKTI: pahalı olan mip zinciri değil, HDR YOLUNUN KENDİSİ.
    // 2.89 Mpix'te üç nokta — zincirli 25.16 ms, zincirsiz ama HDR hedefi duran
    // 25.40 ms (fark gürültünün altında), hattan tümüyle çıkmış 23.26 ms. Yani
    // gerçek kalem yarım-float hedefe çizim + tam ekran birleştirme blit'i +
    // sahnenin iki geçişte çizilmesi. İki kademede ölçüldü: 'yüksek' 2.89 Mpix'te
    // 25.16 → 23.26 (−1.90 ms), 'orta' 1.77 Mpix'te 14.29 → 13.42 (−0.87 ms;
    // tavan 60'ta görünmez, ?fps=120 ile GPU'ya bağlı ölçüldü). Yani kabaca
    // 0.5-0.7 ms/Mpix. Hedef cihazda (1080p = 2.07 Mpix, entegre grafik) bu
    // ~3-4 ms eder: 10 ms'lik bütçenin üçte biri.
    // Karşılığında aldığımız görsel bu sahnede ölçüm sınırında: disk üstü hale
    // 43.4 → 43.6, çünkü shader zaten elle ayarlanmış foton halkası parlaması
    // taşıyor (minR tabanlı iki exp terimi) ve sahnenin doğrusal tepesi yalnız
    // 4.3 — ACES omzu eklenen ışığı yutuyor. Bloom'un fiilen yaptığı iş gölgeyi
    // kaldırmak (0.3 → 6.2). Bu yüzden yalnız 'yüksek'te açık: o kademeye ancak
    // gerçekten payı olan makine tırmanır. Kapalıyken lens kendi ton eşlemesini
    // yapar ve doğrudan tuvale çizer — HDR desteği olmayan cihazın zaten
    // yıllardır kullandığı yol; gölge de daha temiz siyah kalır.
    // MERDİVEN YENİDEN KURULDU (2026-09-01, Bruneton sonrası ölçümlerle).
    //
    // (1) dpr YERİNE lensScale: eskiden her kademe dpr'ı indiriyordu, yani
    //     GEMİ, HUD ve YAZI da bulanıklaşıyordu. Lens artık ayrı bir hedefe
    //     çizildiği için yalnız FONU küçültebiliyoruz; üstüne gelen her şey
    //     tam çözünürlükte kalıyor. Lens maliyeti piksele doğrusal
    //     (2.04 ms/Mpix ölçüldü) olduğundan (dpr × lensScale)² eski dpr² ile
    //     aynı işi görür — bedeli çıktı tarafının büyümesi (0.68 ms/Mpix).
    // (2) ALT İKİ KADEMEDE dpr DA İNİYOR: orada bütçe dar ve çıktı tarafının
    //     (birleştirme blit'i + sahne geçişi) maliyeti de sayılır; yalnız fonu
    //     küçültmek yetmez.
    // (3) ADIM MERDİVENİ DÜZLEŞTİ: marş artık yalnız yakalanan ışınlar ve jet
    //     için koşuyor, adım duyarlılığı 12× azaldı (0.0025 vs 0.029
    //     ms/adım/Mpix ölçüldü). Üst iki kademede 240 artık bedavaya yakın.
    //     Alt kademelerde yine de kısılıyor: zayıf GPU'da 90 adım ~1.4 ms.
    this.levels = [
      { label: 'yüksek', dpr: Math.min(deviceRatio, 1.6), steps: 240, bloom: true, lensScale: 1.0 },
      // 60 fps bütçesi 'yüksek' ile 'orta' arasına düşüyordu: ara kademe olmadan
      // governor 40 fps'e ya da gereğinden yumuşak bir görüntüye mahkûmdu
      { label: 'iyi', dpr: Math.min(deviceRatio, 1.6), steps: 240, bloom: false, lensScale: 0.85 },
      { label: 'orta', dpr: Math.min(deviceRatio, 1.6), steps: 220, bloom: false, lensScale: 0.75 },
      // kalite tabanı (masaüstü): bundan daha bloklu asla olmaz
      { label: 'düşük', dpr: Math.min(deviceRatio, 1.25), steps: 200, bloom: false, lensScale: 0.75 },
    ]
    this.level = this.indexOf('orta')
    if (coarsePointer || pinLabel === 'mobil') {
      // telefon GPU'su tabana da yetişemezse son çare — yalnız dokunmatik cihazlarda
      // (pin ile masaüstünde de görsel/performans testi için zorlanabilir)
      // Telefonda çıktı tarafı da pahalı: dpr düşük kalır, fon ek olarak kısılır
      this.levels.push({ label: 'mobil', dpr: 0.75, steps: 150, bloom: false, lensScale: 0.85 })
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
    this.forgive = 0
    this.cool.fill(0)
    this.penalty.fill(RETRY_BASE)
  }

  /** Kare tavanı (fps); BudgetProbe tavan-üstü ölçümünü buna göre kurar. */
  get frameCap(): number {
    return this.cap
  }

  /**
   * Bütçe tavanını koyar (BudgetProbe). Pinli değilse kademe doğrudan tavana
   * taşınır — aşağı da yukarı da: ölçüm "bu cihaz şunu sessiz çalıştırır" der,
   * 12 sn'lik FPS tırmanışını beklemek anlamsızdır. Pinliyken yalnız kaydedilir.
   */
  setCeiling(index: number): void {
    const i = Math.max(0, Math.min(Math.floor(index), this.levels.length - 1))
    this.ceiling = i
    if (this.pinned || this.level === i) return
    this.level = i
    this.stable = 0
    this.held = 0
    this.forgive = 0
    this.notify()
  }

  get ceilingLabel(): string {
    return this.levels[this.ceiling].label
  }

  /** Ölçüm kareleri boyunca FPS ağı durur; kalkınca EMA tavana sıfırlanır. */
  setSuspended(on: boolean): void {
    if (this.suspended === on) return
    this.suspended = on
    if (!on) {
      this.ema = this.cap
      this.acc = 0
    }
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
      // elle tavanın üstüne çıkılmışsa otomatik tavana döner
      if (this.level < this.ceiling) {
        this.level = this.ceiling
        this.notify()
      }
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
    if (this.suspended) return
    const fps = 1 / Math.max(dt, 1e-4)
    this.ema += (fps - this.ema) * 0.06
    this.acc += dt
    this.stable += dt
    if (this.ema > this.upFps) {
      this.held += dt
      this.forgive += dt
    } else {
      this.held = 0
      this.forgive = 0
    }
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
    // (held SIFIRLANMAZ: koşul idempotent, sıfırlarsak af eşiğine hiç ulaşılmaz)
    if (this.held > PROOF_HOLD) this.penalty[this.level] = RETRY_BASE
    // UZUN sakinlik üstteki kademeyi de affeder: cezası bir basamak iner ve
    // bekleyen süresi kısalır. Af kademeli, sıfırlama değil — bu kademede rahat
    // olmak üsttekinin çalışacağını kanıtlamaz (elbette rahat, daha ucuz).
    const up = this.level - 1
    if (this.forgive > FORGIVE_HOLD && up >= 0) {
      this.penalty[up] = Math.max(RETRY_BASE, this.penalty[up] / RETRY_GROWTH)
      this.cool[up] = Math.min(this.cool[up], this.penalty[up])
      this.forgive = 0
    }
    if (this.ema < this.downFps && this.stable > DOWN_HOLD && this.level < this.levels.length - 1) {
      // Bu kademe hedefi tutturamadı: aynı yere hemen geri tırmanmak yasak.
      // Bekleme katlanır (10 sn → 60 sn → 6 dk → 30 dk tavanı); yoksa iki kademe
      // arasında sonsuza dek salınırdı — kullanıcı için FPS'in sabit kalmasından
      // beter. Tavana ulaşınca deneme seyrekleşir ama hiç bitmez: makine
      // boşalırsa kalite geri gelir.
      this.cool[this.level] = this.penalty[this.level]
      this.penalty[this.level] = Math.min(this.penalty[this.level] * RETRY_GROWTH, RETRY_MAX)
      this.level++
      this.stable = 0
      this.held = 0
      this.forgive = 0
      this.notify()
    } else if (
      this.ema > this.upFps &&
      this.stable > UP_HOLD &&
      this.level > this.ceiling && // bütçe tavanının üstüne asla
      this.cool[this.level - 1] <= 0
    ) {
      this.level--
      this.stable = 0
      this.held = 0
      this.forgive = 0
      this.notify()
    }
  }

  private notify(): void {
    const level = this.current
    this.listeners.forEach((fn) => fn(level))
  }
}
