export interface QualityLevel {
  label: string
  dpr: number
  steps: number
}

/**
 * Adaptif kalite (SRP): yalnız FPS ölçer ve seviye seçer; renderer'a
 * dokunmaz — tüketiciler onChange ile dinleyip kendileri uygular (DIP).
 */
export class QualityGovernor {
  private readonly levels: QualityLevel[]
  private level = 1
  private ema = 60
  private acc = 0
  private stable = 0
  private readonly listeners = new Set<(level: QualityLevel) => void>()

  constructor(deviceRatio: number) {
    this.levels = [
      { label: 'yüksek', dpr: Math.min(deviceRatio, 1.6), steps: 240 },
      { label: 'orta', dpr: Math.min(deviceRatio, 1.25), steps: 185 },
      // kalite tabanı: bundan daha bloklu asla olmaz
      { label: 'düşük', dpr: 1.0, steps: 150 },
    ]
  }

  get current(): QualityLevel {
    return this.levels[this.level]
  }

  get fps(): number {
    return this.ema
  }

  get label(): string {
    return this.current.label
  }

  onChange(fn: (level: QualityLevel) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  tick(dt: number): void {
    const fps = 1 / Math.max(dt, 1e-4)
    this.ema += (fps - this.ema) * 0.06
    this.acc += dt
    this.stable += dt
    if (this.acc < 1.5) return
    this.acc = 0
    if (this.ema < 26 && this.level < this.levels.length - 1) {
      this.level++
      this.stable = 0
      this.notify()
    } else if (this.ema > 48 && this.level > 0 && this.stable > 10) {
      this.level--
      this.stable = 0
      this.notify()
    }
  }

  private notify(): void {
    const level = this.current
    this.listeners.forEach((fn) => fn(level))
  }
}
