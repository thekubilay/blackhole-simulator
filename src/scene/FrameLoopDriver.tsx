import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { LabController } from '../sim/LabController'

const HIDDEN_INTERVAL_MS = 100 // gizli sekmede 10 fps

/**
 * Kare döngüsü (SRP): Canvas frameloop="never" iken advance() ile sürer.
 * Kare tavanı controller'dan CANLI okunur: 60 (varsayılan, GPU serin) veya
 * 120 (ProMotion). Gizli sekmede düşük güç modu.
 */
export function FrameLoopDriver({ controller }: { controller: LabController }) {
  const advance = useThree((s) => s.advance)
  useEffect(() => {
    let raf = 0
    let hiddenTimer: number | null = null
    let lastRender = 0
    let disposed = false
    const tick = () => {
      if (disposed) return
      const now = performance.now()
      // KRİTİK: R3F frameloop="never"da useFrame delta'sını buradaki zaman
      // damgasının HAM FARKINDAN türetir (birim çevirmez). Milisaniye verilirse
      // delta ms olur: FPS 1/16.7≈0 gösterir ve governor sonsuza dek en düşük
      // kademeye kilitlenir. Three sözleşmesi gereği SANİYE veriyoruz.
      if (document.hidden) {
        lastRender = now
        advance(now / 1000)
        hiddenTimer = window.setTimeout(tick, HIDDEN_INTERVAL_MS)
        return
      }
      hiddenTimer = null
      // eşik = kare süresinin ~%93'ü: vsync zamanlamasındaki titreme kareyi
      // yanlışlıkla atlatmasın (60 → 15.5 ms, 120 → 7.75 ms)
      if (now - lastRender >= 930 / controller.frameCap) {
        lastRender = now
        advance(now / 1000)
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
  }, [advance, controller])
  return null
}
