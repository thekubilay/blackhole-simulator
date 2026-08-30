import { useEffect } from 'react'
import { useMedia } from 'react-use'
import { useTouchUi } from './touch'

/**
 * Mobilde dikey tutuşu kapatır: sahne (disk + gölge + kenetlenme aletleri)
 * yatay kadraj için tasarlandı. Destekleyen tarayıcıda ekranı yatığa kilitlemeyi
 * de dener; iOS Safari screen.orientation.lock'a izin vermez — asıl mekanizma
 * bu kapı ekranıdır.
 */
export function RotateGate() {
  const touch = useTouchUi()
  // yalnız TELEFON dikeyi kapatılır: tablet dikeyi (≥600px) zaten rahat çalışır
  const portrait = useMedia('(orientation: portrait) and (max-width: 600px)')
  const show = touch && portrait
  useEffect(() => {
    if (!show) return
    const so = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined
    // desteklenmiyorsa sessizce geç: kapı zaten görünür
    so?.lock?.('landscape').catch(() => {})
  }, [show])
  if (!show) return null
  return (
    <div className="rotate-gate">
      <div className="rotate-phone" aria-hidden="true" />
      <div className="rotate-title">TELEFONU YAN ÇEVİR</div>
      <p>
        Kara Delik Lab. yatay ekran için tasarlandı — disk, gölge ve kenetlenme aletleri ancak yatayda
        tam görünür.
      </p>
    </div>
  )
}
