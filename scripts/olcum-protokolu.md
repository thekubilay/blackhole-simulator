# Kare süresi ölçüm protokolü

Bu sahnede performans ölçmenin **iki kez** yanlış yapıldığı yer burası. Ölçmeden
önce oku; yöntemi atlarsan ölçüm sessizce yanlış çıkar, hata vermez.

## 1. FPS yalan söyler — kare tavanı ölçümü kırpar

`?fps=120` kare tavanı **8.33 ms'lik bir yuva** demektir; varsayılan 60 ise
**16.7 ms**. Ölçtüğün kademe o yuvanın altındaysa vsync'e çarpar ve sen GPU'yu
değil **tavanı** ölçersin — üstelik sayı gayet makul görünür.

**Bu gerçekten oldu (2026-09-02):** B3'ün maliyeti "8.55 ms" diye kaydedildi,
oysa 120 Hz yuvası 8.33 ms idi. Gerçek maliyet 7.9 ms'ti ve kazanç 1.35× değil
1.46×. Aynı gün ikinci kez: bütçe kalemleri tek tek kapatıldı ve **hepsi 8.3 ms
çıktı** — çünkü hepsi tavanın altındaydı, hiçbir şey ölçülmüyordu.

**Üçüncü kez (2026-09-02 akşam, bu sefer yakalandı):** taban probe'u (10, shader
siyah yazar) 8.3 Mpix'te **8.3 ms** verdi — yine tavan. Shader ALU'su gidince
kare tavanın altına düşer; **taban ölçümü için dpr ≥ 3.2 (bloom açık), bloom
kapalıyken ≥ 4.8 gerekir.** Sayı tavana eşitse (8.3) ölçüm YOKTUR.

**Kural:** ölçmeden önce yükü tavanın ÜSTÜNE çıkar ve çıktığını DOĞRULA.

**Isıl kayma (2026-09-02):** 19.7 Mpix'te tam yük referansı 10 dakikada
43 → 58 ms'ye tırmandı. Ağır yükte referansı her 3-4 probe'da bir yeniden al,
A/B'yi dönüşümlü ölç (A, B, A, B), payları aynı pencerenin referansına böl.
Düşük güçlü ölçümler (taban) daha az kayar ama onları da dönüşümlü al.

```js
__bloom.renderer.setPixelRatio(2.6)   // 8.2 Mpix ≈ 18 ms — 8.33'ün rahatça üstü
```

Doğrulaması: çözünürlüğü değiştirdiğinde kare süresi **ölçeklenmeli**. Üç
noktada ölç; düz bir doğru çıkmıyorsa tavana çarpıyorsundur.

## 2. Disk döner — zamanı dondurmadan iki kare karşılaştırılamaz

İki ardışık kare, hiçbir şey değişmese bile **%31 piksel farkı** verir; disk
sürekli dönüyor. Görsel A/B yapacaksan önce dondur:

```js
__lens.time = 123.456      // uTime'ı sabitler
```

Doğru kurulmuşsa aynı yolda ardışık iki kare **bit-bit aynı** çıkar. Çıkmıyorsa
kamera da hareket ediyordur (açılış dolly'si ~14 sn sürer, bekle).

## 3. Piksel geri okuma: tuvali değil HDR hedefini oku

Tuvalden `gl.readPixels` **çift tamponlama yüzünden dönüşümlü** iki kareyi
verir — art arda üç okuma A, B, A döner ve "fark" istatistiği anlamsızlaşır.
Bloom hattının HDR hedefi ise kalıcıdır ve ton eşlemeden ÖNCEKİ doğrusal lens
çıktısını verir, yani karşılaştırmak istediğin şeyin ta kendisidir.

Hedef **HalfFloat**'tır: `Float32Array` verirsen `INVALID_OPERATION` (1282) alır
ve sessizce sıfır dönersin. `Uint16Array` kullan, yarım-float'ı elle çöz.

```js
const t = __bloom.hdr, buf = new Uint16Array(t.width*t.height*4)
__bloom.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, buf)
```

## 4. Sürümler arası karşılaştırmada REFERANSI HER İKİ KOŞUMDA ölç

Aynı kod iki sayfa yüklemesi arasında **%22 sapabiliyor** (termal, sürücü
durumu, arka plan). B2 → B3 karşılaştırması ancak her iki koşumda da tam marş
referansı (`__lens.b2 = 0`) ölçülüp ona normalize edilerek sağlamlaştı —
referans %1 içinde eşleşince karşılaştırma güvenilir sayıldı.

## 5. Kancalar (yalnız DEV)

| kanca | ne yapar |
|---|---|
| `__lens.b2 = 0 / 1` | tablo yolu ↔ tam marş, AYNI karede (sayfa yenilemesi gerekmez) |
| `__lens.time = <sayı>` | diski dondurur |
| `__lens.probe = 1..10` | bütçe kalemlerini tek tek kapatır (aşağıda) |
| `?aa=0` (URL) | tuvalin 4× MSAA'sı kapalı — bağlam özniteliği, yalnız yüklenişte |
| `__lens.uniforms` | canlı uniform nesnesi |
| `__bloom` | renderer, HDR hedefi, `setEnabled(false)` ile bloom payı |
| `__lab` | timeScale / simTime (salt okunur anlık görüntü) |

`__lens.b2 = 1`, oturum `?b2=0` ile açıldıysa **çalışmaz** — 𝕌 dokusu tembel
pişiyor, o oturumda hiç pişmemiştir. Kanca bunu bilerek reddeder.

## 6. Bütçe probe'ları ve kayıtlı taban

`lensShader.ts` içindeki `PROBE` sabitleri **yalnız DEV'de** derlenir; üretim
shader'ında karşılıkları yoktur (paket kontrol edildi: GLSL'de `uProbe` yok).

| `__lens.probe` | kapatılan |
|---|---|
| 1 | disk gürültüsü (fbm zinciri) sabite döner |
| 2 | atmosfer örnekleri hiç alınmaz |
| 3 | yıldız + bulutsu fonu siyah |
| 4 | üçü birden |
| 5 | 𝔻/𝕌 tablo aramaları: fetch2 4 bilineer tap yerine TEK nearest tap (sabit döndürülemez, sahne dalları değişir) |
| 6 | sampleDisk'in relativistik gölgeleme zinciri (β→γ→dop→gfac→shift→boost→ramp) sabit renge, 1×/kesişim |
| 7 | B2 kesişim döngüsü (k) hiç dönmez — 𝕌 + trig + disk + atmo birden |
| 8 | B2 çıkış kompoziti: iki halo exp'i + outColor atlanır |
| 9 | sampleAtmo'nun gölgeleme zinciri sabit renge, 4×/kesişim (6 + 9 = 5× toplam) |
| 10 | main'in ilk satırında siyah: TABAN (quad + HDR hedefi + bloom + MSAA + tuval; shader ALU'su sıfır) |

**%45'lik "kalan"ın ayrıştırılması (2026-09-02, M1 Pro, 8.31 Mpix, ref ≈ 19.5 ms;
paylar aynı pencerenin referansına göre):**

| kalem | ms | pay | nasıl ölçüldü |
|---|---|---|---|
| disk gürültüsü (fbm) | 3.75 | %19 | probe 1 |
| atmosfer — toplam | 3.75 | %19 | probe 2 |
| ↳ gölgeleme zinciri 4× | 1.55 | %8 | probe 9 |
| ↳ gürültü + geometri | 2.2 | %11 | 2 − 9 |
| bloom (HDR yolu) | 3.1 | %16 | `setEnabled(false)`, 0.37 ms/Mpix |
| piksel başı kurulum + tablo ALU (acos/tan/asin/log, 2× tableRaw, phiC…) | ~2.5 | %13 | kalan |
| **MSAA 4× tuval** | **~2.2** | **%11** | `?aa=0`, taban 19.7 Mpix'te 14.6 → ≤8.4 (0.27 ms/Mpix) |
| sabit taban (çözünürlükten bağımsız) | ~2.0 | %10 | taban doğrusunun kesim noktası |
| yıldız + bulutsu | 1.05 | %5 | probe 3 |
| B2 döngü yükü + disk emisyon matematiği | ~0.7 | %4 | 7 − 1 − 2 − 6 |
| disk gölgeleme zinciri 1× | 0.45 | %2 | probe 6 |
| tablo tap'leri, kompozit/halo | ~0 | %0 | probe 5, probe 8 |

Okuma:
- **Tablolar bedava.** fetch2'nin 3 tap'i + mix'i gidince kare değişmiyor
  (shader ALU-bağlı; 512² doku önbellekte). Tablo yolunu daha da ucuzlatmaya
  çalışma.
- **Gölgeleme zincirinin 5× tekrarı toplam 2.0 ms (%10)**; kesişim başına bir
  kez hesaplansa en fazla 1.6 ms (%8) — 1080p'de 0.4 ms. Beklenenden küçük,
  ve atmosfer örnekleri farklı yarıçapta (grazing ışında birbirinden 1-3
  birim uzak) — "birebir aynı" değil, görsel A/B şart.
- **MSAA yalnız gemi kenarlarına hizmet ediyor** (lens tam ekran quad, MSAA
  shader aliasing'ine dokunmaz). Maliyet gemi geçişinde DEĞİL, tamponun
  kendisinde: gemi geçişi atlanınca taban değişmiyor (14.6/15.2 vs 16.2/16.3,
  dönüşümlü), MSAA'sız gemi geçişi ölçülemeyecek kadar küçük (p0 42.1 = 42.1).
- **Taban doğruları** (bloom açık, MSAA açık): `1.7 ms + 0.64 ms/Mpix`
  (12.58 → 9.7, 19.66 → 14.6, 28.31 → 19.7). Bloom kapalı: `2.0 + 0.26/Mpix`
  (28.31 → 9.5, 33.23 → 10.8). MSAA ≈ bloom dışı piksel-başı tabanın tamamı.
- **1080p (2.07 Mpix) projeksiyonu:** lens ALU 3.0 · sabit 2.0 · bloom 0.8 ·
  MSAA 0.55 → 6.35 ms (model 6.3 ✓). Sabit 2.0 ms 1080p'de İKİNCİ büyük kalem
  ve muhtemelen CPU (React/R3F/sim/HUD kare işi) — henüz ayrıştırılmadı.

**Kayıtlı taban (M1 Pro, 'yüksek', 8.2 Mpix, bloom açık, zaman dondurulmuş):**

| parça | ms | pay |
|---|---|---|
| toplam | 18.4–18.7 | — |
| kalan (tablolar + gölgeleme matematiği + kompozit + sabit) | 8.3 | %45 |
| bloom (`__bloom.setEnabled(false)`) | 3.2 | %17 |
| atmosfer | 3.0–3.1 | %17 |
| disk gürültüsü | 2.9–3.0 | %16 |
| yıldız + bulutsu | 0.9 | %5 |

Kalemler **bağımsız**: tek tek ölçülen paylar (2.9+3.1+0.9 = 6.9) üçünün birden
kapatılmasıyla (6.9) birebir aynı. İki ayrı oturumda tekrarlandı; mutlak sayılar
~0.3 ms kayıyor ama paylar sabit — bu yüzden **payları raporla, mutlak değeri
değil**.

**Maliyet modeli:** `kare ≈ 2.2 ms + 1.97 ms × Mpix`
(4.86 Mpix 11.8 · 8.20 Mpix 18.4 · 12.43 Mpix 26.7 — üçüne de oturuyor).
→ 1080p (2.07 Mpix) **6.3 ms**, 1440p 9.5 ms, 4K 18.5 ms.

## 7. Hazır koşum

```js
const rr = __bloom.renderer
__lens.time = 123.456
rr.setPixelRatio(2.6)                       // ŞART: tavanın üstü
await new Promise(r => setTimeout(r, 2500))
const olc = async (probe) => {
  __lens.probe = probe
  await new Promise(r => setTimeout(r, 900))          // kademe otursun
  const n = 110, ts = []; let prev = performance.now()
  await new Promise(res => { let i = 0
    const tick = () => { const t = performance.now(); ts.push(t - prev); prev = t
      if (++i < n) requestAnimationFrame(tick); else res() }
    requestAnimationFrame(tick) })
  const s = ts.slice(30).sort((a, b) => a - b)        // ilk 30 kare AT
  return +s[s.length >> 1].toFixed(2)                 // MEDYAN (ortalama değil)
}
for (const p of [0, 1, 2, 3, 4]) console.log(p, await olc(p))
__lens.probe = 0
```

Medyan kullan: rAF zaman damgaları arada 0.4 ms gibi anlamsız değerler üretir
(kare birleşmesi), ortalama bundan bozulur.

## 8. Ayrıca

ANGLE/Metal'in dört ölçüm tuzağı (timer query, finish, clientWaitSync, TBDR
draw tekilleştirme) ve neden uniform'ları GPU'dan geri okumak gerektiği
`gpu-maliyet-olcum-kosumu` hafızasında.
