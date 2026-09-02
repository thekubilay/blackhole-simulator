import type * as THREE from 'three'
import type { DeviceClass, PowerMode, PowerPolicy, PressureState } from '../sim/PowerPolicy'

/**
 * GÜÇ SENSÖRLERİ — tarayıcının güç/ısı hakkında söyleyebildiği her şeyi
 * PowerPolicy'ye taşır (adaptör katmanı; politika saf kalır).
 *
 * 1) Cihaz sınıfı: renderer dizgisi (Chrome'da UNMASKED, Safari/Firefox'ta
 *    maskeli — "Apple GPU" gibi) + kaba işaretçi. Ölçüm DEĞİL, ön yargı: hangi
 *    güç modunun varsayılan olacağını seçer. detect-gpu'nun yaptığı da bu ama
 *    biz gerçek maliyeti zaten ölçüyoruz (budgetProbe); sınıf yeter.
 * 2) Battery Status API: yalnız Chromium; pilde çalışırken bütçe ×0.75.
 * 3) Compute Pressure API: Chrome 125+, HTTPS, yalnız "cpu" kaynağı. "fair" =
 *    "fanlar devreye girip duyulabilir" (spesifikasyon). Chromium dışında
 *    sessizce yok — ilerlemeli iyileştirme.
 */

export function rendererString(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext()
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const s = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  return typeof s === 'string' ? s : ''
}

const MOBILE_GPU = /Adreno|Mali|PowerVR|Immortalis|Apple A\d{1,2}\b|iPhone|iPad/i
/** ayrık GPU: fanlı, güç bütçesi geniş — "Radeon Graphics"/"Radeon(TM)" APU'dur, RX değil */
const DISCRETE_GPU = /GeForce|\bRTX\b|\bGTX\b|Quadro|Tesla|Radeon\s*(RX|PRO|VII|R9|R7)\b|Arc\s*[AB]\d/i
const INTEGRATED_GPU =
  /Apple M\d|Apple GPU|Iris|UHD Graphics|HD Graphics|Xe Graphics|Radeon\(TM\)|Radeon Graphics|Vega \d|llvmpipe|SwiftShader/i

export function classifyDevice(renderer: string, coarsePointer: boolean): { cls: DeviceClass; mode: PowerMode } {
  const uaMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true
  if (coarsePointer || uaMobile || MOBILE_GPU.test(renderer)) return { cls: 'mobil', mode: 'sessiz' }
  if (DISCRETE_GPU.test(renderer)) return { cls: 'ayrik', mode: 'performans' }
  if (INTEGRATED_GPU.test(renderer)) return { cls: 'entegre', mode: 'dengeli' }
  return { cls: 'bilinmiyor', mode: 'dengeli' }
}

/**
 * KALICILIK — yalnız güç modu, yalnız ELLE seçim. Kalite ve fps tavanı deneme
 * ayarlarıdır, sıfırlanmaları doğal; güç modu cihazın fiziksel bir özelliğine
 * (fan) verilen cevaptır — kullanıcı fanı bir kez duyup Sessiz'i seçti diye her
 * açılışta yeniden seçmesin. Otomatik seçim saklanmaz (cihaz sınıfı her açılışta
 * yeniden çözülür), `?butce=` pini her zaman ezer. Depolama engelliyse sessiz.
 */
const POWER_MODE_KEY = 'kdl.gucModu'
const POWER_MODES: readonly PowerMode[] = ['sessiz', 'dengeli', 'performans']

export function loadPowerMode(): PowerMode | null {
  try {
    const v = window.localStorage.getItem(POWER_MODE_KEY)
    return v && (POWER_MODES as readonly string[]).includes(v) ? (v as PowerMode) : null
  } catch {
    return null
  }
}

export function savePowerMode(mode: PowerMode | null): void {
  try {
    if (mode === null) window.localStorage.removeItem(POWER_MODE_KEY)
    else window.localStorage.setItem(POWER_MODE_KEY, mode)
  } catch {
    /* depolama yok/engelli: kalıcılık yok, çalışma sürer */
  }
}

/** Politikayı depoyla bağlar: açılışta elle seçimi yükler, değişimde yazar. Dönüş: iptal. */
export function persistPowerMode(policy: PowerPolicy): () => void {
  if (policy.snapshot.override !== null) return () => {}
  const stored = loadPowerMode()
  if (stored) policy.setMode(stored)
  return policy.onChange(() => {
    const s = policy.snapshot
    savePowerMode(s.auto ? null : s.mode)
  })
}

interface BatteryLike extends EventTarget {
  charging: boolean
}

/** Pil durumunu izler; API yoksa hiçbir şey yapmaz. Dönüş: iptal. */
export function watchBattery(policy: PowerPolicy): () => void {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }
  if (typeof nav.getBattery !== 'function') return () => {}
  let battery: BatteryLike | null = null
  let disposed = false
  const update = () => {
    if (battery) policy.setOnBattery(!battery.charging)
  }
  nav
    .getBattery()
    .then((b) => {
      if (disposed) return
      battery = b
      update()
      b.addEventListener('chargingchange', update)
    })
    .catch(() => {})
  return () => {
    disposed = true
    battery?.removeEventListener('chargingchange', update)
  }
}

interface PressureRecordLike {
  state: PressureState
}
interface PressureObserverLike {
  observe(source: string, options?: { sampleInterval?: number }): Promise<void>
  disconnect(): void
}
type PressureObserverCtor = new (cb: (records: PressureRecordLike[]) => void) => PressureObserverLike

/** Sistem basıncını (CPU) izler; API yoksa hiçbir şey yapmaz. Dönüş: iptal. */
export function watchPressure(policy: PowerPolicy): () => void {
  const Ctor = (window as unknown as { PressureObserver?: PressureObserverCtor }).PressureObserver
  if (!Ctor) return () => {}
  let obs: PressureObserverLike
  try {
    obs = new Ctor((records) => {
      const last = records[records.length - 1]
      if (last) policy.reportPressure(last.state, performance.now() / 1000)
    })
    obs.observe('cpu', { sampleInterval: 2000 }).catch(() => {})
  } catch {
    return () => {}
  }
  return () => obs.disconnect()
}
