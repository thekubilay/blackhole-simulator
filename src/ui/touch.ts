import { useMedia } from 'react-use'

/**
 * Dokunmatik UI anahtarı — TEK kaynak, iki tüketici:
 *  • CSS: <html class="touch"> (main.tsx'te kurulur)
 *  • React: useTouchUi()
 * Gerçek cihazda (pointer: coarse) açılır; masaüstünde `?mobil=1` pini ile de
 * açılabilir — mobil yerleşim tarayıcıda/Playwright'ta bizzat doğrulanabilsin
 * diye (?kalite= / ?fps= / ?oyun= pinleriyle aynı kültür). Pin yalnız UI'yi
 * etkiler: kalite governor'ının 'mobil' kademesi gerçek işaretçiye bakmayı
 * sürdürür, ölçümler bulanmasın.
 */
export const TOUCH_PIN = new URLSearchParams(window.location.search).get('mobil') === '1'

const COARSE = '(pointer: coarse)'

/** <html> sınıfını kurar — CSS'in dokunmatik dalı buradan açılır. */
export function applyTouchClass(): void {
  const on = TOUCH_PIN || window.matchMedia(COARSE).matches
  document.documentElement.classList.toggle('touch', on)
}

/** React tarafı: dokunmatik yerleşim (itki alanları, çevirme kapısı). */
export function useTouchUi(): boolean {
  return useMedia(COARSE, TOUCH_PIN) || TOUCH_PIN
}
