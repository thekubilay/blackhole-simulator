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

**Tavanı yazılımdan kaldırmak İŞE YARAMAZ (denendi, 2026-09-02):** FrameLoopDriver
eşiği DEV pini ile kaldırıldı; 0.07 Mpix'te kare yine 8.3 ms. Playwright Chromium
rAF'ı 120 Hz ritmine bağlı, gerçek ekranda ise vsync var. Tek yol yükü tavanın
üstüne çıkarmak. Pin geri alındı.

**Sabit ~2 ms'nin ne olduğu (2026-09-02):** taban doğrusunun kesim noktası
(1.7-2.0 ms) ana iş parçacığı DEĞİL: rAF geri çağrılarının toplam CPU süresi
kare başına 0.2 ms (rAF sarmalanarak ölçüldü). Bloom geçiş sayısı da kesim
noktasını değiştirmiyor (bloom açık 1.7, kapalı 2.0). Kalan açıklama: sunum /
kare zamanlama boşluğu (GPU takas sonrası bir sonraki komut gönderimine kadar
boşta). Bu GPU-MEŞGUL değildir, fan hedefi (≤%60 doluluk) için sayılmaması
gerekir — ama GPU zamanlayıcısı güvenilmez olduğundan (bkz. §8) kanıtlanamadı.
Öncelik listesinden düşürüldü.

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

URL pinlerinin tam listesi ve anlamları kodda tek yerde: `src/pins.ts`.

| kanca | ne yapar |
|---|---|
| `__lens.b2 = 0 / 1` | tablo yolu ↔ tam marş, AYNI karede (sayfa yenilemesi gerekmez) |
| `__lens.time = <sayı>` | diski dondurur |
| `__lens.probe = 1..10` | bütçe kalemlerini tek tek kapatır (aşağıda) |
| `?aa=1` (URL) | tuvalin 4× MSAA'sı AÇIK (eski yol; varsayılan kapalı) — bağlam özniteliği, yalnız yüklenişte |
| `?gemiaa=0` (URL) | gemi kırpılmış MSAA hedefi yerine doğrudan tuvale (eski yol); `__bloom.setShipMsaa(0/1)` aynı karede |
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
| 11 | disk/atmosfer gürültüsü pişirilmiş dokudan değil ALU hash'inden (eski yol; noiseBake A/B) |
| 12 | biriken EMİSYON alfası (acc.a) gri harita — beyaz = opak |
| 13 | yalnız gökyüzünün diske sızan payı (1−acc.a)·bg |
| 14 | gökyüzü ÖRTMESİ kapalı (occ = 0, eski davranış) — yıldız sızması A/B'si |

**YILDIZLAR DİSKİN ÜSTÜNDE GÖRÜNÜYORDU (2026-09-02, kullanıcı bildirdi):**
Teşhis probe 12 ile: diskin dokunduğu 891 bin pikselin **%85.5'inde acc.a < 0.1**
(ortalama 0.052, tepe 0.92) — disk gökyüzünü neredeyse hiç örtmüyor, yıldızlar
bandın içinden ~%95 parlaklıkla geçiyor ve "üstüne serpilmiş" duruyordu.

**YANLIŞ İLK DENEME (geri alındı):** `acc.a`'yı yoğunluktan türetip yükseltmek.
Yıldızları kesti ama diskin sönük dış bölgesinde arka planın verdiği dolguyu da
kesti — kadrajın alt yarısı karardı, kullanıcı reddetti. DERS: `acc.a` EMİSYON
transferidir (disk katmanları + lens görüntüleri arası); onu yükseltmek
"örtme"den fazlasını yapar.

**DOĞRU ÇÖZÜM:** örtme, emisyon alfasından AYRI bir kanal (`occ`, sampleDisk ve
sampleAtmo'da birikir) ve yalnız NOKTASAL yıldızları söndürür (`stars(rd,
starVis)`); difüz bulutsu korunur. Örtme geometriden gelir (bant kapsaması +
bulut dokusu), emisyondan değil — sönük dış disk de arkasını gizler.
Ölçüm (aynı kare, probe 0 vs 14, 318 bin disk pikseli):

| | örtmesiz | örtmeli |
|---|---|---|
| disk bandı ortalama parlaklık | 0.3535 | 0.3528 (−%0.2, kararma YOK) |
| kaldırılan yıldız ışığı (ortalama / tepe) | — | 0.00073 / 1.02 |
| yıldızın düştüğü piksel oranı (>%5) | — | %0.89 |

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
  MSAA 0.55 → 6.35 ms (model 6.3 ✓). Sabit 2.0 ms: ana iş parçacığı değil
  (rAF CPU 0.2 ms), büyük olasılıkla sunum/zamanlama boşluğu — bkz. §1.

**MSAA ÇÖZÜMÜ UYGULANDI (2026-09-02, versions/v1.2.1):** tuval `antialias: false`;
katman 0 geometrisi ekran kutusuna kırpılmış 4× MSAA hedefe çizilir
(`src/scene/shipPass.ts`, `setViewOffset` + SRGB8_ALPHA8 + premultiplied kompozit);
toplamalı parçacıklar ayrı katmanda tuvale, öncesinde yalnız-derinlik ön geçişi
(örtme korunur). Ölçüm: taban 19.7 Mpix'te **14.6 → ≤ 8.4 ms** (tavan; MSAA'sız
tuvalla aynı). Gemi uzakken hedef 256×192 @ 18 Mpix, taban farkı ölçülemedi
(8.3-8.5, tavanda). Görsel (`?oyun=temas`, 60 px'lik gemi, farklı anlar):
gemi piksellerinin ortalama rengi eski (196,163,112) → yeni (198,166,113), %1
içinde; silüet kenar adımı eski 120 → yeni 125 (eşit yumuşaklık), AA'sız 174.
Gemi kadrajı doldurunca hedef tuval boyutuna çıkar: eski maliyet, kötüleşme yok.
`?aa=1&gemiaa=0` = tam eski görüntü ve maliyet (A/B için).

**GÜRÜLTÜ DOKUSU UYGULANDI (2026-09-02, versions/v1.2.1):** hash12'nin tam sayı
kafesi GPU'da aynı GLSL ile 2048² RG8 dokuya pişirilir (`src/scene/noiseBake.ts`,
16 bit değer, köken 1024, kullanılan aralık ±632 → sarmalama yok); vnoise
koordinatı `f*f*(3-2f)` ile önceden yumuşatılıp TEK bilineer tap alınır — donanım
dört texeli tam vnoise ağırlıklarıyla karıştırır. Disk 88 hash → 22 tap, atmosfer
4 → 1. Jet ALU'da kaldı (koordinatı uTime ile sınırsız büyür). **Alan birebir**
(aynı karede HDR hedef okuması, probe 0 doku vs 11 ALU, 8.7 M örnek): fark RMS
0.00011 (bağıl %0.05), max 0.0156, 1/255'i aşan %0.001, 4/255'i aşan %0;
taban (0 vs 0) tam 0. **Maliyet** (7.63 Mpix, dönüşümlü): ALU 15.4 → doku
13.3 ms; gürültü kalemi 3.8 → 1.7 (probe 1 = 11.6). −0.275 ms/Mpix, kare −%14.
1080p'de ~0.57 ms (M1), Iris Xe'de ~1.7 ms. `__lens.probe = 11` eski ALU yolu.

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

## 9. Bütçe probe'u — açılışta GPU-meşgul ölçümü (2026-09-02, v1.2.1)

Governor artık iki katlı: **bütçe TAVANI** (açılışta ölçülür) + **FPS güvenlik
ağı** (yalnız aşağı iner, en fazla tavana döner). Ölçüm `src/scene/budgetProbe.ts`:

- Hat aynı karede **k kez** çizilir (BloomPipeline.render repeats), kare tavanın
  üstüne çıkar; iki k noktasının **eğimi** = bir hattın GPU-meşgul süresi. Sunum
  boşluğu (~2 ms, §1) kesim noktasına düşer, bütçeden sayılmaz.
- Uyarlanır k: keşif k=4 (tavandaysa k=12), sonra k1 ≈ 1.6 tavan / tahmin, k2 = 2k1
  (≤ 32). Nokta başına 7 kare, medyan. Toplam ~25 ağır kare, açılış dolly'sinde.
- Her tekrar öncesi lens'in uTime'ı dürtülür (Apple özdeş çizim tekilleştirmesine
  karşı sigorta; bu koşumda tekilleştirme GÖZLENMEDİ: dürtmesiz eğim daha düşük
  çıkmadı).
- Ölçüm karelerinde governor **askıda** (`setSuspended`): yoksa 30-60 ms'lik
  kareler FPS ağını tetikliyor, kademe düşüyor ve ölçüm yeniden boyutlanan
  hedeflerle kirleniyordu (yaşandı: 'iyi'de 4.2 vs beklenen 2.9).
- Ölçüm governor'ın BAŞLANGIÇ kademesinde; diğerleri modelle:
  `meşgul = lensPer × [lensMpix + 0.27·mpix + (bloom ? 0.25·mpix : 0)] + 1 ms`
  (0.27 çıktı tarafı, 0.25 bloom — M1 oranları; +1 ms tuval sunumu). Tavan =
  bütçeye sığan ilk kademe. `?butce=<ms>` (varsayılan 10), 0 = kapalı.

**Ölçüldü (M1 Pro, 1512×747 CSS, dpr 1.6 = 2.89 Mpix):**

| ölçüm kademesi | k1/k2 | medyanlar | meşgul (ms/hat) | 'yüksek' tahmini |
|---|---|---|---|---|
| orta | 11/22 | 27.2 / 51.6 | 2.22 | 5.93 (eski model) |
| orta | 11/22 | 29.0 / 56.1 | 2.46 | 6.47 (eski) → 5.48 (OUT_RATIO ile) |
| yüksek (doğrudan) | 6/12 | 27.6 / 52.9 | 4.22 | 5.22 |

Tavan her koşumda 'yüksek' (≤ 10); kademe 'orta'dan 'yüksek'e ilk saniyede
atlıyor (12 sn'lik FPS tırmanışı yerine). 120 Hz'de bütçe değişmez (bilinçli
akıcılık tercihi, HUD söyler).

**Bütçenin kaynağı — güç politikası yığını (2026-09-02, v1.2.1):** 10 sabit
değil. `sim/PowerPolicy.ts` + `scene/powerSensors.ts`:

| katman | sinyal | etkisi |
|---|---|---|
| cihaz sınıfı | renderer dizgisi (Chrome'da maskesiz) + kaba işaretçi | varsayılan mod: mobil → Sessiz 7 ms, entegre → Dengeli 10, ayrık GPU → Performans 14 |
| kullanıcı | HUD KALİTE › GÜÇ MODU | modu ezer (tek gerçek fan sensörü kullanıcının kulağı) |
| pil | Battery Status API (yalnız Chromium) | pilde bütçe ×0.75 |
| sistem basıncı | Compute Pressure API (Chrome 125+, HTTPS, yalnız `cpu`) | eşik moda bağlı: Sessiz `fair`, Dengeli `serious`, Performans `critical`; durum 20 sn sürmeli, düşüşler arası 30 sn, en çok 2 kademe; 5 dk sakinlikte bir kademe geri |
| pin | `?butce=<ms>` | hepsini ezer, sensör tepkisi kapalı (ölçüm aracı) |

Bütçe değişince yeniden ÖLÇÜM yapılmaz: probe'un tahminleri durur, tavan
yeniden seçilir (`setBudget`/`setExtraDrop`). Tarayıcı fanı, sıcaklığı ve gücü
GÖREMEZ; `"thermals"` kaynağı spesifikasyonda var ama Chrome'da yok. Doğrulama
(M1 Pro, "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)"): sınıf entegre →
Dengeli 10 → tavan yüksek; pil → 7.5; Sessiz → 7 (yüksek 5.28 sığar); Sessiz +
25 sn `fair` → 1 kademe düşüş, HUD 'iyi'; `nominal` sonrası düşüş 5 dk korunur.
DEV kancaları: `__guc` (politika), `__lab.power` (anlık görüntü), `__butce`,
`__lab.sim` (simülasyon; parçalanma/parçacık yolunu tetiklemek için).
Mod kalıcı DEĞİL (projede localStorage deseni yok; her açılışta cihaz sınıfı).

## 10. v1.2.1 incelemesi — yerinde kontrol (2026-09-02 gece)

Kod satır satır, çalışma zamanı ölçümle. Bulgular ve yapılanlar:

| bulgu | kanıt | düzeltme |
|---|---|---|
| Gemi MSAA hedefi her karede yeniden ayrılıyordu | oyunda `rt.setSize` **2.33/sn** (192 → 512 → 160 px salınımı); three `setSize` = dispose + yeniden ayırma | histerezis: anında büyü, alanın yarısının altında 90 kare kalınca küçül → **0.27/sn** |
| Probe ölçüm ortasında `?butce=0`/`setBudget(0)` gelirse governor askıda kalırdı | kod okuması (`setSuspended(true)` yalnız `finish`te kalkıyordu) | `setBudget(0)` askıyı kaldırır |
| Sürükleyerek boyutlandırmada her ara boyutta yeniden ölçüm (25 ağır kare) | kod okuması: `done` dalı her karede %20 sapmada `restart` | sapma 60 ardışık kare sürmeli |
| Lens dürtme kapanışı yeniden bağlanan materyalde bayat uniform'a yazardı (StrictMode/HMR) | kod okuması | kapanış `material.current`'ı çağrı anında okur |
| `setCeiling` cezalı kademeye yukarı sıçrıyordu (FPS ağı ile salınım riski) | kod okuması | yukarı taşıma yalnız `cool[i] <= 0` ise |
| `LabController.attachPower` iki aşamalı kurulum (governor kurucudan enjekte, power sonradan) | DIP tutarsızlığı | kurucu parametresi |
| ShipPass her karede Points'lerin katmanını DEĞİŞTİRİYORDU (render geçişi sahne grafiğini mutasyona uğratıyor, SRP) | kod okuması | katmanın sahibi `Simulation.particleLayer` (App kurar); ShipPass yalnız okur, yanlış katmanda Points görürse DEV'de bir kez uyarır |

**Bellek (sızıntı yok):** laboratuvar 30 sn — doku 9, geometri 2, program 5 sabit,
heap 53-56 MB testere (GC). Oyun 15 sn — doku 11 sabit, geometri 8 → 9/10 ve
program 7 → 8 TEK SEFERLİK (oyun nesneleri/ilk malzeme derlemesi), heap düz.
RT `setSize` three'de `dispose()` çağırır: GPU kaynağı serbest kalır (kaynak
`RenderTarget.setSize`). Sensör dinleyicileri ve `PressureObserver` PostFx
effect'inin cleanup'ında kaldırılıyor.

**Kalan varsayımlar (bilinçli):** probe açılış dolly'sinin başında ölçer (uzak
kadraj); model oranları (0.25 bloom, 0.27 çıktı) M1'den; `?kalite=` pinliyken
probe yine ~25 ağır kare koşar (ölçüm oturumları 15 sn bekliyor, `?butce=0`
kapatır); kamera arkasına düşen köşe → tam ekran hedef (eski maliyet, tek kare).
Parçacık (kıvılcım) yolu varsayılan delikte (Sgr A*, breakR = 0) hiç
tetiklenmez; oyunda pod simülasyon adımına girmez (GameController yönetir).
**Sınandı** laboratuvarda: `__lab.sim.spawn('pod', v, 'fall')` + `obj.dissolving
= true` → Points katman maskesi 4, görünür, toplamalı; kare başına 13 render
çağrısı ve sıra: lens · bloom ×7 · kompozit · **derinlik ön geçişi (override)** ·
gemi hedefi · gemi quad'ı · **parçacıklar (katman 4)**. Pod ölüp sahneden
çıkınca gemi hedefi atlanır (11), akış da temizlenince 9. GL hatası 0, DEV
uyarısı yok.

**İkinci tur (kullanıcı "kapatman gerekenleri kapat"):**
- URL pinleri tek yerde: `src/pins.ts` `readPins(search)` → tipli `Pins`
  nesnesi, her pin belgesiyle. App.tsx yalnız kurar (OCP). `?oyun=` GameController'da.
- Governor pinliyken (`?kalite=`, elle seçim) probe koşmaz: tavan zaten yok
  sayılıyordu, ~25 ağır kare ve ölçüm oturumunun ilk saniyesi boşa gidiyordu.
  Otomatiğe dönülünce settle'dan başlar; pin ölçüm ortasında gelirse askı kalkar.
- Güç modu kalıcı: yalnız ELLE seçim `localStorage` (`kdl.gucModu`) — otomatik
  seçim saklanmaz, `?butce=` ezer, depolama engelliyse sessiz. Kalite/fps
  bilerek kalıcı değil (deneme ayarları); güç modu cihazın fanına verilen cevap.
- BIRAKILAN: model oranları (0.25/0.27) ve dolly başındaki ölçüm noktası —
  gerçek cihaz ölçümüyle kapanır, kodla değil; FPS ağı sapmayı örter.

Kod yavaşlatan bir kalıp bulunmadı: kare başına ek iş `traverseVisible`
(onlarca nesne), 8 köşe projeksiyonu/mesh, `PowerPolicy.tick` (birkaç
karşılaştırma), `probe.frame` (aritmetik).

## 8. Ayrıca

ANGLE/Metal'in dört ölçüm tuzağı (timer query, finish, clientWaitSync, TBDR
draw tekilleştirme) ve neden uniform'ları GPU'dan geri okumak gerektiği
`gpu-maliyet-olcum-kosumu` hafızasında.
