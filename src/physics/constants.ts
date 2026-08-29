/** Geometrik birimler: uzunluk birimi = olay ufku yarıçapı (rs = 1). */
export const RS = 1
export const GM = 0.5
export const ISCO = 3

/**
 * Gerçek zaman → simülasyon zamanı çarpanı (birim: sim-zaman/saniye).
 * Tarihçe: delta ms/saniye birim hatası yüzünden fizik adımı her karede
 * 0.05'e kelepçeleniyordu; 60 fps'te etkin tempo 0.05×5.5×60 = 16.5/s idi.
 * Birim düzeltilince aynı GÖRSEL tempoyu korumak için 5.5 → 16.5 yapıldı;
 * tempo artık kare hızından bağımsızdır (yavaş makinede de aynı akış).
 */
export const SIM_SPEED = 16.5
