import * as THREE from 'three'
import { SIM_SPEED } from '../physics/constants'
import type { BlackHolePreset } from '../physics/presets'
import type {
  BodyRegistry,
  FocusTelemetry,
  LabCommands,
  LabSnapshot,
  SnapshotSource,
  SpawnMode,
} from './types'
import type { SimObject, Simulation } from './Simulation'
import type { QualityGovernor } from './QualityGovernor'

const G_SI = 6.674e-11
const MSUN_KG = 1.989e30

const MODE_HINTS: Record<SpawnMode, string> = {
  orbit:
    'Yörünge: cisme tam GR dairesel yörünge koşulu verilir (ISCO dışında kararlı) — ama disk plazması sürtünmesi yörüngeyi yavaşça bozar ve cisim içeri sarmallanır.',
  flyby: "Yakın geçiş: dairesel L'nin %72'si — eliptik dalış, çoğu cisim ufku boylar.",
  fall: 'Serbest düşüş: cisim durgun bırakılır (L = 0) — radyal jeodezikle ufka düşer, düşerken uzar.',
}

/**
 * Uygulama durumu ve UI köprüsü (SRP): komutları alır, simülasyonu ilerletir,
 * 5 Hz'de değişmez snapshot yayınlar. Ekrandaki her sayı simülasyonun jeodezik
 * durumundan (r, u_r, L, E) türetilir — ayrı bir "gösterim fiziği" yoktur.
 * Aktif kara delik bir preset'tir (gerçek kütle/spin verisi + motor).
 */
export class LabController implements LabCommands, SnapshotSource {
  readonly sim: Simulation
  simTime = 0
  private readonly governor: QualityGovernor
  private readonly registry: BodyRegistry
  private readonly presets: Readonly<Record<string, BlackHolePreset>>
  private preset: BlackHolePreset
  private armed: string | null = 'astro'
  private mode: SpawnMode = 'orbit'
  private paused = false
  private timeScale = 1
  private focus: SimObject | null = null
  private hint = 'Astronot hazır — bırakmak için disk düzleminde bir noktaya tıkla.'
  private emitAcc = 0
  private snap: LabSnapshot
  private readonly subs = new Set<() => void>()

  constructor(
    sim: Simulation,
    governor: QualityGovernor,
    registry: BodyRegistry,
    presets: Readonly<Record<string, BlackHolePreset>>,
    initialPresetId: string,
  ) {
    this.sim = sim
    this.governor = governor
    this.registry = registry
    this.presets = presets
    this.preset = presets[initialPresetId]
    this.snap = this.buildSnapshot()
  }

  /** Her karede R3F döngüsünden çağrılır. */
  advance(delta: number): void {
    const dt = Math.min(delta, 0.05)
    const dtSim = this.paused ? 0 : dt * SIM_SPEED * this.timeScale
    this.simTime += dtSim
    // uzun oturumda float32 shader zamanı hassas kalsın
    if (this.simTime > 7200) this.simTime -= 7200
    if (dtSim > 0) this.sim.step(dtSim)
    this.governor.tick(dt)
    this.emitAcc += dt
    if (this.emitAcc >= 0.2) {
      this.emitAcc = 0
      this.publish()
    }
  }

  spawnAt = (point: THREE.Vector3): void => {
    if (!this.armed) return
    const obj = this.sim.spawn(this.armed, point, this.mode)
    this.focus = obj
    this.hint = `${obj.label} bırakıldı · r = ${point.length().toFixed(1)} r₊`
    this.publish()
  }

  setHole(id: string): void {
    const next = this.presets[id]
    if (!next || next.id === this.preset.id) return
    this.preset = next
    this.sim.configure(next.engine, next.profile)
    this.focus = null
    this.hint = `${next.name} yüklendi — ${next.desc}`
    this.publish()
  }

  /** Görsel katmanın (shader) okuduğu, deliğe özgü GERÇEK türetimler. */
  get visual(): { diskIn: number; efficiency: number } {
    return { diskIn: this.preset.profile.diskIn, efficiency: this.preset.efficiency }
  }

  setArmed(type: string): void {
    this.armed = this.armed === type ? null : type
    this.hint = this.armed
      ? `${this.registry[this.armed]?.label ?? this.armed} seçildi — bırakmak için sahneye tıkla. (ISCO içi: kararlı yörünge yok)`
      : 'Astronotu seçip disk düzleminde bir noktaya tıkla.'
    this.publish()
  }

  setMode(mode: SpawnMode): void {
    this.mode = mode
    this.hint = MODE_HINTS[mode]
    this.publish()
  }

  setTimeScale(x: number): void {
    this.timeScale = x
    this.publish()
  }

  togglePause(): void {
    this.paused = !this.paused
    this.publish()
  }

  clear(): void {
    this.sim.clear()
    this.focus = null
    this.hint = 'Sahne temizlendi'
    this.publish()
  }

  subscribe = (onChange: () => void): (() => void) => {
    this.subs.add(onChange)
    return () => {
      this.subs.delete(onChange)
    }
  }

  getSnapshot = (): LabSnapshot => this.snap

  private publish(): void {
    this.snap = this.buildSnapshot()
    this.subs.forEach((fn) => fn())
  }

  private buildSnapshot(): LabSnapshot {
    if (this.focus && !this.focus.alive && this.sim.objects.some((o) => o.alive)) {
      const alive = this.sim.objects.filter((o) => o.alive)
      this.focus = alive[alive.length - 1] ?? null
    }
    const engine = this.preset.engine
    let focus: FocusTelemetry | null = null
    if (this.focus) {
      const f = this.focus
      const st = f.st
      const r = st.r
      // toplam zaman genişlemesi dt/dτ — motorun tam formülünden
      const dil = engine.totalDilation(st)
      // aktif deliğin GERÇEK kütlesiyle fiziksel gelgit gradyanı: 2GM·ℓ/r³
      const massKg = this.preset.massSolar * MSUN_KG
      const rMeters = r * this.preset.rPlusMeters
      const tidalG = (2 * G_SI * massKg) / Math.pow(rMeters, 3) / 9.81
      focus = {
        label: f.label,
        r,
        v: f.alive ? engine.localSpeed(st) : null,
        z: dil - 1,
        dil,
        tide: f.breakR > 0 ? Math.min(Math.pow(f.breakR / r, 3) * 100, 999) : 0,
        stretch: f.stretch,
        status: f.status,
        alive: f.alive,
        tidalG,
        E: st.E,
        L: st.L,
        massLost: f.massLost,
        tCoordMs: f.tCoord * this.preset.timeUnitMs,
        tauMs: f.tau * this.preset.timeUnitMs,
      }
    }
    return {
      fps: Math.round(this.governor.fps),
      quality: this.governor.label,
      armed: this.armed,
      mode: this.mode,
      paused: this.paused,
      timeScale: this.timeScale,
      focus,
      hint: this.hint,
      busy: this.sim.objects.length > 0 || this.sim.debris.length > 0,
      hole: {
        id: this.preset.id,
        name: this.preset.name,
        massLabel: this.preset.massLabel,
        spinLabel: this.preset.spinLabel,
      },
    }
  }
}
