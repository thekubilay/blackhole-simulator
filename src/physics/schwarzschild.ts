import * as THREE from 'three'
import { GM, ISCO, RS } from './constants'
import type { GeodesicEngine, OrbitalState } from './geodesics'

export type { GeodesicEngine, OrbitalState } from './geodesics'

/**
 * TAM Schwarzschild zamansal jeodezik motoru (geometrik birimler: rs=1, c=1,
 * GM=1/2). Küresel simetri sayesinde her cismin yörüngesi orijinden geçen
 * kendi düzleminde yaşar: durum, düzlem tabanı (e1,e2) + (r, φ, u_r) ile
 * korunan L (özgül açısal momentum) ve E (özgül enerji) olarak tutulur.
 *
 * Denklemler (ders kitabı formu — Hartle/MTW):
 *   (dr/dτ)² = E² − (1−rs/r)(1 + L²/r²)
 *   d²r/dτ²  = −GM/r² + L²/r³ − 3GM·L²/r⁴
 *   dφ/dτ    = L/r²,   dt/dτ = E/(1−rs/r)
 *
 * Sahne uzak gözlemcinin koordinat zamanında akar: adım dτ = dt·f/E ile
 * daralır, ufka yaklaşan cisim kendiliğinden donar — yapay ölçekleme yok.
 * Kerr motorunun a=0 özel hâline birebir eşdeğerdir (testlerle doğrulanır).
 */

function f(r: number): number {
  return Math.max(0, 1 - RS / r)
}

function circularL(r: number): number {
  const rc = Math.max(r, 1.52)
  return Math.sqrt((GM * rc * rc) / (rc - 3 * GM))
}

// E_dairesel = (1−rs/r)/√(1−1.5rs/r) — analitik, iptalsiz
function circularState(r: number): { E: number; L: number } {
  const rc = Math.max(r, 1.52)
  return { E: (1 - RS / rc) / Math.sqrt(1 - (1.5 * RS) / rc), L: circularL(rc) }
}

function localCircularSpeed(r: number): number {
  return Math.sqrt(RS / (2 * (r - RS)))
}

function recomputeE(st: OrbitalState): void {
  st.E = Math.sqrt(st.uR * st.uR + f(st.r) * (1 + (st.L * st.L) / (st.r * st.r)))
}

// d²r/dτ² = −GM/r² + L²/r³ − 3GM·L²/r⁴
function radialAccel(r: number, L: number): number {
  const r2 = r * r
  const L2 = L * L
  return -GM / r2 + L2 / (r2 * r) - (3 * GM * L2) / (r2 * r2)
}

// RK4: (r, u_r, φ) — L jeodezik boyunca sabittir
function rk4(st: OrbitalState, h: number): void {
  const { L } = st
  const r0 = st.r
  const u0 = st.uR
  const k1r = u0
  const k1u = radialAccel(r0, L)
  const k1p = L / (r0 * r0)
  const r1 = r0 + 0.5 * h * k1r
  const k2r = u0 + 0.5 * h * k1u
  const k2u = radialAccel(r1, L)
  const k2p = L / (r1 * r1)
  const r2 = r0 + 0.5 * h * k2r
  const k3r = u0 + 0.5 * h * k2u
  const k3u = radialAccel(r2, L)
  const k3p = L / (r2 * r2)
  const r3 = r0 + h * k3r
  const k4r = u0 + h * k3u
  const k4u = radialAccel(r3, L)
  const k4p = L / (r3 * r3)
  st.r = r0 + (h / 6) * (k1r + 2 * k2r + 2 * k3r + k4r)
  st.uR = u0 + (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u)
  st.phi += (h / 6) * (k1p + 2 * k2p + 2 * k3p + k4p)
  if (st.phi > Math.PI * 2) st.phi -= Math.PI * 2 * Math.floor(st.phi / (Math.PI * 2))
}

// iç yörüngelerin hızlı dinamiğini çözmek için yarıçapa bağlı adım tavanı
function dtauCap(r: number): number {
  return 0.015 * Math.min(Math.max(r - RS, 0.05), 1)
}

function advance(st: OrbitalState, dtCoord: number): number {
  let remaining = dtCoord
  let guard = 0
  let dtauTotal = 0
  while (remaining > 1e-6 && guard++ < 140) {
    const fr = f(st.r)
    if (fr < 2e-3 || st.r < 1.005) break // uzak gözlemci için ufukta donmuş
    const rate = st.E / fr // dt/dτ
    const dtau = Math.min(dtauCap(st.r), remaining / rate)
    rk4(st, dtau)
    dtauTotal += dtau
    remaining -= dtau * rate
  }
  return dtauTotal
}

function localSpeed(st: OrbitalState): number {
  const ratio = f(st.r) / (st.E * st.E)
  return Math.sqrt(Math.min(Math.max(1 - ratio, 0), 0.9999))
}

function totalDilation(st: OrbitalState): number {
  const fr = f(st.r)
  return fr > 1e-9 ? st.E / fr : Infinity
}

function positionOf(st: OrbitalState, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(st.phi)
  const s = Math.sin(st.phi)
  return out
    .copy(st.e1)
    .multiplyScalar(st.r * c)
    .addScaledVector(st.e2, st.r * s)
}

function coordVelocityOf(st: OrbitalState, out: THREE.Vector3): THREE.Vector3 {
  const fr = f(st.r)
  if (st.E < 1e-9) return out.set(0, 0, 0)
  const dtdtau = st.E / Math.max(fr, 1e-9)
  const drdt = st.uR / dtdtau
  const dphidt = st.L / (st.r * st.r) / dtdtau
  const c = Math.cos(st.phi)
  const s = Math.sin(st.phi)
  // dx/dt = ṙ·r̂ + r·φ̇·φ̂
  out
    .copy(st.e1)
    .multiplyScalar(drdt * c - st.r * dphidt * s)
    .addScaledVector(st.e2, drdt * s + st.r * dphidt * c)
  return out
}

const _rhat = new THREE.Vector3()
const _vt = new THREE.Vector3()
const _n = new THREE.Vector3()

function stateFromPosVel(pos: THREE.Vector3, vel: THREE.Vector3): OrbitalState {
  const r = Math.max(pos.length(), 1.01)
  const fr = Math.max(f(r), 1e-4)
  _rhat.copy(pos).normalize()
  let vr = vel.dot(_rhat)
  _vt.copy(vel).addScaledVector(_rhat, -vr)
  let vt = _vt.length()
  // normalizasyon: (dt/dτ)²(f − ṙ²/f − r²φ̇²) = 1 → köşeli parantez > 0 olmalı
  let bracket = fr - (vr * vr) / fr - vt * vt
  const minBracket = fr * 0.02
  if (bracket < minBracket) {
    const speed2 = (vr * vr) / fr + vt * vt
    const scale = speed2 > 1e-12 ? Math.sqrt((fr - minBracket) / speed2) : 0
    vr *= scale
    vt *= scale
    bracket = minBracket
  }
  const dtdtau = 1 / Math.sqrt(bracket)
  const e1 = _rhat.clone()
  let e2: THREE.Vector3
  if (vt > 1e-9) {
    e2 = _vt.clone().divideScalar(vt)
  } else {
    // radyal düşüş: düzlem keyfî — konuma dik herhangi bir eksen
    _n.set(0, 1, 0)
    if (Math.abs(e1.dot(_n)) > 0.99) _n.set(1, 0, 0)
    e2 = _n.clone().cross(e1).normalize()
  }
  const st: OrbitalState = {
    e1,
    e2,
    r,
    phi: 0,
    uR: vr * dtdtau,
    L: r * vt * dtdtau,
    E: 0,
  }
  recomputeE(st)
  return st
}

function scaleVelocity(st: OrbitalState, k: number): void {
  st.uR *= k
  st.L *= k
  recomputeE(st)
}

export const Schwarzschild: GeodesicEngine = {
  isco: ISCO,
  f,
  circularState,
  circularL,
  localCircularSpeed,
  recomputeE,
  advance,
  localSpeed,
  totalDilation,
  positionOf,
  coordVelocityOf,
  stateFromPosVel,
  scaleVelocity,
}
