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

/**
 * Laboratuvarın varsayılan zaman hızı. Mutlak oynatma hızının fiziksel bir
 * hükmü yoktur: gerçek iç disk saniyede 366 (A0620) / 653 (Cygnus X-1) tur
 * atar — ekranda zaten ~3000 kat yavaşlatılmış haldeyiz ve disk dokusunun
 * dönüşü Kepler Ω'sına değil shader'daki sabitlere bağlıdır. 0.3, akışı daha
 * ihtişamlı gösterdiği için seçildi (kullanıcı kararı); hiçbir GR ilişkisini
 * değiştirmez — timeScale hem fizik entegratörünü hem shader zamanını
 * birlikte çarpar.
 */
export const LAB_TIME_SCALE = 0.3

/** Kenetlenme oyunu kendi temposunu sabitler: akort sabitleri (sürüklenme,
 * yakıt, ISCO'ya kalan süre) bu hızda ölçüldü, lab ayarına bağlanmaz. */
export const GAME_TIME_SCALE = 1
