# Bruneton tablo yöntemi — doğrulama koşumları

`src/scene/lensTables.ts` + `lensShader.ts` tablo yolunun arkasındaki tüm sayısal
iddialar bu betiklerle üretildi. Hepsi bağımsız çalışır: `node <betik>.mjs`
(bağımlılık yok; three gerekmez). Kaynak yöntem: arXiv:2010.08735, referans
uygulama github.com/ebruneton/black_hole_shader (BSD-3-Clause).

| betik | ne kanıtlar |
|---|---|
| `bruneton.mjs` | ortak kütüphane: tablo pişirme (Euler + uyarlanabilir RK4), eşlemeler, aramalar, RK4 referans entegratörü |
| `dogrula.mjs` | referans entegratörün kendisi: zayıf alanda 2. mertebe analitik formüle (2/b + 15π/16b²) 0.67 µrad'a kadar uyum; b_krit'in iki yanında yakalanma/kaçış |
| `ozet.mjs` | ana sonuç: kaçış yönü hatası tablo 0.0045 mrad / mevcut 240 adımlık marş 4.86 mrad (medyan, 1123 ışın); U tablosu bağıl hata medyan %0.03 |
| `adaptif.mjs` | pişirme süresi: referans uygulamanın Euler dφ=1e-5'i 6.0 sn; satıra bağlı uyarlanabilir RK4 83 ms ve daha doğru (sonlandıran adım rafinesi ŞART) |
| `marsmodeli.mjs` | marşın hatası formülasyondan değil: Kartezyen ODE küçük sabit adımda referansa yakınsıyor (0.001 mrad) |
| `kesisim3.mjs` | shader'daki muhafazakâr atlama testi: 3 kamera konumu × 8192 piksel, SIFIR yanlış atlama |
| `hookkontrol.mjs` | "ikinci düzlem geçişi atlanıyor" iddiası: α+π < ψ_max ⟹ α < ψ_max; 64800 ışında iki varyant arasında 0 fark |
| `cerceve2.mjs` | çerçeve eşlemesi öz-testi: φ_c = 2Δ_apsis − Δ_kalan + π − δ ⇒ U(e², φ_c) ≈ 1/r_kamera |
| `daltesti.mjs` | tableDefl'deki apsis-simetri dalının yönü: mevcut yön 0.0012-0.0131 mrad, ters yön 141.75 mrad + 154 yakalama çelişkisi |

## Faz B2 oracle'ı (kesişim geometrisi) — hazır, shader'a girmedi

| betik | ne kanıtlar |
|---|---|
| `kesisimB2.mjs` | KAÇAN ışınlar: disk düzlemi kesişimlerinin konumu ve ışının oradaki yönü tablodan analitik çıkıyor. 2888/2916 kesişim eşleşti; yarıçap medyan %0.098 (p99 %0.31), konum medyan 0.0097 birim, YÖN medyan 0.795 mrad (p99 20.6) |
| `b2yakalanan.mjs` | YAKALANAN ışınlar (gölge önündeki iç disk): apsis YOK, `phi_c = Δ_ham + π − δ` (2Δ_apsis düzeltmesi yok, yansıtma yok). Eşleşenlerde yarıçap %0.036, konum 0.0022 birim |
| `b2teshis.mjs` | eksik kesişimlerin sebep ayrıştırması |
| `b2shader.mjs` | **lensShader.ts'teki B2 dalının BİREBİR transliterasyonu**, gerçeğe karşı: 4 kamera × 6272 piksel, disk bandında 15532 eşleşme / 74 eksik (%0.47) / 0 sahte, kaçış-yakalanma çelişkisi 0. Shader değişirse bu da değişmeli — GLSL'de gözle görülmeyen işaret/değişken hatalarını yakalayan güvenlik ağı |

**B2 geometrisinin üç kuralı** (shader'a bunlar girecek):
1. `psi_k = alpha + k*pi`, yalnız `psi_k < psi_max = delta + Δ_kalan` olanlar gerçekleşir.
2. `phi = phi_c + psi_k`; **apsis simetrisi ŞART**: `phi > phi_a` ise `phi_eff = 2*phi_a − phi`.
   Yansıtmasız kesişimlerin %20'si düşüyor (kameramız disk kenarında, phi_c zaten phi_ub'ye yakın).
3. Kesişimdeki yön tablodan değil ENERJİ BAĞINTISINDAN: `u̇ = ±√(e² + u³ − u²)`,
   işaret `phi < phi_a` ise +; yön `normalize((−u̇/u)·er + et)`.

**Bilinen sınır:** ISCO altındaki (r ≲ 2.3) kesişimler `phi_ub` kapsamının dışında
kalabiliyor — kaçan ışınlarda 26/2916, yakalananlarda 138/404. Hepsi gölgenin
içinde ve yalnız sönük atmosfere katkı verdiği için görsel etkisi ihmal edilebilir;
gerekirse `bakeInverseRadius`'un phi aralığı bizim tablomuz olduğu için genişletilebilir.

Not: `kesisim.mjs`/`kesisim2.mjs` (Bruneton'un mod-π iki-görüntü şemasının bizde
neden ÇALIŞMADIĞINI gösteren ara adımlar) tarihçe olarak hafızada; şemanın
varsayımı kameranın diskin dışında olması, bizim kamera disk kenarında.

## Faz B3 — 𝕌'nun φ ekseni artık bizim (2026-09-01)

Bruneton'un `phi_ub = (1+e²)/(1/3 + 2e²√e²)` eksen tavanı apsisi OLMAYAN
ışınlarda (e² ≥ KMU, yani YAKALANANLAR) ufka varmadan kesiliyordu. Sonuç:
gölge önündeki diskin kesişimlerinin %34'ü tablonun dışında kalıyor, o
pikseller 240 adımlık marşa düşüyordu — karenin ~%10'u.

| betik | ne kanıtlar |
|---|---|
| `phiaralik.mjs` | teşhis: φ_end/φ_ub oranı (e² ≥ KMU'da her yerde > 1, KMU'da ıraksar); gerçek kadrajlarda karenin %9.9'u yakalanan, bunların bant kesişimlerinin %34.2'si phi_ub kapsamı dışında |
| `b3shader.mjs` | **GÜNCEL GÜVENLİK AĞI** — shader'ın B2/B3 dalının birebir transliterasyonu, dört bağımsız taramaya karşı. `ESKI=1` eski yolu, `ESKIISARET=1` yalnız işaret düzeltmesini geri alıp ölçer |

**Çözüm — yeni tabloya GEREK YOK.** Doğru tavan φ_end (ışının apsise ya da
UFKA varana dek süpürdüğü açı) ve Δ = φ − atan2(u, u̇) özdeşliği sayesinde
𝔻'nin ZATEN ÇEKİLEN son satırından analitik çıkıyor:
`φ_end = Δ_son + (apsis ? π/2 : atan(1/e))`. Ek doku, ek fetch yok.
Bağımsız RK4'e karşı fark ≤ 0.08 mrad.

**İki kritik ayrıntı** (ikisi de ölçümle bulundu, tahminle değil):

1. **𝕌'nun SÜTUN ekseni 𝔻'ninkiyle aynı olmalı (`deflTexU`).** Eski
   `1/(1+6e²)` ekseninde KMU tam ORTADA kalıyor ve bilineer aradeğer apsisli
   bir sütunla (e²=0.1449) apsissiz bir sütunu (e²=0.1492) karıştırıyordu —
   ikisinin φ ekseni 2 kat farklı. Kesişim YÖNÜ 100° sapıyordu. `deflTexU`
   KMU'yu dokunun iki UCUNA koyar: aradeğer o sınırı asla geçmez.
2. **Apsisi olmayan DIŞA giden ışında (e² ≥ KMU, u̇ < 0) tablo eğrisi GERİ
   kat edilir** (`φ = φ_c − ψ`, `φ_c = Δ_ham + δ`). Eski kod orada da apsis
   yansıtması uyguluyordu ve apsis yoktu. Deliğe BAKAN kadrajlarda bu dala
   hiç uğranmıyor, o yüzden B2 doğrulamasında görünmemişti; deliğe sırtını
   dönmüş kamerada (serbest bakış) disk bandı kesişimlerinin TAMAMI
   (2436/2436) kayboluyordu.

**Sevk edilen yapılandırma: 𝕌 128×64, PHI_CAP 16.** Kapak φ_end'in KMU'da
ıraksaması için; 16 = ψ = α + kπ döngüsünün (k < 6) sorabileceği en büyük φ.

| ölçüm (b3shader.mjs) | eski B2 | yeni B3 |
|---|---|---|
| marşa düşen piksel | %10.0 | **%0** |
| disk bandı kesişimi: eksik / sahte | 20 / 0 | **0 / 0** |
| yarıçap bağıl hata medyan (p99) | %0.070 (%0.38) | **%0.009 (%0.03)** |
| kesişim yönü medyan (p99) | 0.61 (21.2) mrad | **0.07 (3.1) mrad** |
| 𝕌 pişirme süresi | 124 ms (64×32, Euler) | **26 ms** (128×64, RK4) |

Tarayıcı ölçümü (M1 Pro, 'yüksek', 2.89 Mpix, bloom açık, zaman dondurulmuş,
aynı kamera; marş referansı iki koşumda %1 içinde eşleşiyor):
**11.55 ms → 8.55 ms (1.35×)**; aynı karede tam marş 30.85 ms.
