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

**Kural:** ölçmeden önce yükü tavanın ÜSTÜNE çıkar ve çıktığını DOĞRULA.

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
| `__lens.probe = 1..4` | bütçe kalemlerini tek tek kapatır (aşağıda) |
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
