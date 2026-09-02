/**
 * GÜÇ POLİTİKASI (SRP: tek iş — mod, cihaz sınıfı, pil ve sistem basıncından
 * GPU-meşgul bütçesini ve ek kademe düşüşünü türet). Saf durum: DOM/GL yok;
 * sensörler scene/powerSensors.ts'te, tüketici scene/budgetProbe.ts.
 *
 * NEDEN KATMANLI: tarayıcı fanı, sıcaklığı ve gücü GÖREMEZ. Fan firmware'in
 * kalıp sıcaklığına bağlı eğrisiyle döner; sıcaklık sürekli paket gücü ile
 * kasanın pasif dağıtma kapasitesinin farkından doğar ve bu her kasada farklı.
 * Elimizdeki sinyaller (2026):
 *   • cihaz sınıfı (renderer dizgisi + işaretçi türü) → varsayılan mod
 *   • Battery Status API (Chromium) → pilde daha muhafazakâr
 *   • Compute Pressure API (Chrome 125+, yalnız "cpu"; "thermals" spesifikasyonda
 *     ama gelmedi): "fair" tanımı "fanlar devreye girip duyulabilir" — tam bizim
 *     sinyal, ama CPU üstünden ve Chromium dışı tarayıcıda yok
 *   • kullanıcının kulağı — tek gerçek fan sensörü; bu yüzden mod düğmesi var
 * Oyunların standardı da bu: güç modu (sessiz/dengeli/performans) + ısı geri
 * beslemesi (iOS thermalState, Android ADPF headroom; web'de Compute Pressure).
 *
 * BÜTÇE: modun ms değeri × pil çarpanı; `?butce=<ms>` pini hepsini ezer (ölçüm
 * aracı, sensör tepkisi de kapalı). Basınç tepkisi moda bağlı eşikle: sessiz
 * "fair"de, dengeli "serious"ta, performans yalnız "critical"de kademe düşürür;
 * durum 20 sn sürmeli, düşüşler arası 30 sn, 5 dk sakinlikte bir kademe geri.
 */

export type PowerMode = 'sessiz' | 'dengeli' | 'performans'
export type DeviceClass = 'mobil' | 'entegre' | 'ayrik' | 'bilinmiyor'
export type PressureState = 'nominal' | 'fair' | 'serious' | 'critical'

/** 60 Hz'de kare başına GPU-meşgul bütçesi (ms). 10 ≈ %60 doluluk. */
export const MODE_BUDGET_MS: Record<PowerMode, number> = { sessiz: 7, dengeli: 10, performans: 14 }
export const MODE_LABEL: Record<PowerMode, string> = {
  sessiz: 'Sessiz',
  dengeli: 'Dengeli',
  performans: 'Performans',
}
export const DEVICE_LABEL: Record<DeviceClass, string> = {
  mobil: 'telefon/tablet, fansız',
  entegre: 'entegre GPU',
  ayrik: 'ayrık GPU',
  bilinmiyor: 'bilinmeyen GPU',
}

const BATTERY_FACTOR = 0.75
const PRESSURE_RANK: Record<PressureState, number> = { nominal: 0, fair: 1, serious: 2, critical: 3 }
/** modun tepki verdiği en düşük basınç kademesi */
const MODE_THRESHOLD: Record<PowerMode, number> = { sessiz: 1, dengeli: 2, performans: 3 }
const SUSTAIN_S = 20
const DROP_COOLDOWN_S = 30
const RECOVER_S = 300
const MAX_DROP = 2

export interface PowerSnapshot {
  mode: PowerMode
  /** true = mod cihaz sınıfından otomatik seçildi */
  auto: boolean
  deviceClass: DeviceClass
  budgetMs: number
  onBattery: boolean
  pressure: PressureState | null
  /** sistem basıncı nedeniyle tavandan düşülen kademe sayısı */
  pressureDrop: number
  /** ?butce= pini (ms); null = politika karar verir */
  override: number | null
}

export class PowerPolicy {
  private mode: PowerMode = 'dengeli'
  private auto = true
  private deviceClass: DeviceClass = 'bilinmiyor'
  private defaultMode: PowerMode = 'dengeli'
  private onBattery = false
  private pressure: PressureState | null = null
  private pressureSince = 0
  private lastHot = -Infinity
  private lastChange = -Infinity
  private drop = 0
  private readonly override: number | null
  private readonly listeners = new Set<() => void>()

  constructor(override: number | null) {
    this.override = override
  }

  /** Cihaz sınıfı (scene tarafı çözer); mod otomatikse varsayılanı buradan alır. */
  setDevice(cls: DeviceClass, defaultMode: PowerMode): void {
    this.deviceClass = cls
    this.defaultMode = defaultMode
    if (this.auto && this.mode !== defaultMode) {
      this.mode = defaultMode
      this.notify()
    } else this.notify()
  }

  /** Kullanıcı seçimi; null = otomatiğe (cihaz varsayılanına) dön. */
  setMode(mode: PowerMode | null): void {
    const next = mode ?? this.defaultMode
    this.auto = mode === null
    if (next !== this.mode) {
      this.mode = next
      this.notify()
    } else this.notify()
  }

  setOnBattery(on: boolean): void {
    if (on === this.onBattery) return
    this.onBattery = on
    this.notify()
  }

  /** Sensörden basınç durumu (Compute Pressure). Tepki tick'te, süre koşuluyla. */
  reportPressure(state: PressureState, now: number): void {
    if (state === this.pressure) return
    this.pressure = state
    this.pressureSince = now
    this.notify()
  }

  /** Kare döngüsünden (saniye). Basınç histerezisini işletir. */
  tick(now: number): void {
    if (this.override !== null || this.pressure === null) return
    const hot = PRESSURE_RANK[this.pressure] >= MODE_THRESHOLD[this.mode]
    if (hot) {
      this.lastHot = now
      if (now - this.pressureSince >= SUSTAIN_S && now - this.lastChange >= DROP_COOLDOWN_S && this.drop < MAX_DROP) {
        this.drop++
        this.lastChange = now
        this.notify()
      }
    } else if (this.drop > 0 && now - this.lastHot >= RECOVER_S && now - this.lastChange >= RECOVER_S) {
      this.drop--
      this.lastChange = now
      this.notify()
    }
  }

  get budgetMs(): number {
    if (this.override !== null) return this.override
    return MODE_BUDGET_MS[this.mode] * (this.onBattery ? BATTERY_FACTOR : 1)
  }

  /** Basınç nedeniyle tavana eklenecek kademe düşüşü (pinliyken 0). */
  get extraDrop(): number {
    return this.override !== null ? 0 : this.drop
  }

  get snapshot(): PowerSnapshot {
    return {
      mode: this.mode,
      auto: this.auto,
      deviceClass: this.deviceClass,
      budgetMs: this.budgetMs,
      onBattery: this.onBattery,
      pressure: this.pressure,
      pressureDrop: this.extraDrop,
      override: this.override,
    }
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }
}
