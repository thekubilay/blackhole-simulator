/**
 * EKRAN TRANSFORMU — doğrusal HDR ışıktan ekran piksellerine tek geçiş.
 *
 * İki tüketicisi vardır ve İKİSİNİN DE aynı sonucu vermesi zorunludur:
 *  • bloom hattının birleştirme geçişi (normal yol),
 *  • lens shader'ının kendi çıkışı (HDR hedefi desteklenmeyen cihazlarda
 *    `uToneMap = 1` ile devreye giren yedek yol).
 * Bu yüzden tanım TEK yerde durur ve iki shader'a da enjekte edilir; kopyalanıp
 * zamanla ayrı düşmesi mümkün değildir.
 *
 * Sıra fizikseldir: ton eşleme DOĞRUSAL ışıkta yapılır, gamma ondan sonra
 * gelir. Dither ve vinyet gamma SONRASI uygulanır — ikisi de görüntüleme
 * uzayında tanımlı kozmetik işlemlerdir.
 */
export const DISPLAY_TRANSFORM_GLSL = /* glsl */ `
// Narkowicz 2015 ACES yaklaşığı — filmsel omuz, yüksek parlaklıkları
// kırpmak yerine sıkıştırır (bloom'un beslediği >1 değerler bu sayede
// beyaza yapışmaz)
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
float dtHash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec3 finish(vec3 col, vec2 ndc){
  col = aces(col);
  col = pow(col, vec3(0.4545));
  col += (dtHash(gl_FragCoord.xy*.73)-.5)*0.012;   // dither: bantlaşmayı siler
  float vig = 1.-0.32*pow(length(ndc*vec2(1.,.8)),2.6);
  return col*vig;
}
`
