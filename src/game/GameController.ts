import * as THREE from 'three'
import { PRESETS } from '../physics/presets'
import type { GeodesicEngine } from '../physics/geodesics'
import type { LabController } from '../sim/LabController'
import type { SimObject } from '../sim/Simulation'

/**
 * Kenetlenme oyununun durum makinesi. Lab'dan bağımsız yaşar: sahne/fizik
 * sahibi LabController kalır; GameController pod'a itki uygular, kuralları
 * değerlendirir ve HUD snapshot'ı yayınlar. Fizik yolu tamamen mevcut motor:
 * itki = koordinat hızına küçük Δv → stateFromPosVel ile yeni (E, L, u_r).
 * Presesyon, çerçeve sürüklemesi, disk sürtünmesi (Endurance'ın bozunan
 * yörüngesi dahil) motordan kendiliğinden gelir.
 */
export type GamePhase = 'idle' | 'flying' | 'docked' | 'failed'

export interface GameHud {
  /** pod–Endurance ayrımı (r₊) */
  sep: number
  /** kapanma hızı (c): + yaklaşıyor, − açılıyor */
  closure: number
  /** bağıl hız büyüklüğü (c) */
  relSpeed: number
  /** kalan yakıt 0..1 */
  fuel: number
  podR: number
  endR: number
  isco: number
  /** anlık itki girişi (−1 retro, 0 boş, +1 prograd) — HUD geri bildirimi */
  thrust: number
}

export interface GameSnapshot {
  active: boolean
  phase: GamePhase
  /** ölüm/başarı tek satırı — her son okunabilir olmalı */
  reason: string | null
  hud: GameHud | null
}

// Oyun hissi buradan akort edilir (playtest ile güncellenir)
// İlk playtest dersi: 0.03 c/s itki 4 saniyede yörüngeyi 4 r₊ düşürüyordu —
// kontrol edilemez. Yumuşak itki + ~12 saniyelik toplam yanma bütçesi.
const THRUST_ACC = 0.01 // Δv oranı: c / gerçek saniye
const FUEL_DV = 0.12 // toplam Δv bütçesi (c) — sınırlı yakıt = her itki bir karar
const DOCK_DIST = 0.45 // temas eşiği (r₊)
const DOCK_SPEED = 0.015 // güvenli temas hız limiti (c)

export class GameController {
  private readonly lab: LabController
  private engine: GeodesicEngine
  private pod: SimObject | null = null
  private endurance: SimObject | null = null
  private phase: GamePhase = 'idle'
  private reason: string | null = null
  private fuel = 0
  private thrustInput: -1 | 0 | 1 = 0
  private readonly held = new Set<string>()
  private emitAcc = 0
  private snap: GameSnapshot = { active: false, phase: 'idle', reason: null, hud: null }
  private readonly subs = new Set<() => void>()
  private readonly tmpT = new THREE.Vector3()
  private readonly tmpV = new THREE.Vector3()

  constructor(lab: LabController) {
    this.lab = lab
    this.engine = PRESETS[lab.getSnapshot().hole.id].engine
  }

  /** GameCamera'nın çapası: pod (hayaletken de) sahnedeki gerçek konumu. */
  podPosition(): THREE.Vector3 | null {
    return this.pod ? this.pod.pos : null
  }

  enter(): void {
    if (this.snap.active) return
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.startRun()
  }

  exit(): void {
    if (!this.snap.active) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.held.clear()
    this.thrustInput = 0
    this.pod = null
    this.endurance = null
    this.phase = 'idle'
    this.reason = null
    this.lab.rewind()
    this.publish()
  }

  /** Anında yeniden başlatma — menü yok, animasyon yok (R tuşu). */
  restart(): void {
    if (!this.snap.active) return
    this.startRun()
  }

  /** Her karede sim adımından ÖNCE çağrılır (öncelik −3): itki + kurallar. */
  tick(delta: number): void {
    if (!this.snap.active) return
    if (this.phase === 'flying') {
      if (this.thrustInput !== 0 && this.fuel > 0) this.applyThrust(this.thrustInput, delta)
      this.evaluate()
    }
    this.emitAcc += delta
    if (this.emitAcc >= 0.1) {
      this.emitAcc = 0
      this.publish()
    }
  }

  subscribe = (onChange: () => void): (() => void) => {
    this.subs.add(onChange)
    return () => {
      this.subs.delete(onChange)
    }
  }

  getSnapshot = (): GameSnapshot => this.snap

  private startRun(): void {
    const lab = this.lab
    lab.clear()
    this.engine = PRESETS[lab.getSnapshot().hole.id].engine
    // her denemede rastgele kurulum: ezber yok, okuma becerisi var
    // test/akort pinleri: ?oyun=yakin → son yaklaşma provası;
    // ?oyun=temas → temas zarfının içinde doğ (kenetlenme dalı doğrulaması)
    const pin = new URLSearchParams(window.location.search).get('oyun')
    const rEnd = 6.6 + Math.random() * 1.6
    const rPod = pin === 'temas' ? rEnd + 0.05 : pin === 'yakin' ? rEnd + 0.2 : rEnd + 1.0 + Math.random() * 1.0
    const gapDeg = pin === 'temas' ? 1.5 : pin === 'yakin' ? 5 : 30 + Math.random() * 45
    const gapAhead = (gapDeg * Math.PI) / 180 // Endurance önde
    this.endurance = lab.sim.spawn(
      'endurance',
      this.tmpV.set(rEnd * Math.cos(gapAhead), 0, rEnd * Math.sin(gapAhead)),
      'orbit',
      true,
    )
    this.pod = lab.sim.spawn('pod', this.tmpV.set(rPod, 0, 0), 'orbit', true)
    // gemiler astronot gösterisinin sürtünme temposunda 13 saniyede ISCO'yu
    // boyluyor (playtest ölçümü) — oyun penceresi için ~8x yavaş sarmallanma
    this.endurance.dragMul = 0.12
    this.pod.dragMul = 0.12
    this.fuel = FUEL_DV
    this.phase = 'flying'
    this.reason = null
    this.publish()
  }

  /**
   * İtki: pod'un koordinat hızına prograd/retrograd Δv eklenir, durum
   * stateFromPosVel ile yeniden kurulur (ışıkaltı kıskacı ve ergosfer
   * geçerliliği motorun kendi güvenceleri). Sezgiye ters GR gerçeği:
   * retro yanmak alçaltır, alçalmak AÇISAL hızlandırır — yetişmenin yolu
   * yavaşlamaktır.
   */
  private applyThrust(dir: -1 | 1, delta: number): void {
    const pod = this.pod
    if (!pod || !pod.alive) return
    const dv = Math.min(THRUST_ACC * delta, this.fuel)
    if (dv <= 0) return
    this.tmpT.set(-pod.pos.z, 0, pod.pos.x).normalize()
    if (pod.vel.dot(this.tmpT) < 0) this.tmpT.negate() // prograd = hareket yönü
    this.tmpV.copy(pod.vel).addScaledVector(this.tmpT, dir * dv)
    const st = this.engine.stateFromPosVel(pod.pos, this.tmpV)
    pod.st.e1.copy(st.e1)
    pod.st.e2.copy(st.e2)
    pod.st.r = st.r
    pod.st.phi = st.phi
    pod.st.uR = st.uR
    pod.st.L = st.L
    pod.st.E = st.E
    this.fuel -= dv
  }

  private evaluate(): void {
    const pod = this.pod
    const end = this.endurance
    if (!pod || !end) return
    const isco = this.engine.isco
    if (!pod.alive) return this.finish('failed', 'Ufkun ardında kayboldun — sinyal kesildi.')
    if (pod.st.r <= isco)
      return this.finish('failed', `ISCO'nun altına düştün (r = ${pod.st.r.toFixed(2)} r₊) — dönüş yok.`)
    if (!end.alive || end.st.r <= isco)
      return this.finish('failed', "Endurance ISCO'ya düştü — çok geç kaldın.")
    const sep = pod.pos.distanceTo(end.pos)
    const rel = this.tmpV.copy(pod.vel).sub(end.vel).length()
    if (sep < DOCK_DIST) {
      if (rel <= DOCK_SPEED)
        return this.finish('docked', `KENETLENDİN — temas hızı ${rel.toFixed(3)} c. Cooper gurur duyardı.`)
      return this.finish('failed', `Çarptın — temas hızı ${rel.toFixed(3)} c (limit ${DOCK_SPEED} c).`)
    }
  }

  private finish(phase: 'docked' | 'failed', reason: string): void {
    this.phase = phase
    this.reason = reason
    this.publish() // son anında yayın: tek satır sebep + R ile tekrar
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase()
    if (k === 'w' || k === 'arrowup' || k === 's' || k === 'arrowdown') {
      e.preventDefault()
      this.held.add(k)
      this.syncThrust()
    } else if (k === 'r') {
      this.restart()
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.key.toLowerCase())
    this.syncThrust()
  }

  private syncThrust(): void {
    const fwd = this.held.has('w') || this.held.has('arrowup')
    const back = this.held.has('s') || this.held.has('arrowdown')
    this.thrustInput = fwd === back ? 0 : fwd ? 1 : -1
  }

  private publish(): void {
    const pod = this.pod
    const end = this.endurance
    let hud: GameHud | null = null
    if (pod && end && this.phase !== 'idle') {
      const sep = pod.pos.distanceTo(end.pos)
      const relV = this.tmpV.copy(pod.vel).sub(end.vel)
      const relSpeed = relV.length()
      // kapanma hızı: ayrım vektörünün üzerine bağıl hızın izdüşümü
      this.tmpT.copy(end.pos).sub(pod.pos)
      const closure = sep > 1e-9 ? relV.dot(this.tmpT) / sep : 0
      hud = {
        sep,
        closure,
        relSpeed,
        fuel: this.fuel / FUEL_DV,
        podR: pod.st.r,
        endR: end.st.r,
        isco: this.engine.isco,
        thrust: this.thrustInput,
      }
    }
    this.snap = {
      active: this.phase !== 'idle',
      phase: this.phase,
      reason: this.reason,
      hud,
    }
    this.subs.forEach((fn) => fn())
  }
}
