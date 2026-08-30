import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { GameController } from '../game/GameController'

/**
 * Mobil uçuş kontrolü: ekranın SOL yarısı S (dal/fren), SAĞ yarısı W (tırman) —
 * basılı tutuldukça itki verir, klavyedeki tuşla birebir aynı yol.
 * Her yarı kendi parmağını ayrı izler: ikisi birden basılıysa itki sıfırlanır ve
 * birini bırakmak diğerini bozmaz (GameController.syncThrust ile aynı kural).
 */
export function TouchThrust({ game }: { game: GameController }) {
  const [downS, setDownS] = useState(false)
  const [downW, setDownW] = useState(false)
  useEffect(() => {
    game.setTouchThrust(downW === downS ? 0 : downW ? 1 : -1)
  }, [downS, downW, game])
  // ekran kapanırken (oyun bitti/çıkıldı) parmak basılı kalmış sayılmasın
  useEffect(() => () => game.setTouchThrust(0), [game])
  const hold =
    (set: (v: boolean) => void, on: boolean) => (e: ReactPointerEvent<HTMLDivElement>) => {
      // itki HER ZAMAN önce kurulur: yakalama çağrısı atarsa (eski tarayıcı,
      // geçersiz pointerId) parmak basılıyken itki hiç başlamazdı
      set(on)
      if (!on) return
      try {
        // parmak alandan kayarsa da bırakma bu öğede yakalansın
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* yakalama şart değil: bırakma pointerup/cancel ile yine gelir */
      }
    }
  return (
    <div className="touch-zones">
      <div
        className={`touch-zone touch-zone-s${downS ? ' held' : ''}`}
        onPointerDown={hold(setDownS, true)}
        onPointerUp={hold(setDownS, false)}
        onPointerCancel={hold(setDownS, false)}
        aria-hidden="true"
      >
        S
      </div>
      <div
        className={`touch-zone touch-zone-w${downW ? ' held' : ''}`}
        onPointerDown={hold(setDownW, true)}
        onPointerUp={hold(setDownW, false)}
        onPointerCancel={hold(setDownW, false)}
        aria-hidden="true"
      >
        W
      </div>
    </div>
  )
}
