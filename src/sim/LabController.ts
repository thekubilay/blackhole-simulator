import * as THREE from 'three'
import { LAB_TIME_SCALE, SIM_SPEED } from '../physics/constants'
import type { BlackHolePreset, HoleVisual } from '../physics/presets'
import type {
  BodyRegistry,
  FocusTelemetry,
  LabCommands,
  LabSnapshot,
  SnapshotSource,
  SpawnMode,
} from './types'
import type { SimObject, Simulation } from './Simulation'
import type { QualityGovernor, QualityLevel } from './QualityGovernor'

const G_SI = 6.674e-11
const MSUN_KG = 1.989e30

/** Astronot bırakma şimdilik devre dışı — true yapınca özellik olduğu gibi geri gelir. */
export const ASTRONAUT_ENABLED = false

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
  private armed: string | null = ASTRONAUT_ENABLED ? 'astro' : null
  private mode: SpawnMode = 'orbit'
  private paused = false
  private timeScale = LAB_TIME_SCALE
  private focus: SimObject | null = null
  private realistic = false
  private resetSeq = 0
  private fpsCap: 60 | 120 = 60
  private hint = ASTRONAUT_ENABLED
    ? 'Astronot hazır — bırakmak için disk düzleminde bir noktaya tıkla.'
    : 'Sahneyi keşfet — sürükleyerek döndür, tekerlek/iki parmakla yaklaş.'
  private emitAcc = 0
  private snap: LabSnapshot
  private readonly subs = new Set<() => void>()

  constructor(
    sim: Simulation,
    governor: QualityGovernor,
    registry: BodyRegistry,
    presets: Readonly<Record<string, BlackHolePreset>>,
    initialPresetId: string,
    initialFpsCap: 60 | 120 = 60,
  ) {
    this.sim = sim
    this.governor = governor
    this.registry = registry
    this.presets = presets
    this.preset = presets[initialPresetId]
    this.fpsCap = initialFpsCap
    this.governor.setFrameCap(initialFpsCap)
    this.snap = this.buildSnapshot()
  }

  /** Kare döngüsünün canlı okuduğu tavan (FrameLoopDriver). */
  get frameCap(): number {
    return this.fpsCap
  }

  setFpsCap(cap: 60 | 120): void {
    if (cap === this.fpsCap) return
    this.fpsCap = cap
    // governor eşikleri tavanın oranıdır: tavan değişti, ölçüm geçmişi geçersiz
    this.governor.setFrameCap(cap)
    this.hint =
      cap === 120
        ? '120 fps tavanı: ProMotion ekranda gözle görülür akıcılık — GPU işi ~2 katına çıkar, 60 Hz ekranda fark yaratmaz (vsync). Kalite kademesi 60 Hz güç bütçesine göre kalır, fan dönebilir.'
        : '60 fps tavanı: GPU uzun oturumda serin ve sessiz kalır (varsayılan).'
    this.publish()
  }

  /** Her karede R3F döngüsünden çağrılır. */
  advance(delta: number): void {
    // fizik adımı 50 ms ile kelepçelidir (entegratör kararlılığı) ama governor
    // GERÇEK kare süresini görmeli — yoksa HUD 20 fps'in altını asla gösteremez
    const dt = Math.min(delta, 0.05)
    const dtSim = this.paused ? 0 : dt * SIM_SPEED * this.timeScale
    this.simTime += dtSim
    // uzun oturumda float32 shader zamanı hassas kalsın
    if (this.simTime > 7200) this.simTime -= 7200
    if (import.meta.env.DEV) {
      // ölçüm kancası (GameCamera'daki __gameCam ile aynı desen): zaman hızı
      // oyuna girince 1'e sabitlenmeli, çıkınca oyuncunun lab ayarına dönmeli
      ;(window as unknown as Record<string, unknown>).__lab = {
        timeScale: this.timeScale,
        simTime: this.simTime,
      }
    }
    if (dtSim > 0) this.sim.step(dtSim)
    // Gizli sekmede kare döngüsü KASITLI olarak ~10 fps'e iner (FrameLoopDriver,
    // HIDDEN_INTERVAL_MS). Bu sahte yavaşlık governor'a yedirilirse her 1.5 sn'de
    // bir kademe inilir, her inişte geri-tepme cezası damgalanır ve sekme yarım
    // dakika arka planda kalınca simülasyon kalıcı olarak tabana çivilenir.
    // Arka plandaki sekme kalite kararı vermez.
    if (!document.hidden) this.governor.tick(delta)
    this.emitAcc += dt
    if (this.emitAcc >= 0.2) {
      this.emitAcc = 0
      this.publish()
    }
  }

  spawnAt = (point: THREE.Vector3): void => {
    if (!ASTRONAUT_ENABLED || !this.armed) return
    // tek astronot kuralı: sahnede bir cisim varken yenisi bırakılamaz
    if (this.sim.objects.length > 0) {
      this.hint = this.sim.objects.some((o) => o.alive)
        ? 'Sahnede zaten bir astronot var — yörüngesini izleyin ya da ↻ ile sahneyi başa sarın.'
        : 'Önceki astronot yutuldu — yenisini bırakmak için sahneyi sıfırlayın (Temizle ya da ↻).'
      this.publish()
      return
    }
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

  /** Aktif deliğin GÖZLENMİŞ görsel imzası (disk tipi, değişkenlik, jet,
   * bulutsu) — shader uniform'larına birebir gider. Referans döner: kare
   * döngüsünde nesne ayırmaz. */
  get holeVisual(): HoleVisual {
    return this.preset.visual
  }

  /** Görsel katmanın (shader) okuduğu, deliğe özgü GERÇEK türetimler. */
  get visual(): { diskIn: number; efficiency: number; realism: number } {
    return {
      diskIn: this.preset.profile.diskIn,
      efficiency: this.preset.efficiency,
      realism: this.realistic ? 1 : 0,
    }
  }

  setRealistic(on: boolean): void {
    this.realistic = on
    // uzun anlatım GENEL AYARLAR'daki tanıtım kutusunda duruyor (ControlsPanel
    // VIEW_ABOUT) — ipucu satırı yalnız değişimi bildirir, metni tekrarlamaz
    this.hint = on ? 'Gerçekçi (g⁴) görünüme geçildi.' : 'Sanatsal görünüme geçildi.'
    this.publish()
  }

  setArmed(type: string): void {
    if (!ASTRONAUT_ENABLED) return
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

  setQuality(label: string | null): void {
    this.governor.setLevel(label)
    this.publish()
  }

  qualityOptions = (): readonly QualityLevel[] => this.governor.options

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

  /** Tam "başa sar": nesneler, duraklatma, zaman hızı ve kamera sıfırlanır. */
  rewind(): void {
    this.sim.clear()
    this.focus = null
    this.paused = false
    this.timeScale = LAB_TIME_SCALE
    this.resetSeq++
    this.hint = 'Sahne başa sarıldı — kamera ve zaman sıfırlandı.'
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
      qualityAuto: this.governor.auto,
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
      realistic: this.realistic,
      resetSeq: this.resetSeq,
      fpsCap: this.fpsCap,
    }
  }
}
