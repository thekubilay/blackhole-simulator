export interface HawkingReference {
  /** Schwarzschild yarıçapı (m) */
  rs: number
  /** ufuk alanı (m²) */
  A: number
  /** Bekenstein–Hawking entropisi S/kB */
  S: number
  /** Hawking sıcaklığı (K) */
  TH: number
  /** buharlaşma süresi (yıl) */
  tEv: number
  /** tayf tepe frekansı (Hz) */
  peak: number
}

/** Bekenstein–Hawking referans değerleri, M = 10 M☉ (SI). */
export const HAWKING_10MSUN: HawkingReference = (() => {
  const G = 6.674e-11
  const c = 2.998e8
  const hbar = 1.0546e-34
  const kB = 1.381e-23
  const h = 6.626e-34
  const Msun = 1.989e30
  const M = 10 * Msun
  const rs = (2 * G * M) / (c * c)
  const A = 4 * Math.PI * rs * rs
  const lp2 = (G * hbar) / (c * c * c)
  const S = A / (4 * lp2)
  const TH = (hbar * c * c * c) / (8 * Math.PI * G * M * kB)
  const tEv = (5120 * Math.PI * G * G * M * M * M) / (hbar * Math.pow(c, 4)) / 3.156e7
  const peak = (2.821 * kB * TH) / h
  return { rs, A, S, TH, tEv, peak }
})()
