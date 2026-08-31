import type { GeodesicEngine } from './geodesics'
import { Schwarzschild } from './schwarzschild'
import { KerrEngine, kerrCircularM, kerrIscoM } from './kerr'

/**
 * Gerçek kara delik kartları. Kütle, spin ve uzaklık değerleri yayımlanmış
 * ölçümlerden alınır — uydurma parametre yoktur; ölçülmemiş bir değer varsa
 * (SS 433'ün spini gibi) künyede "ölçülmedi" olarak yazılır.
 *
 * Dinamik ve görsel farklar da gerçek fizikten türetilir:
 *  - disk iç kenarı = ISCO (Kerr, spine bağlı),
 *  - iç disk parlaklık/beyazlığı = ışıma verimi η = 1 − E_ISCO (Novikov–Thorne),
 *  - ufka yaklaşma ölçekleri (donma/sönme) r₊'dan türetilir,
 *  - gelgit kopma eşiği T ∝ M/r³ ile ölçeklenir — süper kütleli deliklerde
 *    kopma yarıçapı ufkun İÇİNDE kalır, cisim parçalanmadan ufku geçer.
 *
 * Her deliğin gözlenmiş görsel imzası (disk kalınlığı/değişkenliği, jet,
 * çevredeki bulutsu) HoleVisual'da taşınır ve doğrudan lens shader'ına gider.
 * Jet UZUNLUKLARI sahne ölçeğine sıkıştırılmıştır (gerçek jetler binlerce
 * ışıkyılı, disk ise burada 13.5 r₊); açı, hız ve precession GERÇEKTİR.
 */

const G = 6.674e-11
const C = 2.998e8
const MSUN = 1.989e30
/** r_g = GM/c² for 1 M☉ (m) */
const RG_SUN = (G * MSUN) / (C * C)
/** gelgit kopma kalibrasyonu: referans 10 M☉ deliğinde rs biriminde */
const REF_MASS_SOLAR = 10
const REF_RS_M = 2 * RG_SUN * REF_MASS_SOLAR
/** shader zamanı bu periyotta sarılır (LabController.advance) — çevrimsel
 * hızlar buna oturtulursa sarma anında faz sıçraması olmaz */
const TIME_WRAP = 7200

/** uTime sarmasında faz sıçramasını önlemek için oranı 1/7200'ün katına oturt */
const wrapRate = (perSec: number): number => Math.max(1, Math.round(perSec * TIME_WRAP)) / TIME_WRAP

export type Vec3 = readonly [number, number, number]
export type Vec4 = readonly [number, number, number, number]

/** Simulation'a giden, deliğe özgü görsel/dinamik eşikler (sahne birimi r−1). */
export interface HoleProfile {
  minSpawnR: number
  fadeStart: number
  freezeFade: number
  killDist: number
  /** gövde kopma yarıçapı çarpanı: etkin breakR = tanımdaki breakR × bu */
  breakFactor: number
  /** disk iç kenarı = ISCO (sahne birimi) — plazma sürtünmesi de burada başlar */
  diskIn: number
  diskOut: number
}

/**
 * Deliğin GÖZLENMİŞ görüntüsünü shader'a taşıyan katman. Alanlar doğrudan
 * uniform'a karşılık gelir; birimler sahne birimidir (r₊ = 1).
 */
export interface HoleVisual {
  /** disk yarı-kalınlık çarpanı: 1 = ince Shakura–Sunyaev, >2 = şişkin RIAF */
  diskThick: number
  /** genel disk parlaklığı — Eddington oranıyla ölçekli (kuasar parlak, RIAF sönük) */
  diskGlow: number
  /** (genlik, çevrim/sn) — parlaklık değişkenliği: GRS 1915 limit-cycle, Sgr A* flare */
  diskVar: readonly [number, number]
  /** (genlik, tur/sn) — azimut lekeliliği / dönen sıcak nokta (Sgr A*'ın "titrek" diski) */
  diskPatch: readonly [number, number]
  /** arka plan bulutsusunun rengi (lineer, ACES öncesi) */
  nebColor: Vec3
  /** (bulutsu yoğunluğu, yıldız yoğunluğu çarpanı) */
  nebPar: readonly [number, number]
  /** jet: (güç, β = v/c, taban yarıçapı, alevlenme d(yarıçap)/d(yükseklik)) */
  jetA: Vec4
  /** jet: (taban yüksekliği, uzunluk, precession tanα, precession rad/sn) */
  jetB: Vec4
  /** jet: (sarmal dalga sayısı 1/birim, düğüm dalga sayısı, düğüm hızı, kenar keskinliği) */
  jetC: Vec4
  /** jet rengi (sinkrotron: mavi-beyaz; SS 433'ün optik çizgileri: kızıl) */
  jetColor: Vec3
}

export interface BlackHolePreset {
  id: string
  name: string
  /** buton etiketi */
  label: string
  /** buton altındaki tek kelimelik ayırt edici (neden ünlü) */
  tag: string
  spinLabel: string
  massLabel: string
  massSolar: number
  spin: number
  engine: GeodesicEngine
  /** olay ufku yarıçapı (m) — sahne biriminin fiziksel karşılığı */
  rPlusMeters: number
  /** bir sahne-zaman biriminin ms karşılığı: r₊/c */
  timeUnitMs: number
  profile: HoleProfile
  visual: HoleVisual
  desc: string
  /** KARA DELİKLER sekmesindeki tanıtım metni: keşif hikâyesi + ekranda
   * görünenin nedeni (desc, delik değişince çıkan tek satırlık ipucudur) */
  about: string
  /** Dünya'dan uzaklık (ışıkyılı) — yayımlanmış paralaks/kırmızıya kayma ölçümleri */
  distanceLy: number
  /** künyedeki disk karakteri satırı */
  diskLabel: string
  /** künyedeki jet satırı */
  jetLabel: string
  /** tanıtımın altındaki kaynak satırı */
  refs: string
  /** ışıma verimi η = 1 − E_ISCO — iç disk parlaklığını sürer (Novikov–Thorne) */
  efficiency: number
}

/** Jeti olmayan delikler için (Sgr A*): güç 0 ⇒ shader jet dalını hiç girmez. */
const NO_JET: Pick<HoleVisual, 'jetA' | 'jetB' | 'jetC' | 'jetColor'> = {
  jetA: [0, 0, 0, 0],
  jetB: [0, 0, 0, 0],
  jetC: [0, 0, 0, 0],
  jetColor: [0, 0, 0],
}

/**
 * Ufka yaklaşma ölçekleri r₊'dan türetilir: yüksek spinde ufuk küçülür
 * (r₊ → M), sönme/donma bandı da onunla birlikte daralır. Katsayılar
 * A0620-00 (a*=0.12) ve Cygnus X-1 (a*>0.9985) için elle ayarlanmış eski
 * değerleri birebir üretir.
 */
function horizonScales(rp: number): Omit<HoleProfile, 'breakFactor' | 'diskIn' | 'diskOut'> {
  const g = rp - 1
  return {
    minSpawnR: 1 + Math.max(0.05, 0.3 * g),
    fadeStart: Math.max(0.02, 0.112 * g),
    freezeFade: Math.max(0.008, 0.047 * g),
    killDist: Math.max(0.002, 0.02 * g),
  }
}

/** 6,5 milyar M☉ ile 4,3 M☉ aynı satırda okunabilsin diye insanlaştırma */
function fmtMass(m: number): string {
  const tr = (x: number, d: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: d })
  if (m >= 1e9) return `${tr(m / 1e9, 2)} milyar M☉`
  if (m >= 1e6) return `${tr(m / 1e6, 2)} milyon M☉`
  return `${tr(m, 1)} M☉`
}

/** olay ufku yarıçapı: km → milyon km → astronomi birimi (M87* 92 AB'dir) */
export function fmtHorizon(meters: number): string {
  const AU = 1.495978707e11
  const tr = (x: number, d: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: d })
  const km = meters / 1000
  if (km < 1e6) return `${tr(km, 1)} km`
  if (meters < 0.5 * AU) return `${tr(km / 1e6, 2)} milyon km`
  return `${tr(meters / AU, 1)} AB`
}

/** ışıkyılı: 7.240 · 27.000 · 54,8 milyon · 2,44 milyar */
export function fmtDistanceLy(ly: number): string {
  const tr = (x: number, d: number) => x.toLocaleString('tr-TR', { maximumFractionDigits: d })
  if (ly >= 1e9) return `${tr(ly / 1e9, 2)} milyar ıy`
  if (ly >= 1e6) return `${tr(ly / 1e6, 1)} milyon ıy`
  return `${tr(ly, 0)} ıy`
}

function makePreset(opts: {
  id: string
  name: string
  tag: string
  spinLabel: string
  massSolar: number
  spin: number
  engine: KerrEngine
  visual: HoleVisual
  desc: string
  about: string
  distanceLy: number
  diskLabel: string
  jetLabel: string
  refs: string
}): BlackHolePreset {
  const rgMeters = RG_SUN * opts.massSolar
  const rPlusMeters = opts.engine.rp * rgMeters
  // gelgit eşiği ölçeklemesi: T ∝ M/r³ sabit tutulursa b ∝ M^(1/3).
  // Süper kütlelide sonuç ≪ 1 çıkar: kopma yarıçapı ufkun içindedir (gerçek).
  const breakFactor = (REF_RS_M * Math.cbrt(opts.massSolar / REF_MASS_SOLAR)) / rPlusMeters
  // ince disk iç kenarı ISCO'da biter — spin farkının en dürüst görsel izi
  const diskIn = opts.engine.isco
  // ışıma verimi η = 1 − E_ISCO (Novikov–Thorne): iç disk parlaklığını sürer
  const iscoM = kerrIscoM(opts.spin)
  const efficiency = 1 - kerrCircularM(opts.spin, iscoM * (1 + 1e-9)).E
  const massLabel = fmtMass(opts.massSolar)
  return {
    id: opts.id,
    name: opts.name,
    label: `${opts.name} · ${massLabel}`,
    tag: opts.tag,
    spinLabel: opts.spinLabel,
    massLabel,
    massSolar: opts.massSolar,
    spin: opts.spin,
    engine: opts.engine,
    rPlusMeters,
    timeUnitMs: (rPlusMeters / C) * 1000,
    profile: { ...horizonScales(opts.engine.rp), breakFactor, diskIn, diskOut: 13.5 },
    visual: opts.visual,
    desc: opts.desc,
    about: opts.about,
    distanceLy: opts.distanceLy,
    diskLabel: opts.diskLabel,
    jetLabel: opts.jetLabel,
    refs: opts.refs,
    efficiency,
  }
}

/* ------------------------------------------------------------------ *
 * 1 — M87*: ilk fotoğrafı çekilen kara delik (EHT 2019)
 * ------------------------------------------------------------------ */
function buildM87(): BlackHolePreset {
  const a = 0.9
  return makePreset({
    id: 'm87',
    name: 'M87*',
    tag: 'İlk fotoğrafı çekilen',
    spinLabel: '≈0,9 (model)',
    massSolar: 6.5e9,
    spin: a,
    engine: new KerrEngine(a),
    visual: {
      // düşük yığılma oranlı, ışıma yapamayan kalın akış (RIAF): şişkin halka
      diskThick: 1.8,
      diskGlow: 0.8,
      diskVar: [0.06, wrapRate(0.03)],
      diskPatch: [0.12, wrapRate(0.03)],
      // dev eliptik galaksinin sarımsı yıldız ışığı + sıcak gaz hâlesi
      nebColor: [0.02, 0.015, 0.009],
      nebPar: [1.5, 1.35],
      jetA: [1.1, 0.99, 0.4, 0.032],
      jetB: [1.7, 42, 0, 0],
      jetC: [0, 0.42, wrapRate(0.14), 1.6],
      jetColor: [0.62, 0.78, 1.18],
    },
    desc: 'M87* — 2019’da fotoğraflanan ilk kara delik: M = 6,5 milyar M☉ (EHT 2019). Sakin, simetrik halka; asıl gösterisi ışık hızına yakın jet.',
    about:
      'Başak takımyıldızındaki dev eliptik galaksi M87’nin merkezinde oturur ve 2019’da Event Horizon Telescope’un dünya çapında birleştirdiği radyo teleskoplarıyla fotoğraflanan ilk kara delik oldu. Güneş’in 6,5 milyar katı kütlesiyle burada kurulabilecek en büyük canavar; ufku Neptün’ün yörüngesinden geniştir. Yığılma oranı kütlesine göre çok düşük olduğundan gaz ince bir disk yerine şişkin, ışıyamayan bir akış (RIAF) halinde döner — ekrandaki kalın, pamuksu ve şaşırtıcı biçimde sakin halka bundandır. Buna karşılık kutuplarından binlerce ışıkyılı uzanan plazma jeti neredeyse ışık hızındadır: hüzmeleme yüzünden gözlemciye yaklaşan kol parlar, uzaklaşan kol neredeyse söner. Sahnede bunu doğrudan görebilirsiniz: kamerayı jet eksenine doğru çevirdiğinizde iki kolun parlaklığı ayrışır, tam yandan bakıldığında ikisi de eşit görünür.',
    distanceLy: 5.48e7,
    diskLabel: 'kalın RIAF halkası · sakin, simetrik',
    jetLabel: 'β > 0,99 · ~5.000 ıy (tek taraflı görünür)',
    refs: 'M = (6,5 ± 0,7)×10⁹ M☉ (EHT Collab. 2019, ApJL 875 L6) · a* ≈ 0,9 (Tamburini+ 2020, model) · d = 16,8 Mpc',
  })
}

/* ------------------------------------------------------------------ *
 * 2 — Sagittarius A*: Samanyolu'nun merkezi
 * ------------------------------------------------------------------ */
function buildSgrA(): BlackHolePreset {
  const a = 0.9
  return makePreset({
    id: 'sgra',
    name: 'Sagittarius A*',
    tag: 'Bizim galaksimizin merkezi',
    spinLabel: '≈0,9 (model)',
    massSolar: 4.297e6,
    spin: a,
    engine: new KerrEngine(a),
    visual: {
      diskThick: 2.0,
      diskGlow: 0.72,
      // gaz dakikalar mertebesinde dolanır: parlaklık gözle görülür biçimde titrer
      diskVar: [0.55, wrapRate(0.85)],
      // EHT görüntüsündeki düzensiz parlak lekeler: dönen sıcak noktalar
      diskPatch: [0.85, wrapRate(0.3)],
      // galaktik merkez: kızıla çalan yoğun toz + çok kalabalık yıldız alanı
      nebColor: [0.022, 0.011, 0.007],
      nebPar: [1.7, 2.1],
      ...NO_JET,
    },
    desc: 'Sgr A* — Samanyolu’nun merkezi: M = 4,3 milyon M☉ (GRAVITY 2022). Gaz dakikalar içinde dolanır: disk düzensiz ve titrek.',
    about:
      'Yay takımyıldızı yönünde, 27 bin ışıkyılı ötede duruyor: bizim galaksimizin merkezi. Varlığı, çevresinde on yıllar boyunca izlenen S2 gibi yıldızların yörüngelerinden anlaşıldı — bu iş 2020 Nobel Fizik Ödülü’nü getirdi. EHT’nin ikinci görüntüsü 2022’de yayımlandı. M87*’den bin kat küçük ama bin kat daha yakın olduğu için gökyüzünde neredeyse aynı büyüklükte görünür. Kritik fark ölçekte değil, zamandadır: bu kadar küçük bir delikte gaz ufkun çevresini dakikalar içinde dolanır, yani görüntü çekim sürerken değişir. Bu yüzden EHT karesi M87*’ninki gibi durgun bir halka değil, kayıp giden parlak lekelerden ibarettir — ekrandaki diskin sürekli titremesi ve asimetrik lekelenmesi bu gerçek değişkenliği taşır. Gözlenmiş bir jeti yoktur: şu an aç bir kara deliktir.',
    distanceLy: 26996,
    diskLabel: 'düzensiz lekeler · dakikalar içinde değişir',
    jetLabel: 'gözlenmiş jet yok (sakin/aç evre)',
    refs: 'M = (4,297 ± 0,013)×10⁶ M☉ · d = 8,277 kpc (GRAVITY Collab. 2022, A&A 657 L12) · a* ≈ 0,9 (Daly+ 2024, model)',
  })
}

/* ------------------------------------------------------------------ *
 * 3 — SS 433: Manatee bulutsusunun burgu jetli mikrokuasarı
 * ------------------------------------------------------------------ */
function buildSS433(): BlackHolePreset {
  // spin ölçülmedi; motor bir değer istiyor — künyede açıkça belirtiliyor
  const a = 0.2
  return makePreset({
    id: 'ss433',
    name: 'SS 433',
    tag: 'Burgu (precessing) jet',
    spinLabel: 'ölçülmedi (0,2 alındı)',
    massSolar: 4.3,
    spin: a,
    engine: new KerrEngine(a),
    visual: {
      // Eddington sınırının kat kat üstünde besleniyor: disk şişer, rüzgâr üfler
      diskThick: 2.2,
      diskGlow: 1.2,
      diskVar: [0.28, wrapRate(0.3)],
      diskPatch: [0.4, wrapRate(0.45)],
      // W50 "Manatee" bulutsusu: jetlerin şişirdiği yeşilimsi-mavi kabuk
      nebColor: [0.01, 0.019, 0.017],
      nebPar: [1.9, 1.25],
      jetA: [0.95, 0.2647, 0.26, 0.02],
      // precession: gerçek koni yarı açısı 19,85° (tan = 0,361);
      // periyot 162,4 gün → sahnede 40 s'ye sıkıştırıldı
      jetB: [1.4, 34, 0.361, wrapRate(1 / 40) * 2 * Math.PI],
      // sarmal adım: balistik madde yükseldikçe faz geride kalır ⇒ burgu
      jetC: [0.42, 1.1, wrapRate(0.1), 1.4],
      // optikte Hα/Hβ çizgileriyle parlar: kızıl-turuncu
      jetColor: [1.0, 0.55, 0.32],
    },
    desc: 'SS 433 — jetleri 162 günde bir tur atan mikrokuasar: β = 0,26, koni açısı 19,85°. Gökyüzünde düz çizgi değil, burgu çizer.',
    about:
      'Kuğu’nun güneyinde, W50 — halk arasında “Manatee” — bulutsusunun tam ortasında oturan çok tuhaf bir çift sistem. 1970’lerin sonunda tayfında bir aynı anda hem maviye hem kırmızıya kaymış çizgiler bulunduğunda kimse ne olduğunu çözemedi; sonunda anlaşıldı ki iki karşıt jet ışığın dörtte biri hızla fışkırıyor ve jetlerin ekseni 162,4 günde bir tam tur atıyor. Yani jetler tepeye çarpan bir su fıskiyesi gibi tepiniyor: uzayda düz bir çizgi değil, sarmal bir burgu çiziyorlar — ekranda gördüğünüz kıvrım budur, açı (19,85°) ve hız (0,26 c) ölçülmüş değerlerdir, yalnız periyot izlenebilsin diye 40 saniyeye sıkıştırılmıştır. Disk Eddington sınırının kat kat üstünde beslendiği için şişkin ve rüzgârlıdır, X-ışınlarında kavurucu parlaklıktadır. Kütlesi küçüktür ve dönüş hızı hâlâ ölçülememiştir.',
    distanceLy: 17900,
    diskLabel: 'süper-Eddington · şişkin ve rüzgârlı',
    jetLabel: 'β = 0,26 · 162,4 günde bir tur · koni 19,85°',
    refs: 'M = 4,3 ± 0,8 M☉ (Hillwig & Gies 2008) · jet β = 0,2647, P = 162,4 gün (Margon 1984) · d = 5,5 kpc (Blundell & Bowler 2004) · spin ölçülmedi',
  })
}

/* ------------------------------------------------------------------ *
 * 4 — GRS 1915+105: bilinen en değişken disk, süperluminal jet
 * ------------------------------------------------------------------ */
function buildGRS1915(): BlackHolePreset {
  const a = 0.98
  return makePreset({
    id: 'grs1915',
    name: 'GRS 1915+105',
    tag: 'En değişken disk',
    spinLabel: '> 0,98',
    massSolar: 12.4,
    spin: a,
    engine: new KerrEngine(a),
    visual: {
      diskThick: 1.15,
      diskGlow: 1.35,
      // limit-cycle: madde birikir, disk ani boşalır — saniyeler-dakikalar
      diskVar: [0.85, wrapRate(0.42)],
      diskPatch: [0.22, wrapRate(0.3)],
      // galaktik düzlemde, kalın toz perdesinin ardında: kızıla batmış alan
      nebColor: [0.014, 0.0075, 0.005],
      nebPar: [1.2, 1.55],
      jetA: [0.8, 0.92, 0.22, 0.022],
      jetB: [1.5, 30, 0.02, wrapRate(1 / 150) * 2 * Math.PI],
      jetC: [0.0, 0.9, wrapRate(0.26), 1.1],
      jetColor: [0.88, 0.86, 1.08],
    },
    desc: 'GRS 1915+105 — diski saniyeler içinde parlayıp sönen kararsız dev: M = 12,4 M☉, a* > 0,98. Süperluminal jetler fırlatır.',
    about:
      'Kartal takımyıldızı yönünde, galaktik düzlemin toz perdesi ardında saklı. 1992’de bir X-ışını parlamasıyla bulundu ve iki yıl sonra gökbilim tarihine geçti: fırlattığı plazma bulutları gökyüzünde ışıktan hızlı ilerliyor göründü. Bu bir yanılsamadır — madde bize doğru ışık hızının %90’ından fazlasıyla geldiği için ışık zamanı sıkıştırır — ama gerçek hızın ne kadar uçlarda olduğunu gösterir. Asıl ünü diskinden gelir: bilinen en kararsız yığılma diskidir, saniyeler ile dakikalar arasında parlaklığını kat kat değiştirir. Sebebi bir limit-cycle döngüsüdür: iç diskte madde birikir, ışıma basıncı bir eşiği aşar ve iç bölge ani biçimde deliğe boşalır, sonra yeniden dolar. Ekranda diskin ritmik olarak şişip sönmesi bu döngüdür. Neredeyse azami hızla döndüğü için ISCO ufka yapışır, iç disk çok sıcaktır.',
    distanceLy: 28000,
    diskLabel: 'limit-cycle · saniyelerde parlayıp söner',
    jetLabel: 'β ≈ 0,9 · “süperluminal” görünür (1,25 c)',
    refs: 'M = 12,4 M☉, d = 8,6 kpc (Reid+ 2014, ApJ 796 2) · a* > 0,98 (McClintock+ 2006) · jet (Mirabel & Rodríguez 1994, Nature 371 46)',
  })
}

/* ------------------------------------------------------------------ *
 * 5 — 3C 273: ilk keşfedilen kuasar
 * ------------------------------------------------------------------ */
function build3C273(): BlackHolePreset {
  const a = 0.9
  return makePreset({
    id: '3c273',
    name: '3C 273',
    tag: 'İlk keşfedilen kuasar',
    spinLabel: '≈0,9 (model)',
    massSolar: 2.6e8,
    spin: a,
    engine: new KerrEngine(a),
    visual: {
      // Eddington'a yakın besleniyor: klasik ince, kavurucu parlak disk
      diskThick: 0.85,
      diskGlow: 1.55,
      diskVar: [0.05, wrapRate(0.05)],
      diskPatch: [0.08, wrapRate(0.04)],
      // kuasar hâlesi: geniş çizgi bölgesinin mavi-mor parıltısı, önalanda az yıldız
      nebColor: [0.011, 0.013, 0.023],
      nebPar: [1.3, 0.4],
      jetA: [1.3, 0.995, 0.3, 0.026],
      jetB: [2.0, 45, 0, 0],
      jetC: [0, 0.5, wrapRate(0.11), 1.8],
      jetColor: [0.85, 0.9, 1.28],
    },
    desc: '3C 273 — ilk keşfedilen kuasar: M = 2,6×10⁸ M☉ (GRAVITY 2018). Diski o kadar parlak ki 2,4 milyar ışıkyılından amatör teleskopla görülür.',
    about:
      'Başak takımyıldızında sıradan bir yıldız sanılıyordu; 1963’te tayfındaki çizgilerin akıl almaz ölçüde kırmızıya kaydığı fark edilince gökbilim değişti. Cisim yıldız değil, milyarlarca ışıkyılı ötede bir galaksinin çekirdeğiydi ve tüm galaksisinden yüzlerce kat parlaktı: ilk kuasar. Kaynağı, deliği Eddington sınırına yakın besleyen ince ve kavurucu bir yığılma diskidir — 2,4 milyar ışıkyılı uzaklıktan amatör bir teleskopla bile görülebilir. Optik dalga boyunda net fotoğraflanan ilk jet de buradan çıkar; neredeyse ışık hızıyla ilerlediğinden yalnız bize dönük kolu görünür. Sahnedeki göz kamaştırıcı beyaz-mavi disk ile keskin jet, “sessiz” bir kara delikle (Sgr A*) aktif bir çekirdeğin arasındaki farkın ta kendisidir.',
    distanceLy: 2.44e9,
    diskLabel: 'ince disk · Eddington’a yakın, göz kamaştırıcı',
    jetLabel: 'β > 0,99 · optikte fotoğraflanan ilk jet',
    refs: 'M = (2,6 ± 1,1)×10⁸ M☉ (GRAVITY Collab. 2018, Nature 563 657) · z = 0,158 → d ≈ 2,44 milyar ıy · a* ≈ 0,9 (model)',
  })
}

/* ------------------------------------------------------------------ *
 * 6 — Cygnus X-1: ilk doğrulanan kara delik (referans nokta)
 * ------------------------------------------------------------------ */
function buildCygX1(): BlackHolePreset {
  const a = 0.9985
  return makePreset({
    id: 'cygx1',
    name: 'Cygnus X-1',
    tag: 'İlk doğrulanan kara delik',
    spinLabel: '> 0,9985',
    massSolar: 21.2,
    spin: a,
    engine: new KerrEngine(a),
    visual: {
      // ders kitabı ince disk: ötekileri kıyaslamak için "normal" referans
      diskThick: 1.0,
      diskGlow: 1.0,
      diskVar: [0.1, wrapRate(0.22)],
      diskPatch: [0.12, wrapRate(0.18)],
      // mavi süperdev yoldaşın rüzgârı + Kuğu bölgesinin yıldız bolluğu
      nebColor: [0.009, 0.012, 0.02],
      nebPar: [1.3, 1.35],
      jetA: [0.3, 0.6, 0.2, 0.02],
      jetB: [1.5, 20, 0, 0],
      jetC: [0, 0.8, wrapRate(0.2), 1.0],
      jetColor: [0.8, 0.88, 1.1],
    },
    desc: 'Cygnus X-1 — doğrulanan ilk kara delik: M = 21,2 M☉, a* > 0,9985. Ders kitabı ince diski, ötekiler için referans noktası.',
    about:
      '1964’te bir roket uçuşunda bulundu ve kara delik olduğuna ikna olunan ilk gök cismi oldu; Kuğu takımyıldızında mavi bir dev yıldızın rüzgârını yutuyor. Hawking’in Thorne’a karşı girip 1990’da kaybettiği ünlü bahsin konusudur. Bu listede “normal”i temsil eder: diski ne M87*’ninki gibi şişkin ve aç, ne Sgr A*’ınki gibi titrek, ne GRS 1915’inki gibi kararsız, ne de 3C 273’ünki gibi kavurucudur — istikrarlı beslenen, ince, ders kitabı gibi bir Shakura–Sunyaev diskidir. Ötekilerin ne kadar uç örnek olduğunu ancak buraya dönüp bakınca anlarsınız. İzin verilenin ucundaki bir hızla döner: dönme uzayı da beraberinde sürüklediğinden disk ufka kadar sokulur, iç bölge çok daha sıcak ve parlaktır.',
    distanceLy: 7240,
    diskLabel: 'standart ince disk (Shakura–Sunyaev) · referans',
    jetLabel: 'zayıf, dar radyo jeti',
    refs: 'M = 21,2 ± 2,2 M☉, d = 2,22 kpc (Miller-Jones+ 2021, Science 371 1046) · a* > 0,9985 (Zhao+ 2021)',
  })
}

export const PRESETS: Readonly<Record<string, BlackHolePreset>> = {
  m87: buildM87(),
  sgra: buildSgrA(),
  ss433: buildSS433(),
  grs1915: buildGRS1915(),
  '3c273': build3C273(),
  cygx1: buildCygX1(),
}

// Sgr A*: varsayılan mod SANATSAL (jetsiz) olduğundan jet vaat eden bir kartla
// açılmamak için jeti zaten gözlenmemiş olan kendi galaksimizin merkezi seçildi
export const DEFAULT_PRESET_ID = 'sgra'

/** Saf Schwarzschild referans motoru testler ve çapraz doğrulama için kalır. */
export const SCHWARZSCHILD_REFERENCE = Schwarzschild
