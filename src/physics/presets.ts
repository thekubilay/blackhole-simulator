import type { GeodesicEngine } from './geodesics'
import { Schwarzschild } from './schwarzschild'
import { KerrEngine, kerrCircularM, kerrIscoM } from './kerr'

/**
 * Gerçek kara delik kartları. Kütle ve spin değerleri yayımlanmış ölçümlerden
 * alınır — uydurma parametre yoktur:
 *  - A0620-00 (V616 Mon): M = 6.6 M☉ (Cantrell ve ark. 2010),
 *    a* ≈ 0.12 (Gou ve ark. 2010) — bilinen en yakın kara deliklerden;
 *    ölçülmüş en düşük spinlilerden.
 *  - Cygnus X-1: M = 21.2 M☉ (Miller-Jones ve ark. 2021, Science),
 *    a* > 0.9985 (Zhao ve ark. 2021) — keşfedilen ilk kara delik; ölçülmüş
 *    en uç spinlerden.
 * Görsel farklar da gerçek fizikten türetilir: disk iç kenarı = ISCO
 * (ince disk), iç disk parlaklık/beyazlığı = ışıma verimi η = 1 − E_ISCO
 * (Novikov–Thorne).
 */

const G = 6.674e-11
const C = 2.998e8
const MSUN = 1.989e30
/** r_g = GM/c² for 1 M☉ (m) */
const RG_SUN = (G * MSUN) / (C * C)
/** gelgit kopma kalibrasyonu: referans 10 M☉ deliğinde rs biriminde */
const REF_MASS_SOLAR = 10
const REF_RS_M = 2 * RG_SUN * REF_MASS_SOLAR

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

export interface BlackHolePreset {
  id: string
  name: string
  /** buton etiketi */
  label: string
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
  desc: string
  /** ışıma verimi η = 1 − E_ISCO — iç disk parlaklığını sürer (Novikov–Thorne) */
  efficiency: number
}

function makePreset(opts: {
  id: string
  name: string
  spinLabel: string
  massSolar: number
  spin: number
  engine: KerrEngine
  profile: Omit<HoleProfile, 'breakFactor' | 'diskIn' | 'diskOut'>
  desc: string
}): BlackHolePreset {
  const rgMeters = RG_SUN * opts.massSolar
  const rPlusMeters = opts.engine.rp * rgMeters
  // gelgit eşiği ölçeklemesi: T ∝ M/r³ sabit tutulursa b ∝ M^(1/3)
  const breakFactor = (REF_RS_M * Math.cbrt(opts.massSolar / REF_MASS_SOLAR)) / rPlusMeters
  // ince disk iç kenarı ISCO'da biter — spin farkının en dürüst görsel izi
  const diskIn = opts.engine.isco
  // ışıma verimi η = 1 − E_ISCO (Novikov–Thorne): iç disk parlaklığını sürer
  const iscoM = kerrIscoM(opts.spin)
  const efficiency = 1 - kerrCircularM(opts.spin, iscoM * (1 + 1e-9)).E
  return {
    id: opts.id,
    name: opts.name,
    label: `${opts.name} · ${opts.massSolar} M☉ · a*${opts.spinLabel}`,
    spinLabel: opts.spinLabel,
    massLabel: `${opts.massSolar} M☉`,
    massSolar: opts.massSolar,
    spin: opts.spin,
    engine: opts.engine,
    rPlusMeters,
    timeUnitMs: (rPlusMeters / C) * 1000,
    profile: { ...opts.profile, breakFactor, diskIn, diskOut: 13.5 },
    desc: opts.desc,
    efficiency,
  }
}

function buildA0620(): BlackHolePreset {
  const a = 0.12
  return makePreset({
    id: 'a0620',
    name: 'A0620-00',
    spinLabel: '≈0.12',
    massSolar: 6.6,
    spin: a,
    engine: new KerrEngine(a),
    profile: { minSpawnR: 1.3, fadeStart: 0.111, freezeFade: 0.047, killDist: 0.02 },
    desc: 'V616 Mon — bilinen en yakın kara deliklerden: M = 6.6 M☉ (Cantrell+ 2010), a* ≈ 0.12 (Gou+ 2010). Düşük spin: disk ufuktan uzakta (ISCO ≈ 2.8 r₊) biter.',
  })
}

function buildCygX1(): BlackHolePreset {
  const a = 0.9985
  return makePreset({
    id: 'cygx1',
    name: 'Cygnus X-1',
    spinLabel: '>0.9985',
    massSolar: 21.2,
    spin: a,
    engine: new KerrEngine(a),
    profile: { minSpawnR: 1.05, fadeStart: 0.02, freezeFade: 0.008, killDist: 0.002 },
    desc: 'Keşfedilen ilk kara delik: M = 21.2 M☉ (Miller-Jones+ 2021), a* > 0.9985 (Zhao+ 2021). Uç spin: disk ufka yapışır (ISCO ≈ 1.15 r₊), iç disk daha parlak (η ≈ %30).',
  })
}

export const PRESETS: Readonly<Record<string, BlackHolePreset>> = {
  a0620: buildA0620(),
  cygx1: buildCygX1(),
}

export const DEFAULT_PRESET_ID = 'a0620'

/** Saf Schwarzschild referans motoru testler ve çapraz doğrulama için kalır. */
export const SCHWARZSCHILD_REFERENCE = Schwarzschild
