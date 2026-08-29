import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

const FRAME_MIN_MS = 15.5 // sabit 60 fps sınırı
const HIDDEN_INTERVAL_MS = 100 // gizli sekmede 10 fps

/**
 * Kare döngüsü (SRP): Canvas frameloop="never" iken advance() ile sürer.
 * 60 fps sınırı ve gizli sekmede düşük güç modu — GPU uzun oturumda serin kalır.
 */
export function FrameLoopDriver() {
  const advance = useThree((s) => s.advance)
  useEffect(() => {
    let raf = 0
    let hiddenTimer: number | null = null
    let lastRender = 0
    let disposed = false
    const tick = () => {
      if (disposed) return
      const now = performance.now()
      if (document.hidden) {
        lastRender = now
        advance(now)
        hiddenTimer = window.setTimeout(tick, HIDDEN_INTERVAL_MS)
        return
      }
      hiddenTimer = null
      if (now - lastRender >= FRAME_MIN_MS) {
        lastRender = now
        advance(now)
      }
      raf = requestAnimationFrame(tick)
    }
    // gizli sekme zamanlayıcıları kısılır — görünür olunca döngüyü yeniden tekmele
    const onVisibility = () => {
      if (!document.hidden && hiddenTimer !== null) {
        clearTimeout(hiddenTimer)
        hiddenTimer = null
        raf = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      if (hiddenTimer !== null) clearTimeout(hiddenTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [advance])
  return null
}
