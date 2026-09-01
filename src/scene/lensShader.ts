import * as THREE from 'three'
import { DISPLAY_TRANSFORM_GLSL } from './displayTransform'
import { NEBULA_SAMPLE_GLSL } from './nebulaBake'

export const LENS_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`

export const LENS_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime, uEsc;
uniform int uSteps;
uniform vec3 uCamPos;
uniform mat4 uCamMat, uProjInv;
// disk iç kenarı = aktif deliğin ISCO'su; uEff = ışıma verimi η = 1 − E_ISCO
// uRealism 0 = SANATSAL: Interstellar'ın tercihi (James+ 2015, Fig 15a+flare) —
// kaymasız simetrik altın disk, jet ve ışıma değişkenliği YOK (Gargantua jetsiz
// ve durağandı). 1 = GERÇEKÇİ: g⁴ hüzmeleme, kara cisim rengi, jet + gözlenmiş
// değişkenlik. Lensleme (jeodezikler, ISCO, gölge) iki modda da aynıdır.
uniform float uDiskIn, uEff, uRealism;
// ---- deliğe özgü GÖZLENMİŞ karakter (bkz. presets.ts / HoleVisual) --------
// uDiskThick: yarı kalınlık çarpanı (1 = ince Shakura–Sunyaev, >2 = şişkin RIAF)
// uDiskGlow : Eddington oranıyla ölçekli genel parlaklık
// uDiskVar  : (genlik, çevrim/sn) — limit-cycle / flare değişkenliği
// uDiskPatch: (genlik, tur/sn) — dönen sıcak nokta lekeliliği
uniform float uDiskThick, uDiskGlow;
uniform vec2 uDiskVar, uDiskPatch;
// uNebColor/uNebPar: arka plan bulutsusunun rengi ve (yoğunluk, yıldız çarpanı)
uniform vec3 uNebColor;
uniform vec2 uNebPar;
${NEBULA_SAMPLE_GLSL}
// uJetA = (güç, β, taban yarıçapı, alevlenme)
// uJetB = (taban yüksekliği, uzunluk, precession tanα, precession rad/sn)
// uJetC = (sarmal dalga sayısı, düğüm dalga sayısı, düğüm hızı, kenar keskinliği)
uniform vec4 uJetA, uJetB, uJetC;
uniform vec3 uJetColor;
#define R_OUT 13.5
#define TAU 6.28318530718
mat2 rot(float a){
  // KRİTİK: açıyı 2π'ye sar — float32 sin/cos büyük argümanda hassasiyet
  // kaybeder (özellikle Metal/ANGLE); sarılmazsa disk dokusu dakikalar
  // içinde piksel-tutarsızlığından "sahte blur"a çözülür
  a = mod(a, TAU);
  float c=cos(a),s=sin(a);return mat2(c,-s,s,c);
}
float hash12(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
/**
 * (p, v) durumundan SONSUZA kalan ışın bükülmesinin kapalı formu.
 *
 * Işın denkleminin KENDİ dik ivmesi a⊥ = (3/2)h²b/r⁵ integre edilir (Newton
 * benzeri 1/r³ yasası DEĞİL — bu denklemde bükülme periyapsis çevresinde çok
 * daha keskin yoğunlaşır; 1/r³ ile kurulan formül b=17'de %10 şaşırıyordu):
 *   ∫a⊥ ds = (1/2b)·[ s(2s²+3b²)/r³ ]  ⇒  d = (2 − G)/(2b),  G = s₀(2s₀²+3b²)/r³
 * s₀→−∞'da d→2/b (tam 4M/b sapması), s₀=0'da yarısı, s₀→+∞'da sıfır.
 * (1 + 1.6/b) çarpanı ikinci mertebeyi (düz yol yaklaşıklığının ıskaladığı,
 * ışının b'den daha içeriden geçmesi) telafi eder: b = 17…25 aralığında kalan
 * hata ≤ 0,03°'dir (ince adımlı sayısal entegrasyona karşı ölçüldü).
 *
 * İKİ yerde kullanılır ve KEYFÎ DEĞİL, ZORUNLUDUR: dış bölge ışınları düz
 * kabul edilip hiç bükülmeyince (h² > 289 dalı) ve yürüyüş erken bitince
 * (r² > 240 / uEsc çıkışları) gökyüzü örnekleme yönü eşikte SIÇRIYOR; b = 17'de
 * sıçrama 7,15°'dir ve bulutsuda deliği merkez alan keskin bir ÇEMBER olarak
 * görünür. Kalan sapmayı analitik eklemek iki dalı eşikte örtüştürür: ölçülen
 * dikiş 7,15° → 0,06°, yani bulutsunun en ince yapısının çok altında.
 */
vec3 weakBend(vec3 p, vec3 v){
  float r0 = length(p);
  float s0 = dot(p, v);
  float b = sqrt(max(r0*r0 - s0*s0, 1e-8));
  if(b < 1e-3 || r0 < 1e-3) return v;         // radyal ışın: sapma yok
  float G = s0*(2.0*s0*s0 + 3.0*b*b)/(r0*r0*r0);
  float d = clamp(((2.0 - G)/(2.0*b))*(1.0 + 1.6/b), 0.0, 0.35);
  vec3 n = (p - s0*v)/b;                      // merkezden ışına birim vektör
  return normalize(v - n*d);
}
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  float a=hash12(i),b=hash12(i+vec2(1,0)),c=hash12(i+vec2(0,1)),d=hash12(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return v; }
// yüksek frekanslı katmanlar için 3 oktav yeterli: 4-5. oktavlar ekran örnekleme
// sınırının (Nyquist) altında kalır, yalnız parıldama üretir. 1.107 = amplitüd
// normalizasyonu (5 oktavlık toplam genlikle eşleşir, doku kontrastı korunur)
float fbm3(vec2 p){ float v=0.,a=.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return v*1.107; }
/**
 * Yön → küp yüzü koordinatı. xy = yüz üstü konum (−1..1), z = yüz kimliği;
 * aMax = |en büyük bileşen| (hücre katı açısı ∝ aMax³).
 * Küresel (azimut, yükseklik) ızgarasının yerine geçer: orada hücreler kutba
 * yaklaştıkça 1/cos(yükseklik) ile daralıp yıldız yoğunluğunu SONSUZA
 * götürüyordu — ekranda dönme ekseni yönünde parlak bir leke ("ışık kaçışı")
 * ve ona yelpazelenen çizgiler oluşuyordu. Küp yüzünde hücreler her yerde
 * benzer büyüklüktedir ve yüz kenarları tam hücre sınırına oturur (sc tam
 * sayı), dolayısıyla hiçbir yıldız yüz dikişinde ikiye bölünmez.
 */
vec3 cubeUV(vec3 d, out float aMax){
  vec3 ad = abs(d);
  if(ad.x >= ad.y && ad.x >= ad.z){ aMax = max(ad.x, 1e-6); return vec3(d.zy/aMax, d.x > 0. ? 0. : 1.); }
  if(ad.y >= ad.z){                 aMax = max(ad.y, 1e-6); return vec3(d.xz/aMax, d.y > 0. ? 2. : 3.); }
  aMax = max(ad.z, 1e-6);           return vec3(d.xy/aMax, d.z > 0. ? 4. : 5.);
}
vec3 stars(vec3 rd){
  vec3 col=vec3(0.);
  // iki ölçekli bulutsu: ince pus + büyük kabuk/filaman yapısı. Alan yalnız
  // YÖNÜN fonksiyonu ve zamandan bağımsızdır ⇒ açılışta bir kez küp haritasına
  // pişirilir (nebulaBake.ts); burada tek doku okuması kalır. Renk ve yoğunluk
  // deliğin gerçek çevresinden gelir — M87'nin sarımsı eliptik hâlesi,
  // Sgr A*'ın kızıl galaktik-merkez tozu, SS 433'ün W50 kabuğu — ve çalışma
  // zamanında çarpılır, dolayısıyla delik değişince yeniden pişirme gerekmez.
  col += uNebColor*uNebPar.x*nebulaAt(rd);
  float aMax;
  vec3 fc = cubeUV(rd, aMax);
  // yıldız yoğunluğu alana göre: galaktik merkez tıka basa, kuasar önalanı seyrek.
  // aMax³ = hücre katı açısı: olasılığı bununla ölçeklemek sterradyan başına
  // yıldız sayısını SABİTLER (eski ekvator yoğunluğuyla birebir aynı değer)
  float thr = 1.0 - 0.085*clamp(uNebPar.y, 0.15, 3.0)*aMax*aMax*aMax;
  for(float i=0.;i<2.;i++){
    float sc = 70.+i*110.;
    vec2 uv = fc.xy*sc;
    // yüz kimliği hash'e karışır: altı yüz bağımsız yıldız alanı üretir
    vec2 id = floor(uv) + vec2(fc.z*61.7 + i*137.3);
    vec2 gv = fract(uv)-.5;
    float h = hash12(id);
    if(h>thr){
      vec2 off = vec2(hash12(id+3.7),hash12(id+9.3))-.5;
      float d = length(gv-off*.7);
      float s = smoothstep(.14,.0,d)*(h-thr)/(1.0-thr);
      float tw = .75+.25*sin(mod(uTime*(1.+h*2.)+h*40., TAU));
      col += vec3(1.,.96,.9)*s*s*1.4*tw;
    }
  }
  return col;
}
vec3 diskRamp(float rr){
  float t = clamp((rr-uDiskIn)/(R_OUT-uDiskIn),0.,1.);
  // referans görüntü paleti: akkor beyaz-altın çekirdek → altın → tozlu turuncu
  vec3 hot=vec3(1.25,1.08,.92), mid=vec3(1.05,.52,.15), cool=vec3(.32,.08,.025);
  return mix(hot, mix(mid,cool,smoothstep(.12,.8,t)), smoothstep(0.,.22,t));
}
// kara cisim yaklaşığı: x = göreli sıcaklık (kayma dahil) → kızıl → beyaz → mavi-beyaz
vec3 bbRamp(float x){
  vec3 cold = vec3(1.0,.22,.04), mid = vec3(1.0,.88,.72), hot = vec3(.62,.76,1.35);
  return x < 1.0 ? mix(cold, mid, smoothstep(.12,1.,x)) : mix(mid, hot, smoothstep(1.,1.9,x));
}
// ince disk kalınlık profili: dışa doğru alevlenir (Shakura–Sunyaev H ∝ r^(9/8)
// biçimini izler); uDiskThick gözlenmiş akış tipini taşır — ışıma yapamayan
// kalın akış (M87*, Sgr A*) şişer, Eddington'a yakın beslenen disk (3C 273) incelir
float diskH(float rr){ return (0.05 + 0.052*rr) * uDiskThick; }
// Parlaklık değişkenliği. GRS 1915'in limit-cycle'ı: iç diskte madde yavaşça
// birikir, ışıma basıncı eşiği aşınca iç bölge ani boşalır (dar patlama), sonra
// yeniden dolar. Faz yarıçapla gecikir ⇒ dalga içe doğru yürür.
// Değişkenlik gözlenmiş fiziktir ⇒ yalnız gerçekçi modda: uRealism çarpanı
// sanatsalda diski Interstellar gibi durağan bırakır, geçişte yumuşak soldurur.
float diskFlicker(float rr){
  float amp = uDiskVar.x * uRealism;
  if(amp <= 0.001) return 1.0;
  float ph = fract(uTime*uDiskVar.y - rr*0.055);
  float burst = exp(-pow((ph-0.72)/0.075, 2.0));
  return max(1.0 + amp*(1.55*burst + 0.35*ph - 0.42), 0.05);
}
// Azimut lekeliliği: dönen sıcak noktalar. Sgr A*'ın EHT görüntüsündeki
// "düzensiz parlak lekeler" — gaz ufkun çevresini dakikalar içinde dolandığı
// için görüntü çekim sürerken değişir; burada da leke deseni sürekli döner.
float diskPatchF(vec2 xz, float rr, float n){
  float amp = uDiskPatch.x * uRealism;   // sıcak noktalar da yalnız gerçekçide
  if(amp <= 0.001) return 1.0;
  float ang = atan(xz.y, xz.x);
  float w = uTime*uDiskPatch.y*TAU;
  float p = 0.5+0.5*sin(mod(2.0*ang - w + rr*1.15 + n*4.0, TAU));
  float q = 0.5+0.5*sin(mod(3.0*ang - w*1.7 - rr*0.8, TAU));
  return max(1.0 + amp*(1.35*p*q - 0.45), 0.05);
}
// hp: örnek noktası (y ≠ 0 olabilir — hacim örneği), H: yerel yarı kalınlık,
// dsl: bu örneğin temsil ettiği ışın yolu uzunluğu (hacim entegrasyon ağırlığı)
void sampleDisk(vec3 hp, vec3 vn, float H, float dsl, inout vec4 acc){
  float rr = length(hp.xz);
  // dikey Gauss zarfı: gaz düzlemden uzaklaştıkça pamuksu söner
  float gz = exp(-(hp.y*hp.y)/(H*H));
  // kalınlık boyunca iç yapı: yükseklik doku aramasını yatay kaydırır (ucuz
  // sözde-3B) — üst/alt katmanlar farklı bulut deseni görür, paralaks doğar
  vec2 hxz = hp.xz + vec2(hp.y*1.6, -hp.y*1.2);
  // iki RİJİT dönen gürültü katmanı (iç hızlı, dış yavaş), yarıçapla harmanlı:
  // zaman bağımlı her açı yarıçaptan bağımsız — kayma ASLA birikmez,
  // bulut dokusu t=0 ile t=1s'te istatistiksel olarak aynıdır
  float spiral = 2.6*log(rr);
  // iç/dış gürültü katmanı yalnız harman ağırlığı gerektirdiğinde örneklenir:
  // blend bandının (3.2–8.5) dışında maliyet yarıya iner, sonuç birebir aynı
  float w = smoothstep(3.2, 8.5, rr);
  float n = 0.;
  if(w < 0.999){
    vec2 qA = rot(uTime*0.045 + spiral) * hxz;
    n = 0.50*fbm(qA*1.35) + 0.32*fbm3(qA*3.6) + 0.18*fbm3(qA*7.4);
  }
  if(w > 0.001){
    vec2 qB = rot(uTime*0.012 + spiral + 1.7) * hxz;
    float nB = 0.50*fbm(qB*1.35 + 31.7) + 0.32*fbm3(qB*3.6 + 11.3) + 0.18*fbm3(qB*7.4 + 5.9);
    n = (w < 0.999) ? mix(n, nB, w) : nB;
  }
  float streak = 0.5 + 0.5*sin(rr*6.5 + n*8.0);
  // ince taneli filaman bantları (yalnız ALU — ek gürültü örneklemesi yok):
  // referans görüntüdeki tozlu, çizgili disk dokusunu verir
  float fil = 0.5 + 0.5*sin(rr*23.0 - n*12.0 + spiral*2.0);
  float fade = smoothstep(uDiskIn, uDiskIn+0.5, rr) * pow(smoothstep(R_OUT, R_OUT-6.5, rr), 2.3);
  float E = fade * (0.07 + 1.6*pow(n,1.7)) * (0.45+0.55*streak) * (0.62+0.38*fil) * pow(uDiskIn/rr, 3.1) * 10.5;
  // Novikov–Thorne: yüksek spin → yüksek verim → daha parlak, daha beyaz iç disk
  E *= (0.85 + 2.2*uEff);
  // gözlenmiş karakter: Eddington oranı, limit-cycle, sıcak nokta lekeleri
  E *= uDiskGlow * diskFlicker(rr) * diskPatchF(hp.xz, rr, n);
  vec3 td = normalize(vec3(-hp.z, 0., hp.x));
  // yerel statik gözlemcinin ölçtüğü dairesel yörünge hızı — Newton'un
  // √(M/r)'si DEĞİL: v = √(M/r)/√(1−rs/r); ISCO'da (3 rs) tam c/2.
  // 0.62 tavanı ancak yüksek spinde ISCO 2.30 rs'in altına inince devreye
  // girer (shader metriği Schwarzschild, uDiskIn ise Kerr ISCO'su).
  float rb = max(rr, 1.4);
  float beta = clamp(sqrt(0.5/rb)/sqrt(1.-1./rb), 0., 0.62);
  float gamma = 1./sqrt(1.-beta*beta);
  float dop = 1./(gamma*(1.+beta*dot(td,vn)));
  float gfac = sqrt(max(1.-1./rr, 0.03));   // kütleçekimsel kayma √(1−rs/r)
  float shift = dop * gfac;                 // toplam g = ν_gözlenen/ν_yayılan
  // Sanatsal = Interstellar'ın gerçek tercihi (filmdeki disk = Fig 15a: renk
  // VE parlaklık kayması yok; Nolan asimetriyi seyirci için tamamen çıkarttı):
  // boost 1, disk simetrik altın halka kalır. Gerçekçi: bolometrik I ∝ g⁴ —
  // yaklaşan taraf kat kat parlak, iç kenar kütleçekimsel kaymayla SÖNÜK;
  // gerçekçi pozlama düşük tutulur: yoksa her iki yan da ton eşlemede beyaza
  // kırpılır ve g⁴'ün ~20× asimetrisi görünmez olur (Luminet 1979 kontrastı)
  // 2.35/uDiskIn: pozlama deliğe normalize (uç spinde ISCO'ya bağlı emisyon
  // profili tüm kareyi karartmasın) — fizik değil, kamera pozlaması
  float boostR = 0.16 * (2.35/uDiskIn) * pow(shift, 4.0);
  E *= mix(1.0, boostR, uRealism);
  // Sanatsal renk: altın palet, Doppler tonu YOK (kaymalar gerçekçiye taşındı);
  // verim beyazlığı kalır — spin farkı sanatsalda da okunabilsin
  vec3 cA = diskRamp(rr);
  cA = mix(cA, vec3(1.08,1.02,.95), clamp(uEff*1.6*pow(uDiskIn/rr, 2.0), 0., .5));
  // Gerçekçi renk: Shakura–Sunyaev T ∝ r^(−3/4), gözlenen sıcaklık g ile kayar —
  // disk mavi-beyaz, yaklaşan taraf maviye, uzaklaşan/iç bölge kızıla
  // Novikov–Thorne ince disk: T ∝ [r⁻³·(1−√(r_in/r))]^(1/4). İç kenarda tork
  // sıfırdır ⇒ T(r_in)=0; sıcaklık tepesi r=(49/36)·r_in ≈ 1.36·r_in'de.
  // 2.77 çarpanı bu tepeyi eski saf r^(−3/4) profilinin tepesine oturtur:
  // renk kalibrasyonu korunur, yalnız iç kenar sönükleşir.
  float xIn = uDiskIn/max(rr, uDiskIn);
  float tRel = 2.77 * pow(xIn, 0.75) * pow(max(1.-sqrt(xIn), 0.), 0.25) * shift;
  vec3 c = mix(cA, bbRamp(tRel), uRealism);
  // hacim ağırlığı: Gauss yoğunluk × (yol/kalınlık); 0.5 = dik geçişin
  // toplamı eski tek-örnek pozlamayla eşleşir (Σwv ≈ 1)
  float wv = gz * (dsl/H) * 0.5;
  float aRaw = clamp(E*.55, 0., .95);
  // Beer–Lambert benzeri birikim: alfa wv ile üstel doygunlaşır — düzlemi
  // sıyıran ışında örnekler üst üste PATLAMAZ, opaklaşıp erken sonlanır
  float aStep = 1. - pow(1. - aRaw, wv);
  acc.rgb += (1.-acc.a)*c*E*wv;
  acc.a  += (1.-acc.a)*aStep*.7;
}
// ucuz hacimsel "atmosfer": diskin üstünde/altında pamuksu gaz halesi.
// Pahalı disk dokusu YOK (yalnız 2 vnoise oktavı) — keskin detay düzlem
// kesişimindeki sampleDisk'te kalır; bu katman dikey dolgunluğu, tüylü
// silueti ve iç kenardaki bulut simidini verir. Sıyıran ışında bile maliyet
// segment başına 1 örnektir — doku ortalamaya girip lapalaşmaz
void sampleAtmo(vec3 hp, vec3 vn, float H, float ds, inout vec4 acc){
  float rr = length(hp.xz);
  if(rr < uDiskIn || rr > R_OUT) return;
  float gz = exp(-(hp.y*hp.y)/(H*H));
  float spiral = 2.6*log(rr);
  vec2 q = rot(uTime*0.045 + spiral) * (hp.xz + vec2(hp.y*1.6, -hp.y*1.2));
  // tek oktav yeter: haze düşük frekanslıdır, kontrastı lump² verir
  float lump = vnoise(q*1.4);
  float fade = smoothstep(uDiskIn, uDiskIn+0.5, rr) * pow(smoothstep(R_OUT, R_OUT-6.5, rr), 2.3);
  float D = fade * (0.25 + 0.75*lump*lump) * pow(uDiskIn/rr, 2.6);
  vec3 td = normalize(vec3(-hp.z, 0., hp.x));
  // yerel statik gözlemcinin ölçtüğü dairesel yörünge hızı — Newton'un
  // √(M/r)'si DEĞİL: v = √(M/r)/√(1−rs/r); ISCO'da (3 rs) tam c/2.
  // 0.62 tavanı ancak yüksek spinde ISCO 2.30 rs'in altına inince devreye
  // girer (shader metriği Schwarzschild, uDiskIn ise Kerr ISCO'su).
  float rb = max(rr, 1.4);
  float beta = clamp(sqrt(0.5/rb)/sqrt(1.-1./rb), 0., 0.62);
  float gamma = 1./sqrt(1.-beta*beta);
  float dop = 1./(gamma*(1.+beta*dot(td,vn)));
  float gfac = sqrt(max(1.-1./rr, 0.03));
  // sanatsal kaymasız (bkz. sampleDisk), gerçekçi g⁴
  float boost = mix(1.0, 0.16*(2.35/uDiskIn)*pow(dop*gfac,4.0), uRealism);
  // aynı Novikov–Thorne sıcaklık profili (bkz. sampleDisk)
  float xIn = uDiskIn/max(rr, uDiskIn);
  float tRel = 2.77 * pow(xIn, 0.75) * pow(max(1.-sqrt(xIn), 0.), 0.25) * dop * gfac;
  vec3 c = mix(diskRamp(rr), bbRamp(tRel), uRealism);
  float E = D * gz * (ds/H) * 0.5 * boost * (0.85 + 2.2*uEff);
  E *= uDiskGlow * diskFlicker(rr) * diskPatchF(hp.xz, rr, lump);
  acc.rgb += (1.-acc.a)*c*E;
  acc.a  += (1.-acc.a)*clamp(E*.4,0.,.9)*.7;
}
// ---------------------------------------------------------------------------
// JET — dönme ekseni (±y) boyunca kollime plazma huzmesi.
// Precession varsa eksen bir koni çizer; madde balistik gittiği için verilen
// yükseklikteki faz geride kalır (h·uJetC.x) ⇒ gökyüzünde düz çizgi değil
// SARMAL görünür. SS 433'ün imzası budur (koni 19,85°, periyot 162,4 gün).
// ---------------------------------------------------------------------------
vec2 jetAxis(float h, float sgn){
  if(uJetB.z <= 0.0001) return vec2(0.);
  float ph = mod(uTime*uJetB.w - h*uJetC.x, TAU);
  return sgn * uJetB.z * h * vec2(cos(ph), sin(ph));
}
void sampleJet(vec3 hp, vec3 vv, float dt, inout vec4 acc){
  float h = abs(hp.y);
  if(h < uJetB.x || h > uJetB.y) return;
  float sgn = hp.y < 0. ? -1. : 1.;
  vec2 ax = jetAxis(h, sgn);
  float rad = uJetA.z + uJetA.w*(h - uJetB.x);
  vec2 d = hp.xz - ax;
  float q = dot(d,d)/(rad*rad);
  if(q > 7.0) return;                       // koninin dışı: maliyet sıfır
  // içi boş koni kabuğu: jetin kenarı ortasından parlak görünür (limb
  // brightening — M87*'nin jetinde doğrudan gözlendi). uJetC.w kolimasyonu.
  float rq = sqrt(q);
  float core = exp(-q*uJetC.w) * (0.55 + 0.75*exp(-pow((rq-0.95)*2.2, 2.0)));
  // sinkrotron düğümleri: jet boyunca ilerleyen parlak topaklar
  // (M87'nin HST-1'i, 3C 273'ün A/B düğümleri, GRS 1915'in fırlattığı bulutlar)
  float kn = 0.5 + 0.5*sin(mod(h*uJetC.y - uTime*uJetC.z*TAU, TAU));
  float turb = 0.55 + 0.45*vnoise(vec2(h*1.7, atan(d.y, d.x)*1.9) + uTime*0.02);
  // genişleyen akışta yüzey parlaklığı düşer; uçta yumuşak sönüm
  float prof = pow(uJetB.x/max(h, uJetB.x), 0.9) * smoothstep(uJetB.y, uJetB.y*0.55, h);
  float sp = max(length(vv), 1e-5);
  vec3 vn = vv/sp;
  // relativistik hüzmeleme: ĵ = kaynaktan dışa birim vektör; geriye ışın
  // izlediğimiz için gözlemciye giden foton yönü −vn'dir
  vec3 jd = normalize(vec3(ax.x, sgn*max(h,1e-3), ax.y));
  float b = clamp(uJetA.y, 0., 0.9995);
  float g = 1./sqrt(1.-b*b);
  float dop = 1./(g*(1. - b*dot(jd, -vn)));
  // sürekli jet: I ∝ δ^(2+α), α ≈ 0.7 (Blandford & Königl 1979) — bu üs
  // tek başına M87*/3C 273'te karşı jetin neden görünmediğini açıklar.
  // δ·γ ile normalize: DİK bakışta (δ = 1/γ) çarpan tam 1 olur, yani taban
  // pozlaması kamera açısından bağımsızdır; yaklaşan/uzaklaşan kol arasındaki
  // δ^2.7 oranı olduğu gibi korunur. Fizik değil, kamera pozlamasıdır —
  // normalizasyonsuz jet ekvatordan bakıldığında 150 kat sönük, yani görünmez.
  // uRealism: jet YALNIZ gerçekçi modda (Gargantua jetsizdi — yığılmayan disk);
  // çarpan mod geçişinde jeti yumuşakça soldurur/belirtir
  float E = uJetA.x * uRealism * core * kn * turb * prof * pow(dop*g, 2.7) * (dt*sp) * 0.45;
  E = min(E, 4.0);
  acc.rgb += (1.-acc.a)*uJetColor*E;
  acc.a  += (1.-acc.a)*clamp(E*0.30, 0., 0.55);
}
${DISPLAY_TRANSFORM_GLSL}
// Çıkış: uToneMap 0 = DOĞRUSAL HDR (bloom hattı devrede; ton eşleme birleştirme
// geçişinde, bloom eklendikten SONRA yapılır — parlak disk çevresine ışık
// taşıyabilsin diye >1 değerler burada kırpılmamalıdır). 1 = yedek yol:
// HDR hedefi olmayan cihazda shader kendi ekran transformunu uygular.
uniform float uToneMap;
vec3 outColor(vec3 col, vec2 ndc){ return uToneMap > 0.5 ? finish(col, ndc) : col; }

// ── BRUNETON TABLOLARI (arXiv:2010.08735) ──────────────────────────────
// Piksel başına jeodezik marş yerine iki sabit zamanlı doku araması.
// Tablolar lensTables.ts'te pişirilir — doğrulama sayıları ve pişirme
// yöntemi oradaki yorumlarda. Burada yalnız arama + düzlem geometrisi var.
// Referans uygulama BSD-3-Clause, Copyright (c) 2020 Eric Bruneton.
uniform sampler2D uDeflTex, uInvRTex;
uniform float uTables;             // 0 = yalnız eski marş (?tablo=0 ile A/B)
uniform float uB2;                 // 1 = disk de tablodan (?b2=1); 0 = disk marşta
#define KMU 0.148148148148         // 4/27 — kritik e²; b_krit = 3√3/2
#define PI_ 3.14159265358979

/** u̇ = 0 noktası; e² = KMU'da foton küresine (u = 2/3) oturur */
float uApsisT(float e2){
  float x = clamp((2.0/KMU)*e2 - 1.0, -1.0, 1.0);
  return 1.0/3.0 + (2.0/3.0)*sin(asin(x)/3.0);
}
float deflTexU(float e2){
  return e2 < KMU ? 0.5 - sqrt(-log(max(1.0 - e2/KMU, 1e-20))*0.02)
                  : 0.5 + sqrt(-log(max(1.0 - KMU/e2, 1e-20))*0.02);
}
float deflTexV(float e2, float u){
  if(e2 > KMU){
    float x = u < 2.0/3.0 ? -sqrt(2.0/3.0 - u) : sqrt(u - 2.0/3.0);
    return (sqrt(2.0/3.0) + x)/(sqrt(2.0/3.0) + sqrt(1.0/3.0));
  }
  return 1.0 - sqrt(max(1.0 - u/uApsisT(e2), 0.0));
}
float texco(float x, float n){ return 0.5/n + x*(1.0 - 1.0/n); }

// RG32F WebGL2 çekirdeğinde SÜZÜLEBİLİR DEĞİL (OES_texture_float_linear ister)
// ve bu shader GLSL ES 1.00 olduğu için texelFetch de yok. Bilinear elle
// yapılır: dokular NEAREST bağlanır, dört komşunun TEKSEL MERKEZİ örneklenir.
// Aritmetik, doğrulama koşumundaki sample2() ile birebir aynıdır.
vec2 fetch2(sampler2D t, vec2 sz, vec2 tc){
  vec2 f = tc*sz - 0.5;
  vec2 i = floor(f), w = f - i;
  vec2 c0 = (clamp(i,       vec2(0.), sz - 1.0) + 0.5)/sz;
  vec2 c1 = (clamp(i + 1.0, vec2(0.), sz - 1.0) + 0.5)/sz;
  vec2 s0 = mix(texture2D(t, vec2(c0.x, c0.y)).rg, texture2D(t, vec2(c1.x, c0.y)).rg, w.x);
  vec2 s1 = mix(texture2D(t, vec2(c0.x, c1.y)).rg, texture2D(t, vec2(c1.x, c1.y)).rg, w.x);
  return mix(s0, s1, w.y);
}

/**
 * Ham tablo okuması. raw = sonsuzdan u'ya BİRİKMİŞ sapma (içe giden bacak),
 * apsis = son satır: e² < KMU ise apsisteki sapma, değilse UFUKTAKİ sapma.
 * Yakalama kararını ve hangi bacakta olduğumuzu çağıran yorumlar.
 */
void tableRaw(float u, float e2, out float raw, out float apsis){
  float tx = texco(deflTexU(e2), 512.0);
  apsis = fetch2(uDeflTex, vec2(512.0), vec2(tx, texco(1.0, 512.0))).x;
  raw = fetch2(uDeflTex, vec2(512.0), vec2(tx, texco(deflTexV(e2, u), 512.0))).x;
}
float phiUbT(float e2){ return (1.0 + e2)/(1.0/3.0 + 2.0*e2*sqrt(e2)); }
/** Işının φ açısındaki ters yarıçapı — disk düzlemi kesişimini sabit zamanda verir */
float tableInvRad(float e2, float phi){
  return fetch2(uInvRTex, vec2(64.0, 32.0),
                vec2(texco(1.0/(1.0 + 6.0*e2), 64.0),
                     texco(clamp(phi/phiUbT(e2), 0.0, 1.0), 32.0))).x;
}

/** TraceRay'in sapma kısmı. Dönüş < 0 ise ışın ufka düşer. */
float tableDefl(float u, float ud, float e2, out float apsisDefl){
  float raw;
  tableRaw(u, e2, raw, apsisDefl);
  if(e2 < KMU && u > 2.0/3.0) return -1.0;
  float d = raw;
  // DÖNÜŞ DEĞERİ "KALAN" SAPMADIR (kameradan sonsuza) — kaçış yönü δ' = δ + Δ_kalan
  // tam bunu ister. Tablo, Δ'yı İÇE GİDEN dal boyunca biriktirir (u = 0'dan u'ya;
  // bkz. lensTables.ts pişirme döngüsü, u̇ = +e'den başlar). Uzlaşım: ud = −u/tanδ,
  // yani ud > 0 = içe giden ışın (minR satırıyla aynı uzlaşım).
  //   • içe giden (ud > 0): önündeki yol apsise inip sonsuza çıkmak →
  //     kalan = toplam − birikmiş = 2Δ_apsis − Δ_ham. e² ≥ KMU ise apsis yok: ufka
  //     düşer, −1 (yakalandı).
  //   • dışa giden (ud < 0): önündeki yol, içe giden bacağın aynası →
  //     kalan = Δ_ham (çevirme YOK).
  // Bruneton'un TraceRay'i ile birebir aynı dal ve işaret uzlaşımı. ÖLÇÜLDÜ
  // (scripts/bruneton-dogrulama/daltesti.mjs): bu yön medyan 0.0012-0.0131 mrad;
  // TERS yön medyan 141.75 mrad + 154 yakalama çelişkisi. DİKKAT: birikmiş sapma
  // isteyen bir tüketici (φ_c hesabı, B2) bunun tersini türetmeli: 2Δ_apsis − dönüş.
  if(ud > 0.0) d = e2 < KMU ? 2.0*apsisDefl - d : -1.0;
  return d;
}
void main(){
  vec2 ndc = vUv*2.-1.;
  vec4 vp = uProjInv*vec4(ndc,-1.,1.); vp/=vp.w;
  vec3 rd = normalize((uCamMat*vec4(vp.xyz,0.)).xyz);
  vec3 p = uCamPos;
  // Statik gözlemci düzeltmesi: ekranda ÖLÇÜLEN yön koordinat yönü DEĞİLDİR.
  // Tetrad ê_r = √(1−rs/r)·∂_r olduğundan tanψ_koord = tanψ_ölçülen/√(1−rs/r);
  // radyal bileşeni √(1−rs/r) ile ölçekleyip yeniden normalize etmek buna denk.
  // Düzeltmesiz gölge r₀=12 rs'te %4.3 büyük çıkıyordu; kamera yaklaştıkça artar.
  float r0 = length(p);
  float f0 = sqrt(max(1. - 1./r0, 1e-4));
  vec3 pr = p/max(r0, 1e-4);
  vec3 v = normalize(rd + (f0 - 1.)*dot(rd, pr)*pr);
  vec3 L = cross(p, v); float h2 = dot(L,L);
  vec4 acc = vec4(0.);
  // ── TABLO YOLU ────────────────────────────────────────────────────────
  // Marş yalnız HACİMLİ örnekleme gerçekten gerektiğinde koşar. Işın disk
  // bandına hiç değmiyorsa (kare payının büyük kısmı: yıldız/bulutsu) kaçış
  // yönü tablodan sabit zamanda gelir ve 240 adımın TAMAMI atlanır — üstelik
  // sonuç daha doğru (marş: medyan 4.86 mrad hata, tablo: 0.0045).
  //
  // KASITLI OLARAK DAR TUTULDU (B1): yakalanan ışın da, jet de, disk bandına
  // değen ışın da eski marşa düşer. Yakalanan ışın gölgeye düşmeden ÖNCE diski
  // kesebilir (gölgenin önündeki iç disk) ve bizim diskimiz HACİMLİdir —
  // ikisi de tablodan tek bir kesişim noktasıyla çıkarılamaz. O iş B2.
  if(uTables > 0.5){
    vec3 ez = cross(pr, v);
    float ezl = length(ez);
    // ezl ≈ 0: ışın tam radyal. Işın düzlemi tanımsız, tablo eşlemesi de
    // (ud = -u/tan(delta)) ıraksar — bu ışınlar marşa bırakılır.
    if(ezl > 1e-5){
      ez /= ezl;
      vec3 ey = cross(ez, pr);
      float delta = acos(clamp(dot(pr, v), -1.0, 1.0));
      float u = 1.0/r0;
      float ud = -u/tan(delta);
      float e2 = ud*ud + u*u*(1.0 - u);
      float apsisDefl;
      float defl = tableDefl(u, ud, e2, apsisDefl);
      // minR ANALİTİK: içe giden ışının en yakın yaklaşımı apsistir, dışa
      // gidenin ise başladığı yer. Marş bunu adım adım biriktiriyordu.
      float minR = ud > 0.0 ? 1.0/uApsisT(e2) : r0;
      bool march = defl < 0.0 || uJetA.x*uRealism > 0.0;
      // MUHAFAZAKÂR ATLAMA TESTİ — asla yanlış atlamaz (ölçüldü: üç kamera
      // konumunda 8192'şer piksel, sıfır yanlış). Yalnız KESİN büyüklükler:
      //   • minR bandın dışındaysa ışın diske hiç yaklaşamaz;
      //   • ışın toplam ψ_max = δ + Δ_kalan sahne açısı süpürür (kaçış yönünün
      //     ta kendisi), disk düzlemini ise ancak ψ = α'da keser. α ≥ ψ_max ise
      //     ışın oraya varmadan kaçar: kesişim YOKTUR.
      // Bruneton'un kendi iki-görüntü şeması (mod π + apsis yansıması) burada
      // KULLANILAMAZ: o, kameranın diskin DIŞINDA olduğunu varsayıyor; bizim
      // kamera r≈13.4, disk dış yarıçapı 13.5 — tam kenarında. Denendi, diskin
      // dış kenarında iki simetrik siyah kama üretti (kesişimlerin %14'ü yanlış
      // temsilciye düşüyor, bir kısmı da φ_ub tablo sınırının dışında kalıyor).
      if(!march && minR <= R_OUT + 0.5){
        vec3 td = cross(vec3(0., 1., 0.), ez);
        float tdl = length(td);
        if(tdl > 1e-5){                       // düzlemler paralel değilse
          td /= tdl;
          if(dot(td, ey) < 0.0) td = -td;
          float alpha = acos(clamp(dot(pr, td), -1.0, 1.0));
          // Işın düzlemi ile disk düzlemi bir DOĞRU boyunca kesişir: geçişler
          // ψ = α + kπ (k ≥ 0) açılarında olur, α = acos(...) ∈ [0, π]. Güçlü
          // bükülen ışında ψ_max = δ + Δ rahatlıkla π'yi aşar, yani ikinci geçiş
          // (k = 1) da aralığa girebilir. TEK KARŞILAŞTIRMA YETER: α + π < ψ_max
          // ise zorunlu olarak α < ψ_max'tır (π > 0), yani ikinci geçişi olan her
          // ışın ZATEN bu testten marşa düşer. Tersi de geçerli — α ≥ ψ_max ise
          // tüm k'lar için α + kπ ≥ ψ_max, hiç geçiş yoktur. Ayrıca sınandı:
          // 4 kamera konumu × 16200 ışın (foton halkası çevresi yoğun örneklendi),
          // 7248'inde ikinci geçiş aralıkta; "k=0,1'i ayrı ayrı sına" varyantıyla
          // FARKLI karar veren ışın sayısı 0, yanlış atlanan 0.
          if(alpha < delta + defl) march = true;
        }
      }
      // ── FAZ B2: disk de tablodan ─────────────────────────────────────
      // Marş yalnız jet için kalır. Işının disk düzlemini kestiği her nokta
      // analitik: ψ_k = α + kπ (ψ_k < ψ_max olanlar), φ = φ_c + ψ_k,
      // r = 1/𝕌(e², φ). Hacimli örnekleme bu noktaya çapalanır — marşın
      // yaptığının aynısı, ama adım adım yürümeden.
      //
      // Doğrulandı (scripts/bruneton-dogrulama/kesisimB2.mjs + b2yakalanan.mjs):
      // kaçan ışında 2888/2916 kesişim, yarıçap medyan %0.098, konum 0.0097
      // birim, YÖN medyan 0.795 mrad; yakalanan ışında %0.036 / 0.0022 birim.
      if(uB2 > 0.5 && uJetA.x*uRealism <= 0.0){
        // BİRİKMİŞ sapma (sonsuzdan kameraya) — tableDefl'in döndürdüğü KALAN
        // sapmanın tersi. İçe giden ışın ham değeri, dışa giden 2Δ_apsis − ham.
        float raw, ap2;
        tableRaw(u, e2, raw, ap2);
        float dAcc = ud > 0.0 ? raw : 2.0*ap2 - raw;
        float phiC = dAcc + PI_ - delta;
        float phiA = ap2 + PI_*0.5;          // apsisin tablo açısı (e² < KMU ise)
        float pub  = phiUbT(e2);
        bool esc   = defl >= 0.0;
        float psiMax = esc ? delta + defl : 1e9;   // yakalananda sınır ufuk
        vec3 td2 = cross(vec3(0., 1., 0.), ez);
        float tdl2 = length(td2);
        if(tdl2 > 1e-5){
          td2 /= tdl2;
          if(dot(td2, ey) < 0.0) td2 = -td2;
          float alpha2 = acos(clamp(dot(pr, td2), -1.0, 1.0));
          for(int k = 0; k < 6; k++){
            float psi = alpha2 + float(k)*PI_;
            if(psi >= psiMax) break;
            float phi = phiC + psi;
            // APSİS SİMETRİSİ: u(φ) apsis etrafında simetriktir. Yansıtma
            // olmadan kesişimlerin %20'si düşer — kamera disk kenarında
            // olduğu için φ_c zaten φ_ub'ye yakın başlıyor.
            float phiE = (e2 < KMU && phi > phiA) ? 2.0*phiA - phi : phi;
            if(phiE < 0.0) break;             // ışın sonsuza kaçtı
            if(phiE > pub) break;             // tablo kapsamı dışı (ISCO altı)
            float uk = tableInvRad(e2, phiE);
            if(uk >= 1.0) break;              // ufka düştü
            float rr = 1.0/max(uk, 1e-6);
            if(rr > R_OUT + 0.5) continue;    // bandın dışında, katkı yok
            vec3 er = cos(psi)*pr + sin(psi)*ey;
            vec3 et = -sin(psi)*pr + cos(psi)*ey;
            vec3 hp = er*rr;
            hp.y = 0.0;                        // kesişim tanım gereği düzlemde
            // Yön TABLODAN DEĞİL enerji bağıntısından: u̇² = e² + u³ − u².
            // İŞARET: apsisi olan ışında (e² < KMU) apsisin hangi tarafında
            // olduğumuz belirler. APSİSİ OLMAYAN ışında (e² ≥ KMU) dönüm
            // noktası yoktur — işaret ışın boyunca SABİTTİR ve kameranınkidir:
            // içe giden plonjeyi sürdürür, dışa giden hep dışa gider.
            float sgnk = (e2 < KMU) ? (phi > phiA ? -1.0 : 1.0)
                                    : (ud > 0.0 ? 1.0 : -1.0);
            float udk = sqrt(max(e2 + uk*uk*uk - uk*uk, 0.0)) * sgnk;
            vec3 vk = normalize(et - (udk/max(uk, 1e-6))*er);
            float Hh = diskH(rr);
            if(rr > uDiskIn && rr < R_OUT) sampleDisk(hp, vk, Hh, 2.0*Hh, acc);
            if(rr > uDiskIn - 1.5 && acc.a < 0.95){
              float su = 0.85*Hh/clamp(abs(vk.y), 0.35, 1.0);
              for(int m = 0; m < 4; m++)
                sampleAtmo(hp + vk*((float(m) - 1.5)*su), vk, Hh, su, acc);
            }
            if(acc.a > 0.99) break;
          }
        }
        float minR2 = ud > 0.0 ? (e2 < KMU ? 1.0/uApsisT(e2) : 1.0) : r0;
        vec3 bg2 = vec3(0.);
        if(esc && acc.a < 0.985){
          float dp2 = delta + defl;
          bg2 = stars(cos(dp2)*pr + sin(dp2)*ey)*mix(1.0, 0.12, uRealism);
        }
        vec3 col2 = acc.rgb + (1.0 - acc.a)*bg2;
        if(esc){
          col2 += mix(vec3(1.,.5,.24), vec3(.75,.85,1.15), uRealism)
                * mix(0.05, 0.03, uRealism) * exp(-pow((minR2-2.75)*1.15,2.));
          col2 += mix(vec3(1.05,.92,.75), vec3(.9,.95,1.2), uRealism)
                * mix(0.5, 0.10, uRealism) * exp(-pow((minR2-1.55)*mix(5.5, 9.0, uRealism),2.));
        }
        gl_FragColor = vec4(outColor(col2, ndc), 1.);
        return;
      }
      if(!march){
        float dp = delta + defl;
        vec3 dEsc = cos(dp)*pr + sin(dp)*ey;
        vec3 col = stars(dEsc)*mix(1.0, 0.12, uRealism);
        col += mix(vec3(1.,.5,.24), vec3(.75,.85,1.15), uRealism)
             * mix(0.05, 0.03, uRealism) * exp(-pow((minR-2.75)*1.15,2.));
        col += mix(vec3(1.05,.92,.75), vec3(.9,.95,1.2), uRealism)
             * mix(0.5, 0.10, uRealism) * exp(-pow((minR-1.55)*mix(5.5, 9.0, uRealism),2.));
        gl_FragColor = vec4(outColor(col, ndc), 1.);
        return;
      }
    }
  }
  // Uzak ışınlar (etki parametresi > 17 rs) az bükülür: analitik düz
  // yol — aynı görüntü, maliyetin küçük bir kısmı; uzaklaşınca GPU yükü sabit
  if(h2 > 289.0){
    float td = (abs(v.y) > 1e-5) ? -p.y/v.y : -1.;   // disk düzlemi kesişimi
    bool diskDone = false;
    if(uJetA.x*uRealism > 0.0){
      // Bu dalda tek disk kesişimi jeti yakalayamaz (huzme dikeydir ve büyük
      // etki parametreli ışınların çoğu tam ondan geçer). Jeti kapsayan
      // silindirle kesiştirip yalnız o aralıkta düz bir marş yaparız.
      float Rj = uJetB.z*uJetB.y + uJetA.z + uJetA.w*uJetB.y + 0.8;
      float Lj = uJetB.y;
      vec2 o = p.xz, dxz = v.xz;
      float A = dot(dxz,dxz), B = dot(o,dxz), Cc = dot(o,o) - Rj*Rj;
      float disc = B*B - A*Cc;
      float t0 = 0., t1 = -1.;
      if(disc > 0. && A > 1e-7){
        float sq = sqrt(disc);
        t0 = max((-B-sq)/A, 0.);
        t1 = (-B+sq)/A;
      } else if(A <= 1e-7 && Cc < 0.){
        t0 = 0.; t1 = uEsc;                 // ışın silindire paralel ve içinde
      }
      if(abs(v.y) > 1e-5){
        float ta = (-Lj - p.y)/v.y, tb = (Lj - p.y)/v.y;
        t0 = max(t0, min(ta,tb)); t1 = min(t1, max(ta,tb));
      } else if(abs(p.y) > Lj){ t1 = -1.; }
      // disk jetten öndeyse önce onu birikime kat (doğru ön-arka sıralama)
      if(t1 > t0 && td > 0. && td < t0){
        vec3 hp = p + v*td; float rr = length(hp.xz);
        if(rr>uDiskIn && rr<R_OUT){ float Hh = diskH(rr); sampleDisk(hp, v, Hh, 2.0*Hh, acc); }
        diskDone = true;
      }
      // Adım MESAFEYE göre seçilir (küre izleme benzeri): huzme ekseni her
      // yükseklikte analitik bilindiğinden uzaktayken büyük, içindeyken huzme
      // çapı kadar adım atılır. Sabit adım, SS 433'ün 13 birim yarıçaplı
      // precession hacminde 0.5 birimlik sarmalı benekli tarıyordu.
      float t = t0;
      for(int k=0;k<64;k++){
        if(t >= t1 || acc.a > 0.985) break;
        vec3 hp = p + v*t;
        float hh = abs(hp.y);
        float rj = max(uJetA.z + uJetA.w*max(hh-uJetB.x, 0.), 0.05);
        vec2 ax = jetAxis(hh, hp.y < 0. ? -1. : 1.);
        float dd = length(hp.xz - ax);
        float st = clamp(0.6*(dd - 2.2*rj), 0.75*rj, 3.0);
        if(!diskDone && td >= t && td < t + st){
          diskDone = true;
          vec3 hd = p + v*td; float rr = length(hd.xz);
          if(rr>uDiskIn && rr<R_OUT){ float Hh = diskH(rr); sampleDisk(hd, v, Hh, 2.0*Hh, acc); }
        }
        if(dd < 2.8*rj) sampleJet(hp, v, min(st, t1-t), acc);
        t += st;
      }
    }
    if(!diskDone && td > 0.){
      vec3 hp = p + v*td;
      float rr = length(hp.xz);
      if(rr>uDiskIn && rr<R_OUT){ float Hh = diskH(rr); sampleDisk(hp, v, Hh, 2.0*Hh, acc); }
    }
    // pozlama ödünü: gerçekçi modda disk parlaklığı yıldızları bastırır.
    // Gökyüzü, ışının DÜZ yolu boyunca değil analitik zayıf alan sapmasıyla
    // örneklenir: yürüyen dalla eşikte örtüşür (yoksa b = 17'de çember görünür)
    vec3 cf = acc.rgb + (1.-acc.a)*stars(weakBend(p, v))*mix(1.0, 0.12, uRealism);
    gl_FragColor = vec4(outColor(cf, ndc), 1.); return;
  }
  bool captured = false;
  bool escaped = false;
  float minR = 1e4;
  float stepScale = 150.0/float(uSteps);
  // geniş etki parametreli ışınlar az bükülür: adımı kademeli kabalaştır.
  // foton halkası b≈2.6 rs'te (h²≈6.8) — bu bölge hiç etkilenmez
  float dtBoost = 1. + 0.6*smoothstep(120., 289., h2);
  for(int i=0;i<260;i++){
    if(i>=uSteps) break;
    float r2 = dot(p,p); float r = sqrt(r2);
    minR = min(minR, r);
    if(r < 1.0){ captured=true; break; }
    if(r > uEsc && dot(p,v) > 0.){ escaped=true; break; }
    // dış bölgede merkezden VE disk düzleminden uzaklaşan ışın bir daha
    // kesişemez (240 ≈ (R_OUT+2)²): kalan zayıf bükülme uEsc'e kadar süren
    // eski yürüyüşte de ihmal ediliyordu — erken çık, yıldıza git
    // Işın huzmeye BİR DAHA giremiyorsa eski ucuz eşikle çıkabilir. Huzme
    // yükseklikle (precession konisi + alevlenme) şu hızda genişler:
    // (tanα + flare)·|v_y|; ışın radyal olarak bundan hızlı uzaklaşıyorsa
    // koni onu bir daha yakalayamaz. Kaba bir silindir testi SS 433'te 14
    // birim yarıçap verip her ışını 150 adım boyunca yürütüyordu (46 → 30 fps).
    bool jetAhead = false;
    if(uJetA.x*uRealism > 0.0){
      float hh = abs(p.y);
      float rjH = (uJetB.z + uJetA.w)*hh + uJetA.z + 1.0;
      float lxz = max(length(p.xz), 1e-4);
      bool leaving = lxz > rjH && dot(p.xz,v.xz)/lxz > (uJetB.z + uJetA.w)*abs(v.y);
      bool above = hh > uJetB.y && p.y*v.y > 0.;
      jetAhead = !leaving && !above;
    }
    if(!jetAhead && r2 > 240.0 && p.y*v.y > 0. && dot(p,v) > 0.){ escaped=true; break; }
    float dt = (0.045 + 0.065*max(r-1.6, 0.)) * stepScale * dtBoost;
    vec3 a = -1.5*h2*p/(r2*r2*r);
    vec3 pPrev = p;
    v += a*dt; p += v*dt;
    // disk geçişi: düzlem kesişiminde TEK tam kalite doku örneği (dsl=2H ile
    // pozlama eski tek-örnek değerine normalize) + kesişime ÇAPALI 4 ucuz
    // atmosfer örneği: ±y'de pamuksu hacim, ana döngüye adım-başı yük SIFIR
    if(pPrev.y*p.y < 0.){
      float t = pPrev.y/(pPrev.y-p.y);
      vec3 hp = mix(pPrev, p, t);
      float rr = length(hp.xz);
      vec3 vnn = normalize(v);
      if(rr>uDiskIn && rr<R_OUT){ float Hh = diskH(rr); sampleDisk(hp, vnn, Hh, 2.0*Hh, acc); }
      if(rr>uDiskIn-1.5 && rr<R_OUT+0.5 && acc.a < 0.95){
        float Hh = diskH(rr);
        // sıyıran ışında ışın-boyu yayılım sınırlandırılır (doku lapalaşmasın)
        float su = 0.85*Hh/clamp(abs(vnn.y), 0.35, 1.);
        for(int k=0;k<4;k++){
          float s = (float(k)-1.5)*su;
          sampleAtmo(hp + vnn*s, vnn, Hh, su, acc);
        }
      }
    }
    // jet, bükülmüş ışının üstünde adım adım entegre edilir: sıralama (ön/arka)
    // ve lenslenme kendiliğinden doğru çıkar. Koni dışında maliyet ~0.
    // Dış bölgede dt ≈ 0.8–1.9 birim, huzme çapı ise ~1–2: tek örnek benekli
    // çıkardı. Adımı BÖLMEK yerine adım İÇİNDE 3 alt örnek alınır — adım
    // bütçesi (uSteps) hiç tüketilmez, koni dışında üç ucuz erken dönüş olur.
    if(uJetA.x*uRealism > 0.0 && acc.a < 0.985){
      // Önce TEK kaba test: adımın süpürdüğü aralık huzmeye değmiyorsa üç
      // çağrının kurulum maliyeti ödenmez. Test huzme EKSENİNE (helix üstünde
      // bir nokta) göre yapılır — precession konisini kapsayan silindire göre
      // değil: SS 433'te o silindir 14 birim yarıçapındadır ve kapıyı işlevsiz
      // bırakıp her adımda üç örnek aldırıyordu.
      float hh = abs(p.y);
      float rj = uJetA.z + uJetA.w*max(hh - uJetB.x, 0.) + dt;
      // 1. kapı (sin/cos YOK): precession konisinin en dış yarıçapı. Işın
      // bunun dışındaysa helix ekseni hesaplanmaz bile.
      float rOut = uJetB.z*hh + 2.7*rj;
      if(hh < uJetB.y + dt && dot(p.xz,p.xz) < rOut*rOut){
        // 2. kapı: gerçek helix eksenine uzaklık — koniyi kapsayan silindir
        // SS 433'te 14 birim yarıçapındadır, tek başına hiçbir şey elemez
        vec2 axG = jetAxis(hh, p.y < 0. ? -1. : 1.);
        if(dot(p.xz-axG, p.xz-axG) < 7.3*rj*rj){
          float sub = dt/3.0;
          for(int k=0;k<3;k++) sampleJet(p - v*(sub*float(k)), v, sub, acc);
        }
      }
    }
    if(acc.a > 0.99) break;
  }
  // disk pikseli neredeyse opaksa yıldız alanını hiç hesaplama:
  // katkısı (1−a)·yıldız < %1.5, gözle görülmez — fbm + yıldız ızgarası atlanır
  // !escaped: adım bütçesi foton halkası civarında dolanırken biten ışın —
  // yönü yarı-yörüngede rastgeledir; yıldız örneklemek gölgenin üstüne
  // sahte yıldız/çizgi serpiyordu. Bu bant ufka mahkûm bölgedir: siyah.
  // !escaped: adım bütçesi bitmiş ışın. Yakın bölgede (r < 8) bu, foton
  // halkası çevresinde dolanan ve ufka mahkûm ışındır: siyah. Uzakta ise
  // yalnız bütçe tükenmiştir (jet boyunca yürüyen ışın) — yıldızını görsün.
  bool lost = !escaped && !captured && dot(p,p) < 64.0;
  // Yürüyüş uEsc'te ya da r² > 240 erken çıkışında biter; kalan zayıf bükülme
  // analitik eklenir. Erken çıkış çoğu ışında periyapsisin hemen ardında olur
  // ve tek başına sapmanın YARISINI atıyordu — düz dalla arasındaki fark bu.
  vec3 bg = (captured || lost || acc.a > 0.985) ? vec3(0.)
          : stars(weakBend(p, normalize(v)))*mix(1.0, 0.12, uRealism);
  vec3 col = acc.rgb + (1.-acc.a)*bg;
  if(!captured){
    // bu iki terim KOZMETİKTİR (sanatsal halo) — gerçekçi modda bastırılır:
    // gerçek foton halkası ışın izlemedeki disk örneklerinden kendiliğinden
    // oluşur; yapay geniş parlama "sahte blur" gibi durur
    // GENİŞ halo 0.30 → 0.05: deliği çevreleyen sahte blur kısıldı.
    col += mix(vec3(1.,.5,.24), vec3(.75,.85,1.15), uRealism)
         * mix(0.05, 0.03, uRealism) * exp(-pow((minR-2.75)*1.15,2.));
    col += mix(vec3(1.05,.92,.75), vec3(.9,.95,1.2), uRealism)
         * mix(0.5, 0.10, uRealism) * exp(-pow((minR-1.55)*mix(5.5, 9.0, uRealism),2.));
  }
  gl_FragColor = vec4(outColor(col, ndc), 1.);
}
`

export type LensUniforms = {
  uTime: THREE.IUniform<number>
  uCamPos: THREE.IUniform<THREE.Vector3>
  uCamMat: THREE.IUniform<THREE.Matrix4>
  uProjInv: THREE.IUniform<THREE.Matrix4>
  uEsc: THREE.IUniform<number>
  uSteps: THREE.IUniform<number>
  uDeflTex: THREE.IUniform<THREE.Texture | null>
  uTables: THREE.IUniform<number>
  uB2: THREE.IUniform<number>
  uInvRTex: THREE.IUniform<THREE.Texture | null>
  uDiskIn: THREE.IUniform<number>
  uEff: THREE.IUniform<number>
  uRealism: THREE.IUniform<number>
  uDiskThick: THREE.IUniform<number>
  uDiskGlow: THREE.IUniform<number>
  uDiskVar: THREE.IUniform<THREE.Vector2>
  uDiskPatch: THREE.IUniform<THREE.Vector2>
  uNebColor: THREE.IUniform<THREE.Vector3>
  uNebPar: THREE.IUniform<THREE.Vector2>
  /** açılışta pişirilen bulutsu alanı (bkz. nebulaBake.ts) */
  uNebTex: THREE.IUniform<THREE.CubeTexture | null>
  /** 0 = doğrusal HDR çıkış (bloom hattı devrede), 1 = shader kendi ton eşlemesini yapar */
  uToneMap: THREE.IUniform<number>
  uJetA: THREE.IUniform<THREE.Vector4>
  uJetB: THREE.IUniform<THREE.Vector4>
  uJetC: THREE.IUniform<THREE.Vector4>
  uJetColor: THREE.IUniform<THREE.Vector3>
}

export function createLensUniforms(): LensUniforms {
  return {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCamMat: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uEsc: { value: 44 },
    uSteps: { value: 150 },
    uDeflTex: { value: null },
    uTables: { value: 1 },
    uB2: { value: 0 },
    uInvRTex: { value: null },
    uDiskIn: { value: 2.35 },
    uEff: { value: 0.06 },
    uRealism: { value: 0 },
    uDiskThick: { value: 1 },
    uDiskGlow: { value: 1 },
    uDiskVar: { value: new THREE.Vector2(0, 0) },
    uDiskPatch: { value: new THREE.Vector2(0, 0) },
    uNebColor: { value: new THREE.Vector3(0.028, 0.01, 0.006) },
    uNebPar: { value: new THREE.Vector2(1, 1) },
    uNebTex: { value: null },
    uToneMap: { value: 1 },
    uJetA: { value: new THREE.Vector4(0, 0, 0, 0) },
    uJetB: { value: new THREE.Vector4(0, 0, 0, 0) },
    uJetC: { value: new THREE.Vector4(0, 0, 0, 0) },
    uJetColor: { value: new THREE.Vector3(0.8, 0.88, 1.1) },
  }
}
