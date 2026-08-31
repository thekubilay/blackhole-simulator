import * as THREE from 'three'

/**
 * Bulutsu skaler alanının PİŞİRİLMESİ (SRP: tek iş — alanı küp haritasına yaz).
 *
 * Alan yalnız ışın YÖNÜNÜN fonksiyonudur ve zamandan tamamen bağımsızdır:
 * `fbm3d(rd*2.2+7.0)` ve `fbm3dLo(rd*1.1+19.0)` hiçbir zaman-değişkeni içermez.
 * Buna rağmen lens shader'ı onu HER KARE, HER PİKSEL için yeniden hesaplıyordu:
 * 4+3 = 7 oktav 3B değer gürültüsü = 56 `hash13` çağrısı. Ölçülen maliyet
 * 1280×800 / 240 adımda 1.4 ms — sanatsal moddaki kare süresinin %14'ü.
 *
 * Bir kez pişirildiğinde aynı sonuç tek `textureCube` okumasıyla gelir. Alanın
 * tanımı (gürültü fonksiyonları dahil) BURADA yaşar; lens shader'ı artık
 * bulutsunun nasıl üretildiğini bilmez, yalnız dokuyu okur.
 *
 * Deliğe özgü renk/yoğunluk (uNebColor, uNebPar.x) çalışma zamanında çarpılır,
 * dolayısıyla delik değiştiğinde YENİDEN PİŞİRME GEREKMEZ.
 */

/** Alanın üst sınırı — 8 bit kodlamanın ölçeği. Türetimi: `fbm3d` ≤ 0.96875
 *  (Σa = 0.9375 × 1.0333), `fbm3dLo` ≤ 0.9686 ⇒ alan ≤ 0.939·0.65 + 0.909·0.85
 *  = 1.383. 1.5 güvenli tavandır. */
export const NEB_MAX = 1.5

/** Küp yüzü kenarı. En yüksek bulutsu frekansı ≈ 2.2·2.03³ ≈ 18 çevrim/birim
 *  yön, yani ~3°'lik yapı; 256 teksel = 0.35°/teksel ⇒ Nyquist'in çok üstünde. */
const FACE_SIZE = 256

/**
 * Alanın tanımı. Lens shader'ından SÖKÜLEN gürültü fonksiyonlarıyla birebir
 * aynıdır (hash13 / vnoise3 / fbm3d / fbm3dLo) — pişirilen değer eski satır içi
 * hesabın tıpatıp aynısıdır, yalnız bir kez yapılır.
 */
const NEBULA_FIELD_GLSL = /* glsl */ `
float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }
// 3B değer gürültüsü — gökküre için: (azimut, yükseklik) düzlemi yerine YÖN
// uzayında tanımlıdır, dolayısıyla kutupta tekilliği yoktur.
float vnoise3(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=hash13(i),             b=hash13(i+vec3(1,0,0));
  float c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)), g=hash13(i+vec3(1,0,1));
  float h=hash13(i+vec3(0,1,1)), k=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(h,k,f.x),f.y), f.z);
}
// 4 ve 3 oktav yeter (bulutsu düşük frekanslı bir pustur; üst oktavlar zaten
// Nyquist altında kalıp yalnız parıldama üretiyordu). Çarpanlar genliği eski
// 5 oktavlık toplama eşitler: 0.96875/0.9375 ve 0.96875/0.875
float fbm3d(vec3 p){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*vnoise3(p); p=p*2.03+vec3(17.3,9.1,4.7); a*=.5; } return v*1.0333; }
float fbm3dLo(vec3 p){ float v=0.,a=.5; for(int i=0;i<3;i++){ v+=a*vnoise3(p); p=p*2.03+vec3(17.3,9.1,4.7); a*=.5; } return v*1.107; }
// iki ölçekli bulutsu: ince pus (neb) + büyük kabuk/filaman yapısı (neb2).
// Renk ve yoğunluk deliğin gerçek çevresinden gelir (uNebColor/uNebPar) ve
// ÇALIŞMA ZAMANINDA çarpılır — bu skaler tüm delikler için ortaktır.
float nebulaField(vec3 rd){
  float neb  = fbm3d(rd*2.2+7.0);
  float neb2 = fbm3dLo(rd*1.1+19.0);
  return neb*neb*0.65 + pow(neb2,3.0)*0.85;
}
`

const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`

/**
 * Yüz indeksinden yöne çeviri: WebGL küp haritası sözleşmesi.
 *
 * Tablo TAHMİN DEĞİL, ölçümle türetildi: yüz indeksini ve yüz-içi (u,v)
 * konumunu kodlayan bir desen küp dokusuna pişirilip bilinen yönlerle
 * `textureCube` ile örneklendi; her yüz için eksen kaydırmasının (u,v)
 * üzerindeki işareti okundu. Sonuç (s = 2u−1, t = 2v−1):
 *   +X: +y→−t, +z→−s   ⇒ ( 1, −t, −s)      −X: +y→−t, +z→+s   ⇒ (−1, −t,  s)
 *   +Y: +x→+s, +z→+t   ⇒ ( s,  1,  t)      −Y: +x→+s, +z→−t   ⇒ ( s, −1, −t)
 *   +Z: +x→+s, +y→−t   ⇒ ( s, −t,  1)      −Z: +x→−s, +y→−t   ⇒ (−s, −t, −1)
 * (u,v) doğrudan `vUv`dur — çizim yönünde EK BİR DİKEY ÇEVİRME YOKTUR;
 * three'nin PlaneGeometry uv düzeni ile küp yüzü framebuffer'ı aynı yöndedir.
 */
const BAKE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform int uFace;
uniform float uMax;
${NEBULA_FIELD_GLSL}
vec3 faceDir(int f, vec2 st){
  if(f == 0) return vec3( 1.0, -st.y, -st.x);   // +X
  if(f == 1) return vec3(-1.0, -st.y,  st.x);   // -X
  if(f == 2) return vec3( st.x,  1.0,  st.y);   // +Y
  if(f == 3) return vec3( st.x, -1.0, -st.y);   // -Y
  if(f == 4) return vec3( st.x, -st.y,  1.0);   // +Z
  return              vec3(-st.x, -st.y, -1.0); // -Z
}
void main(){
  vec3 rd = normalize(faceDir(uFace, vUv*2.0 - 1.0));
  // karekök kodlaması: 8 bit hassasiyeti KARANLIK uçta yoğunlaştırır. Doğrusal
  // saklansaydı en sönük bulutsu bölgesinde nicemleme adımı ton eşlemeden sonra
  // ~1.7/255'e çıkıyordu (mevcut dither ±1.5/255) — karekökle 0.3/255'e iner.
  gl_FragColor = vec4(sqrt(clamp(nebulaField(rd)/uMax, 0.0, 1.0)), 0.0, 0.0, 1.0);
}
`

/**
 * OKUMA tarafı — lens shader'ına enjekte edilir. Kodlama (karekök + NEB_MAX)
 * ile çözme aynı dosyada durur: ölçek tek yerde tanımlıdır, ikisi ayrı düşemez.
 */
export const NEBULA_SAMPLE_GLSL = /* glsl */ `
uniform samplerCube uNebTex;
// Pişirilmiş bulutsu alanı: eski 7 oktavlık 3B gürültünün (56 hash) yerine
// tek doku okuması. Karekök kodlaması burada çözülür.
float nebulaAt(vec3 rd){
  float s = textureCube(uNebTex, rd).r;
  return s*s*${NEB_MAX.toFixed(4)};
}
`

/**
 * Pişirilmiş alan RENDERER'A aittir, bileşene değil: delikten, moddan ve
 * kameradan bağımsız TEK bir alandır. Sahipliği burada tutmak iki şeyi birden
 * çözer — bileşen yeniden bağlandığında (StrictMode mount→unmount→remount ya da
 * gerçek remount) yeniden pişirilmez, ve bileşen yaşam döngüsüyle yok edilip
 * uniform'un ölü dokuyu göstermesi mümkün olmaz.
 *
 * Açık `dispose` yoktur ve gerekmez: küp hedefi bağlamın ömrünü paylaşır —
 * Canvas sökülünce renderer da WebGL bağlamı da yok edilir, GPU kaynağı onunla
 * gider. WeakMap girdisi de renderer ile birlikte toplanır.
 */
const cache = new WeakMap<THREE.WebGLRenderer, THREE.CubeTexture>()

/** Bu renderer için bulutsu küp dokusu; ilk çağrıda pişirilir, sonra aynısı. */
export function getNebulaCube(renderer: THREE.WebGLRenderer): THREE.CubeTexture {
  let tex = cache.get(renderer)
  if (!tex) {
    tex = bakeNebulaCube(renderer)
    cache.set(renderer, tex)
  }
  return tex
}

/**
 * Bulutsu alanını küp haritasına pişirir.
 *
 * 8 bit + karekök kodlaması bilinçli tercihtir: yarım-kayan nokta hedefleri
 * `EXT_color_buffer_float` gerektirir ve her cihazda yoktur; RGBA8 her yerde
 * çizilebilir ve ölçümle bu alan için yeterli olduğu gösterildi.
 */
function bakeNebulaCube(renderer: THREE.WebGLRenderer, size = FACE_SIZE): THREE.CubeTexture {
  const target = new THREE.WebGLCubeRenderTarget(size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
  })
  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT,
    uniforms: {
      uFace: { value: 0 },
      uMax: { value: NEB_MAX },
    },
    depthTest: false,
    depthWrite: false,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  const scene = new THREE.Scene().add(quad)
  const camera = new THREE.Camera()

  const prevTarget = renderer.getRenderTarget()
  const prevFace = renderer.getActiveCubeFace()
  for (let face = 0; face < 6; face++) {
    material.uniforms.uFace.value = face
    renderer.setRenderTarget(target, face)
    renderer.render(scene, camera)
  }
  renderer.setRenderTarget(prevTarget, prevFace)

  geometry.dispose()
  material.dispose()

  return target.texture
}
