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
