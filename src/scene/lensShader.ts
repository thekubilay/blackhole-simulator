import * as THREE from 'three'

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
// uRealism: 0 = sanatsal palet, 1 = fiziksel (g⁴ hüzmeleme + kara cisim rengi)
uniform float uDiskIn, uEff, uRealism;
#define R_OUT 13.5
mat2 rot(float a){
  // KRİTİK: açıyı 2π'ye sar — float32 sin/cos büyük argümanda hassasiyet
  // kaybeder (özellikle Metal/ANGLE); sarılmazsa disk dokusu dakikalar
  // içinde piksel-tutarsızlığından "sahte blur"a çözülür
  a = mod(a, 6.28318530718);
  float c=cos(a),s=sin(a);return mat2(c,-s,s,c);
}
float hash12(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  float a=hash12(i),b=hash12(i+vec2(1,0)),c=hash12(i+vec2(0,1)),d=hash12(i+vec2(1,1));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return v; }
// yüksek frekanslı katmanlar için 3 oktav yeterli: 4-5. oktavlar ekran örnekleme
// sınırının (Nyquist) altında kalır, yalnız parıldama üretir. 1.107 = amplitüd
// normalizasyonu (5 oktavlık toplam genlikle eşleşir, doku kontrastı korunur)
float fbm3(vec2 p){ float v=0.,a=.5; for(int i=0;i<3;i++){ v+=a*vnoise(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return v*1.107; }
vec3 stars(vec3 rd){
  vec3 col=vec3(0.);
  float neb=fbm(vec2(atan(rd.z,rd.x)*2.2, rd.y*4.0)+7.0);
  col += vec3(.028,.010,.006)*neb*neb;
  vec2 sph = vec2(atan(rd.z,rd.x), asin(clamp(rd.y,-1.,1.)));
  for(float i=0.;i<2.;i++){
    float sc = 70.+i*110.;
    vec2 uv = sph*sc;
    vec2 id = floor(uv), gv = fract(uv)-.5;
    float h = hash12(id+i*7.13);
    if(h>0.915){
      vec2 off = vec2(hash12(id+3.7),hash12(id+9.3))-.5;
      float d = length(gv-off*.7);
      float s = smoothstep(.14,.0,d)*(h-.915)/.085;
      float tw = .75+.25*sin(mod(uTime*(1.+h*2.)+h*40., 6.28318530718));
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
void sampleDisk(vec3 hp, vec3 vn, inout vec4 acc){
  float rr = length(hp.xz);
  // iki RİJİT dönen gürültü katmanı (iç hızlı, dış yavaş), yarıçapla harmanlı:
  // zaman bağımlı her açı yarıçaptan bağımsız — kayma ASLA birikmez,
  // bulut dokusu t=0 ile t=1s'te istatistiksel olarak aynıdır
  float spiral = 2.6*log(rr);
  // iç/dış gürültü katmanı yalnız harman ağırlığı gerektirdiğinde örneklenir:
  // blend bandının (3.2–8.5) dışında maliyet yarıya iner, sonuç birebir aynı
  float w = smoothstep(3.2, 8.5, rr);
  float n = 0.;
  if(w < 0.999){
    vec2 qA = rot(uTime*0.045 + spiral) * hp.xz;
    n = 0.50*fbm(qA*1.35) + 0.32*fbm3(qA*3.6) + 0.18*fbm3(qA*7.4);
  }
  if(w > 0.001){
    vec2 qB = rot(uTime*0.012 + spiral + 1.7) * hp.xz;
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
  vec3 td = normalize(vec3(-hp.z, 0., hp.x));
  float beta = clamp(sqrt(0.5/max(rr,1.4)), 0., 0.62);
  float gamma = 1./sqrt(1.-beta*beta);
  float dop = 1./(gamma*(1.+beta*dot(td,vn)));
  float gfac = sqrt(max(1.-1./rr, 0.03));   // kütleçekimsel kayma √(1−rs/r)
  float shift = dop * gfac;                 // toplam g = ν_gözlenen/ν_yayılan
  // Sanatsal: δ^(3.6)·√f (mevcut görünüm). Gerçekçi: bolometrik I ∝ g⁴ —
  // yaklaşan taraf kat kat parlak, iç kenar kütleçekimsel kaymayla SÖNÜK
  // gerçekçi pozlama düşük tutulur: yoksa her iki yan da ton eşlemede beyaza
  // kırpılır ve g⁴'ün ~20× asimetrisi görünmez olur (Luminet 1979 kontrastı)
  float boostA = pow(dop, 3.6) * gfac;
  // 2.35/uDiskIn: pozlama deliğe normalize (uç spinde ISCO'ya bağlı emisyon
  // profili tüm kareyi karartmasın) — fizik değil, kamera pozlaması
  float boostR = 0.16 * (2.35/uDiskIn) * pow(shift, 4.0);
  E *= mix(boostA, boostR, uRealism);
  // Sanatsal renk: altın palet + belirgin Doppler mavi/kızıl ayrımı
  vec3 cA = diskRamp(rr);
  cA = mix(cA, vec3(1.08,1.02,.95), clamp(uEff*1.6*pow(uDiskIn/rr, 2.0), 0., .5));
  cA = mix(cA, vec3(.98,1.0,1.08), clamp((dop-1.)*1.1,0.,.75));
  cA = mix(cA, cA*vec3(1.,.40,.24), clamp((1.-dop)*1.5,0.,.9));
  // Gerçekçi renk: Shakura–Sunyaev T ∝ r^(−3/4), gözlenen sıcaklık g ile kayar —
  // disk mavi-beyaz, yaklaşan taraf maviye, uzaklaşan/iç bölge kızıla
  float tRel = 1.35 * pow(uDiskIn/max(rr,uDiskIn), 0.75) * shift;
  vec3 c = mix(cA, bbRamp(tRel), uRealism);
  float a = clamp(E*.55,0.,.95);
  acc.rgb += (1.-acc.a)*c*E;
  acc.a  += (1.-acc.a)*a*.7;
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
void main(){
  vec2 ndc = vUv*2.-1.;
  vec4 vp = uProjInv*vec4(ndc,-1.,1.); vp/=vp.w;
  vec3 rd = normalize((uCamMat*vec4(vp.xyz,0.)).xyz);
  vec3 p = uCamPos, v = rd;
  vec3 L = cross(p, rd); float h2 = dot(L,L);
  vec4 acc = vec4(0.);
  // uzak ışınlar (etki parametresi > 17 rs) neredeyse bükülmez: analitik düz
  // yol — aynı görüntü, maliyetin küçük bir kısmı; uzaklaşınca GPU yükü sabit
  if(h2 > 289.0){
    if(abs(v.y) > 1e-5){
      float t = -p.y/v.y;
      if(t > 0.){
        vec3 hp = p + v*t;
        float rr = length(hp.xz);
        if(rr>uDiskIn && rr<R_OUT) sampleDisk(hp, v, acc);
      }
    }
    // pozlama ödünü: gerçekçi modda disk parlaklığı yıldızları bastırır
    vec3 cf = acc.rgb + (1.-acc.a)*stars(v)*mix(1.0, 0.12, uRealism);
    cf = aces(cf); cf = pow(cf, vec3(0.4545));
    cf += (hash12(gl_FragCoord.xy*.73)-.5)*0.012;
    float vf = 1.-0.32*pow(length(ndc*vec2(1.,.8)),2.6);
    gl_FragColor = vec4(cf*vf, 1.); return;
  }
  bool captured = false;
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
    if(r > uEsc && dot(p,v) > 0.) break;
    // dış bölgede merkezden VE disk düzleminden uzaklaşan ışın bir daha
    // kesişemez (240 ≈ (R_OUT+2)²): kalan zayıf bükülme uEsc'e kadar süren
    // eski yürüyüşte de ihmal ediliyordu — erken çık, yıldıza git
    if(r2 > 240.0 && p.y*v.y > 0. && dot(p,v) > 0.) break;
    float dt = (0.045 + 0.065*max(r-1.6, 0.)) * stepScale * dtBoost;
    vec3 a = -1.5*h2*p/(r2*r2*r);
    vec3 pPrev = p;
    v += a*dt; p += v*dt;
    if(pPrev.y*p.y < 0.){
      float t = pPrev.y/(pPrev.y-p.y);
      vec3 hp = mix(pPrev, p, t);
      float rr = length(hp.xz);
      if(rr>uDiskIn && rr<R_OUT) sampleDisk(hp, normalize(v), acc);
    }
    if(acc.a > 0.99) break;
  }
  // disk pikseli neredeyse opaksa yıldız alanını hiç hesaplama:
  // katkısı (1−a)·yıldız < %1.5, gözle görülmez — fbm + yıldız ızgarası atlanır
  vec3 bg = (captured || acc.a > 0.985) ? vec3(0.) : stars(normalize(v))*mix(1.0, 0.12, uRealism);
  vec3 col = acc.rgb + (1.-acc.a)*bg;
  if(!captured){
    // bu iki terim KOZMETİKTİR (sanatsal halo) — gerçekçi modda bastırılır:
    // gerçek foton halkası ışın izlemedeki disk örneklerinden kendiliğinden
    // oluşur; yapay geniş parlama "sahte blur" gibi durur
    col += mix(vec3(1.,.5,.24), vec3(.75,.85,1.15), uRealism)
         * mix(0.30, 0.03, uRealism) * exp(-pow((minR-2.75)*1.15,2.));
    col += mix(vec3(1.05,.92,.75), vec3(.9,.95,1.2), uRealism)
         * mix(0.5, 0.10, uRealism) * exp(-pow((minR-1.55)*mix(5.5, 9.0, uRealism),2.));
  }
  col = aces(col);
  col = pow(col, vec3(0.4545));
  col += (hash12(gl_FragCoord.xy*.73)-.5)*0.012;   // dither: gradyan bantlaşmasını siler
  float vig = 1.-0.32*pow(length(ndc*vec2(1.,.8)),2.6);
  gl_FragColor = vec4(col*vig, 1.);
}
`

export type LensUniforms = {
  uTime: THREE.IUniform<number>
  uCamPos: THREE.IUniform<THREE.Vector3>
  uCamMat: THREE.IUniform<THREE.Matrix4>
  uProjInv: THREE.IUniform<THREE.Matrix4>
  uEsc: THREE.IUniform<number>
  uSteps: THREE.IUniform<number>
  uDiskIn: THREE.IUniform<number>
  uEff: THREE.IUniform<number>
  uRealism: THREE.IUniform<number>
}

export function createLensUniforms(): LensUniforms {
  return {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCamMat: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uEsc: { value: 44 },
    uSteps: { value: 150 },
    uDiskIn: { value: 2.35 },
    uEff: { value: 0.06 },
    uRealism: { value: 0 },
  }
}
