import * as THREE from 'three'

/**
 * DEĞER GÜRÜLTÜSÜ KAFESİNİN PİŞİRİLMESİ (SRP: tek iş — hash12'nin tam sayı
 * kafesini dokuya yaz).
 *
 * NEDEN: disk dokusu piksel başına 22 vnoise = 88 hash12 (iki katman × 5+3+3
 * oktav), atmosfer örneği başına 4 hash daha. Ölçüldü: disk gürültüsü karenin
 * %19'u (3.75 ms @ 8.3 Mpix), lens ALU'sunun en büyük kalemi
 * (scripts/olcum-protokolu.md §6). Shader ALU-bağlı, doku tap'leri ise bedava
 * çıktı (probe 5) — ALU'yu tap'e çevirmenin tam yeri.
 *
 * vnoise(p) = kafes köşelerindeki dört hash'in `f*f*(3-2f)` ağırlıklı bilineer
 * karışımı. Donanım bilineer filtresi DOĞRUSAL ağırlık kullanır; eşleme için
 * koordinat örneklemeden ÖNCE yumuşatılır: `i + f*f*(3-2f)`. O noktada donanım
 * dört texeli tam vnoise ağırlıklarıyla karıştırır — formül birebir aynı.
 *
 * BİT DÜZEYİNDE AYNI ALAN: kafes değerleri hash12(i)'nin KENDİSİDİR, mod-N ile
 * döşenmiş yeni bir alan değil. Kullanılan kafes aralığı hesaplandı: disk
 * |hxz| ≤ 16 → fbm(q·1.35)'in 5. oktavı |p| ≤ 632, fbm3(q·7.4)'ün 3. oktavı
 * ≤ 563, atmosfer ≤ 22. 2048² doku, kökeni 1024'te: [−1024, 1024) — sarmalama
 * hiç devreye girmez, disk bugünkü desenin ta kendisiyle çizilir (görsel A/B
 * gerekmez, sayısal doğrulama yeter). Jet BU DOKUYU KULLANMAZ: koordinatı
 * uTime·0.02 ile sınırsız büyür, saatler sonra aralıktan çıkar — ALU yolunda.
 *
 * NEDEN GPU'DA PİŞİRİLİR: hash12 büyük argümanda fract(fp32) çalıştırır ve
 * son bite duyarlıdır; CPU'da Math.fround ile taklit edilse bile sürücünün FMA
 * kaynaştırması farklı yuvarlayabilir. Aynı GLSL'i aynı sürücüde çalıştırmak
 * tek güvenli yol.
 *
 * KODLAMA: RG8, h = r + g/255 (16 bit). Doğrusal kodlama olduğu için bilineer
 * filtreden sonra da çözme doğrudur: lerp(r) + lerp(g)/255 = lerp(h). 8 MB VRAM.
 */

/** hash12 — TEK TANIM: pişirme ve lens shader'ı (yıldızlar, jet) aynı satırı kullanır. */
export const HASH12_GLSL = /* glsl */ `
float hash12(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
`

const NOISE_SIZE = 2048
const NOISE_ORG = 1024

const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`

const BAKE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
${HASH12_GLSL}
void main(){
  vec2 i = floor(vUv*${NOISE_SIZE.toFixed(1)}) - ${NOISE_ORG.toFixed(1)};
  float h = hash12(i);
  gl_FragColor = vec4(floor(h*255.0)/255.0, fract(h*255.0), 0.0, 1.0);
}
`

/**
 * OKUMA tarafı — lens shader'ına enjekte edilir. Kafes kökeni ve boyutu
 * pişirmeyle aynı sabitlerden gelir; ikisi ayrı düşemez.
 */
export const NOISE_SAMPLE_GLSL = /* glsl */ `
uniform sampler2D uNoiseTex;
// Pişirilmiş hash12 kafesi: 4 hash + 3 mix yerine tek bilineer tap. Koordinat
// önceden yumuşatılır ki donanım ağırlığı vnoise'un f*f*(3-2f)'si olsun.
float vnoiseT(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  vec2 s = texture2D(uNoiseTex, (i + f + ${(NOISE_ORG + 0.5).toFixed(1)}) * ${(1 / NOISE_SIZE).toFixed(10)}).rg;
  return s.r + s.g*(1.0/255.0);
}
`

const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

/** Bu renderer için gürültü kafesi dokusu; ilk çağrıda pişirilir, sonra aynısı. */
export function getNoiseLattice(renderer: THREE.WebGLRenderer): THREE.Texture {
  let tex = cache.get(renderer)
  if (!tex) {
    tex = bakeNoiseLattice(renderer)
    cache.set(renderer, tex)
  }
  return tex
}

function bakeNoiseLattice(renderer: THREE.WebGLRenderer): THREE.Texture {
  const target = new THREE.WebGLRenderTarget(NOISE_SIZE, NOISE_SIZE, {
    format: THREE.RGFormat,
    type: THREE.UnsignedByteType,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    generateMipmaps: false,
    depthBuffer: false,
  })
  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  const scene = new THREE.Scene().add(quad)
  const camera = new THREE.Camera()

  const prevTarget = renderer.getRenderTarget()
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)
  renderer.setRenderTarget(prevTarget)

  geometry.dispose()
  material.dispose()
  return target.texture
}
