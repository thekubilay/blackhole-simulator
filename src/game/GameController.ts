/**
 * Kenetlenme oyununun durum makinesi (iskelet). Lab'dan bağımsız yaşar:
 * LabController sahne/fizik sahibi kalır, GameController yalnızca oyun
 * durumunu ve kamera modunu yönetir. UI, useGameSnapshot ile bağlanır.
 *
 * Yol haritası: 'flying' fazına itki + yakıt + Endurance hedefi eklenecek;
 * 'docked' / 'failed' fazları başarı-ölüm koşullarıyla gelecek.
 */
export type GamePhase = 'idle' | 'flying'

export interface GameSnapshot {
  active: boolean
  phase: GamePhase
}

export class GameController {
  private snap: GameSnapshot = { active: false, phase: 'idle' }
  private readonly subs = new Set<() => void>()

  enter(): void {
    if (this.snap.active) return
    this.snap = { active: true, phase: 'flying' }
    this.publish()
  }

  exit(): void {
    if (!this.snap.active) return
    this.snap = { active: false, phase: 'idle' }
    this.publish()
  }

  subscribe = (onChange: () => void): (() => void) => {
    this.subs.add(onChange)
    return () => {
      this.subs.delete(onChange)
    }
  }

  getSnapshot = (): GameSnapshot => this.snap

  private publish(): void {
    this.subs.forEach((fn) => fn())
  }
}
