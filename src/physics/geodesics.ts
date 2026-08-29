import type * as THREE from 'three'

/**
 * Ortak jeodezik durum: her cismin yörüngesi (e1,e2) düzleminde (r, φ, u_r)
 * ile korunan L ve E olarak tutulur. Sahne birimi = olay ufku yarıçapı
 * (r = 1 → ufuk), motorlar kendi iç birimlerine çevirir.
 */
export interface OrbitalState {
  e1: THREE.Vector3
  e2: THREE.Vector3
  r: number
  phi: number
  uR: number
  L: number
  E: number
}

/**
 * Metrik motor soyutlaması (DIP/LSP): Schwarzschild ve Kerr aynı sözleşmeyi
 * gerçekler; Simulation ve LabController hangisiyle çalıştığını bilmez.
 * Tüm r değerleri sahne birimindedir (ufuk = 1).
 */
export interface GeodesicEngine {
  /** en içteki kararlı dairesel yörünge (sahne birimi) */
  readonly isco: number
  /** statik/ZAMO gözlemci lapse² — ufukta 0'a gider (Schwarzschild'de 1−rs/r) */
  f(r: number): number
  /** prograd dairesel yörünge özgül açısal momentumu (motorun iç birimi) */
  circularL(r: number): number
  /**
   * Prograd dairesel yörüngenin ANALİTİK (E, L) çifti. Uç Kerr'de E'yi
   * normalizasyon kuadratiğinden çözmek katastrofik iptale uğrar; dairesel
   * bırakmalar bu kararlı formu kullanmalıdır.
   */
  circularState(r: number): { E: number; L: number }
  /** yerel gözlemcinin ölçtüğü dairesel yörünge hızı (c biriminde) */
  localCircularSpeed(r: number): number
  /** E'yi (r, u_r, L) normalizasyonundan yeniden hesapla */
  recomputeE(st: OrbitalState): void
  /** koordinat zamanında dtCoord (sahne birimi) ilerlet; geçen öz zamanı döndür */
  advance(st: OrbitalState, dtCoord: number): number
  /** yerel gözlemciye göre hız (c biriminde) */
  localSpeed(st: OrbitalState): number
  /** toplam zaman genişlemesi dt/dτ */
  totalDilation(st: OrbitalState): number
  positionOf(st: OrbitalState, out: THREE.Vector3): THREE.Vector3
  /** koordinat hızı dx/dt (c biriminde, sahne yönleri) */
  coordVelocityOf(st: OrbitalState, out: THREE.Vector3): THREE.Vector3
  /** 3B konum + koordinat hızından durum kur (ışık hızı altına kıskaçlar) */
  stateFromPosVel(pos: THREE.Vector3, vel: THREE.Vector3): OrbitalState
  /** sürtünme: u_r ve L'yi ölçekle, E'yi normalizasyondan güncelle */
  scaleVelocity(st: OrbitalState, k: number): void
}
