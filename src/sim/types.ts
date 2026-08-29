import type * as THREE from 'three'
import type { QualityLevel } from './QualityGovernor'

export type SpawnMode = 'orbit' | 'flyby' | 'fall'

/** Bir gövde fabrikasının ürettiği model + dinamik özellikleri. */
export interface BodyBuild {
  group: THREE.Group
  size: number
  spinAxis: THREE.Vector3
  spinRate: number
  alignToVel?: boolean
}

/** OCP: yeni gövdeler bu arayüzü gerçekleyip kayda eklenir; motor değişmez. */
export interface BodyDefinition {
  label: string
  breakR: number
  make(): BodyBuild
}

export type BodyRegistry = Readonly<Record<string, BodyDefinition>>

export interface FocusTelemetry {
  label: string
  r: number
  v: number | null
  z: number
  dil: number
  tide: number
  stretch: number
  status: string
  alive: boolean
  tidalG: number
  E: number
  L: number
  massLost: number
  /** bırakılmadan beri uzak gözlemci (Dünya) saati, ms (10 M☉ referansı) */
  tCoordMs: number
  /** bırakılmadan beri cismin öz zamanı, ms (10 M☉ referansı) */
  tauMs: number
}

export interface HoleInfo {
  id: string
  name: string
  massLabel: string
  spinLabel: string
}

export interface LabSnapshot {
  fps: number
  quality: string
  /** true = kalite FPS'e göre adaptif; false = elle/URL ile sabit */
  qualityAuto: boolean
  armed: string | null
  mode: SpawnMode
  paused: boolean
  timeScale: number
  focus: FocusTelemetry | null
  hint: string
  busy: boolean
  hole: HoleInfo
  /** görsel mod: true = fiziksel (g⁴ hüzmeleme, kara cisim renkleri) */
  realistic: boolean
  /** her "başa sar"da artar — sahne bileşenleri (kamera) bunu izleyip sıfırlanır */
  resetSeq: number
}

/** ISP: UI'nin komut tarafı — durum okumadan ayrı. */
export interface LabCommands {
  setArmed(type: string): void
  setMode(mode: SpawnMode): void
  setTimeScale(x: number): void
  togglePause(): void
  clear(): void
  /** aktif kara delik preset'ini değiştir (sahneyi temizler) */
  setHole(id: string): void
  /** görsel mod: sanatsal palet ↔ fiziksel (g⁴ + kara cisim) */
  setRealistic(on: boolean): void
  /** tam sıfırlama: nesneler + duraklatma + zaman hızı + kamera başa döner */
  rewind(): void
  /** kalite seviyesini elle seç; null = otomatik adaptasyona dön */
  setQuality(label: string | null): void
  /** bu cihazda kullanılabilir kalite seviyeleri (HUD kalite menüsü) */
  qualityOptions(): readonly QualityLevel[]
}

/** ISP: UI'nin okuma tarafı — useSyncExternalStore sözleşmesi. */
export interface SnapshotSource {
  subscribe(onChange: () => void): () => void
  getSnapshot(): LabSnapshot
}
