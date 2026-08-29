import * as THREE from 'three'
import type { GeodesicEngine, OrbitalState } from './geodesics'

/**
 * TAM Kerr ekvatoral zamansal jeodezik motoru (Boyer–Lindquist, G=c=M=1).
 * Dairesel yörünge büyüklükleri Bardeen–Press–Teukolsky (1972) formülleri;
 * genel hareket, korunan E ve L ile ekvatoral jeodezik denklemleri:
 *
 *   (dr/dτ)² = E² − 1 + 2/r − (L² − a²(E²−1))/r² + 2(L − aE)²/r³
 *   u^t = [(r² + a² + 2a²/r)E − (2a/r)L]/Δ ,  Δ = r² − 2r + a²
 *   u^φ = [(1 − 2/r)L + (2a/r)E]/Δ
 *
 * Sahne birimi = olay ufku yarıçapı r₊ = 1 + √(1−a²): arayüzdeki tüm r ve
 * zamanlar r₊ ile ölçeklenir; hızlar (c cinsinden) ölçekten bağımsızdır.
 * Hareket kesinlikle ekvatoral düzlemdedir (Kerr küresel simetrik değildir).
 */

/** BPT ISCO yarıçapı, M biriminde (prograd). */
export function kerrIscoM(a: number): number {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a))
  const z2 = Math.sqrt(3 * a * a + z1 * z1)
  return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2))
}

/** BPT prograd dairesel yörünge büyüklükleri, M biriminde. */
export function kerrCircularM(a: number, rM: number): { E: number; L: number; dil: number } {
  const sr = Math.sqrt(rM)
  const r32 = rM * sr
  const r34 = Math.pow(rM, 0.75)
  const den = r32 - 3 * sr + 2 * a
  if (den <= 0) return { E: NaN, L: NaN, dil: NaN }
  const sd = Math.sqrt(den)
  return {
    E: (r32 - 2 * sr + a) / (r34 * sd),
    L: (rM * rM - 2 * a * sr + a * a) / (r34 * sd),
    dil: (r32 + a) / (r34 * sd),
  }
}

export class KerrEngine implements GeodesicEngine {
  readonly a: number
  /** ufuk yarıçapı, M biriminde — sahne birimi budur */
  readonly rp: number
  readonly isco: number
  private readonly rhat = new THREE.Vector3()
  private readonly tangent = new THREE.Vector3()

  constructor(a: number) {
    this.a = a
    this.rp = 1 + Math.sqrt(Math.max(1 - a * a, 0))
    this.isco = kerrIscoM(a) / this.rp
  }

  private delta(rM: number): number {
    return rM * rM - 2 * rM + this.a * this.a
  }

  /** g_φφ (ekvatoral): r² + a² + 2a²/r */
  private gphph(rM: number): number {
    return rM * rM + this.a * this.a + (2 * this.a * this.a) / rM
  }

  /** ZAMO lapse²: Δ / (r² + a² + 2a²/r) */
  f(r: number): number {
    const rM = r * this.rp
    return Math.max(this.delta(rM) / this.gphph(rM), 0)
  }

  circularL(r: number): number {
    return this.circularState(r).L
  }

  circularState(r: number): { E: number; L: number } {
    const rM = Math.max(r * this.rp, kerrIscoM(this.a) * 0.9999)
    const c = kerrCircularM(this.a, rM)
    if (!Number.isFinite(c.E)) {
      const cIsco = kerrCircularM(this.a, kerrIscoM(this.a) * 1.0001)
      return { E: cIsco.E, L: cIsco.L }
    }
    return { E: c.E, L: c.L }
  }

  localCircularSpeed(r: number): number {
    const rM = r * this.rp
    const c = kerrCircularM(this.a, rM)
    if (!Number.isFinite(c.dil)) return 1
    const gamma = Math.sqrt(this.f(r)) * c.dil
    return Math.sqrt(Math.max(1 - 1 / (gamma * gamma), 0))
  }

  /** normalizasyondan E: u_r² = A·E² + B·E + C formunun pozitif kökü */
  private solveE(rM: number, uR: number, L: number): number {
    const a = this.a
    const r2 = rM * rM
    const r3 = r2 * rM
    const A = 1 + (a * a) / r2 + (2 * a * a) / r3
    const B = (-4 * a * L) / r3
    const C = -1 + 2 / rM - (L * L) / r2 + (2 * L * L) / r3 - uR * uR
    const disc = Math.max(B * B - 4 * A * C, 0)
    return (-B + Math.sqrt(disc)) / (2 * A)
  }

  recomputeE(st: OrbitalState): void {
    st.E = this.solveE(st.r * this.rp, st.uR, st.L)
  }

  private ut(rM: number, E: number, L: number): number {
    return (this.gphph(rM) * E - ((2 * this.a) / rM) * L) / this.delta(rM)
  }

  private uphi(rM: number, E: number, L: number): number {
    return ((1 - 2 / rM) * L + ((2 * this.a) / rM) * E) / this.delta(rM)
  }

  /** d²r/dτ² = −1/r² + (L² − a²(E²−1))/r³ − 3(L − aE)²/r⁴ */
  private radialAccel(rM: number, E: number, L: number): number {
    const a = this.a
    const r2 = rM * rM
    const k = L - a * E
    return -1 / r2 + (L * L - a * a * (E * E - 1)) / (r2 * rM) - (3 * k * k) / (r2 * r2)
  }

  advance(st: OrbitalState, dtCoord: number): number {
    const { rp } = this
    let rM = st.r * rp
    let uR = st.uR
    let phi = st.phi
    const { E, L } = st
    let remainingM = dtCoord * rp
    let guard = 0
    let dtauM = 0
    while (remainingM > 1e-9 && guard++ < 200) {
      if (rM <= rp * (1 + 1e-8) || this.delta(rM) / this.gphph(rM) < 1e-12) break // ufukta donmuş
      const rate = this.ut(rM, E, L) // dt/dτ
      if (!(rate > 0)) break
      const up = this.uphi(rM, E, L)
      // adım tavanı: dφ ve dr çözünürlüğüne göre (uç Kerr'de dτ çok küçülür)
      let cap = 0.02
      cap = Math.min(cap, 0.06 / (Math.abs(up) + 1e-9))
      cap = Math.min(cap, (0.05 * Math.max(rM - rp, 1e-7)) / (Math.abs(uR) + 1e-9))
      const dtau = Math.min(cap, remainingM / rate)
      // RK4: (r, u_r, φ); E ve L jeodezik boyunca sabittir
      const k1r = uR
      const k1u = this.radialAccel(rM, E, L)
      const k1p = this.uphi(rM, E, L)
      const r1 = rM + 0.5 * dtau * k1r
      const k2r = uR + 0.5 * dtau * k1u
      const k2u = this.radialAccel(r1, E, L)
      const k2p = this.uphi(r1, E, L)
      const r2 = rM + 0.5 * dtau * k2r
      const k3r = uR + 0.5 * dtau * k2u
      const k3u = this.radialAccel(r2, E, L)
      const k3p = this.uphi(r2, E, L)
      const r3 = rM + dtau * k3r
      const k4r = uR + dtau * k3u
      const k4u = this.radialAccel(r3, E, L)
      const k4p = this.uphi(r3, E, L)
      rM += (dtau / 6) * (k1r + 2 * k2r + 2 * k3r + k4r)
      uR += (dtau / 6) * (k1u + 2 * k2u + 2 * k3u + k4u)
      phi += (dtau / 6) * (k1p + 2 * k2p + 2 * k3p + k4p)
      dtauM += dtau
      remainingM -= dtau * rate
    }
    if (phi > Math.PI * 2) phi -= Math.PI * 2 * Math.floor(phi / (Math.PI * 2))
    if (phi < 0) phi += Math.PI * 2 * Math.ceil(-phi / (Math.PI * 2))
    st.r = rM / rp
    st.uR = uR
    st.phi = phi
    return dtauM / rp
  }

  localSpeed(st: OrbitalState): number {
    const gamma = Math.sqrt(this.f(st.r)) * this.totalDilation(st)
    if (!Number.isFinite(gamma) || gamma < 1) return 0
    return Math.sqrt(Math.min(Math.max(1 - 1 / (gamma * gamma), 0), 0.999999))
  }

  totalDilation(st: OrbitalState): number {
    const rM = st.r * this.rp
    if (this.delta(rM) <= 0) return Infinity
    return this.ut(rM, st.E, st.L)
  }

  positionOf(st: OrbitalState, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(st.phi)
    const s = Math.sin(st.phi)
    return out
      .copy(st.e1)
      .multiplyScalar(st.r * c)
      .addScaledVector(st.e2, st.r * s)
  }

  coordVelocityOf(st: OrbitalState, out: THREE.Vector3): THREE.Vector3 {
    const rM = st.r * this.rp
    const rate = this.ut(rM, st.E, st.L)
    if (!(rate > 0)) return out.set(0, 0, 0)
    const drdt = st.uR / rate // ölçekten bağımsız (c cinsinden)
    const vt = (rM * this.uphi(rM, st.E, st.L)) / rate // teğetsel hız, c cinsinden
    const c = Math.cos(st.phi)
    const s = Math.sin(st.phi)
    out
      .copy(st.e1)
      .multiplyScalar(drdt * c - vt * s)
      .addScaledVector(st.e2, drdt * s + vt * c)
    return out
  }

  stateFromPosVel(pos: THREE.Vector3, vel: THREE.Vector3): OrbitalState {
    // Kerr küresel simetrik değil: hareket ekvatoral düzleme izdüşürülür
    const px = pos.x
    const pz = pos.z
    const rM = Math.max(Math.hypot(px, pz) * this.rp, this.rp * (1 + 1e-7))
    this.rhat.set(px, 0, pz).normalize()
    this.tangent.set(-pz, 0, px).normalize() // global CCW = prograd yön
    let vr = vel.x * this.rhat.x + vel.z * this.rhat.z
    let vt = vel.x * this.tangent.x + vel.z * this.tangent.z // işaretli (prograd +)
    const a = this.a
    const grr = (rM * rM) / Math.max(this.delta(rM), 1e-14)
    const gpp = this.gphph(rM)
    const phiDot = () => vt / rM
    // (dτ/dt)² = (1−2/r) + (4a/r)φ̇ − g_rr ṙ² − g_φφ φ̇²
    let bracket = 1 - 2 / rM + ((4 * a) / rM) * phiDot() - grr * vr * vr - gpp * phiDot() * phiDot()
    const minBracket = 1e-6
    if (bracket < minBracket) {
      // ışıkaltına kıskaçla: hız bileşenlerini eşit oranda küçült
      for (let i = 0; i < 40 && bracket < minBracket; i++) {
        vr *= 0.85
        vt *= 0.85
        bracket = 1 - 2 / rM + ((4 * a) / rM) * (vt / rM) - grr * vr * vr - gpp * (vt / rM) * (vt / rM)
      }
      if (bracket < minBracket) {
        vr = 0
        vt = 0
        bracket = Math.max(1 - 2 / rM, minBracket)
      }
    }
    const utv = 1 / Math.sqrt(bracket)
    const uphiV = (vt / rM) * utv
    const E = (1 - 2 / rM) * utv + ((2 * a) / rM) * uphiV
    const L = (-(2 * a) / rM) * utv + gpp * uphiV
    return {
      e1: this.rhat.clone(),
      e2: this.tangent.clone(),
      r: rM / this.rp,
      phi: 0,
      uR: vr * utv,
      L,
      E,
    }
  }

  scaleVelocity(st: OrbitalState, k: number): void {
    const uR0 = st.uR
    const L0 = st.L
    const E0 = st.E
    st.uR *= k
    st.L *= k
    this.recomputeE(st)
    // ergosfer içinde statik-benzeri durum fiziksel olarak imkânsızdır
    // (çerçeve sürüklenmesi): E çözümü geçersizse değişiklik uygulanmaz
    if (!(st.E > 0) || !Number.isFinite(st.E)) {
      st.uR = uR0
      st.L = L0
      st.E = E0
    }
  }
}
