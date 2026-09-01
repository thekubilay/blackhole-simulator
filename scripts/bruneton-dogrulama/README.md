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

Not: `kesisim.mjs`/`kesisim2.mjs` (Bruneton'un mod-π iki-görüntü şemasının bizde
neden ÇALIŞMADIĞINI gösteren ara adımlar) tarihçe olarak hafızada; şemanın
varsayımı kameranın diskin dışında olması, bizim kamera disk kenarında.
