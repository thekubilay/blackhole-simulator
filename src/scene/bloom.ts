import * as THREE from 'three'
import { DISPLAY_TRANSFORM_GLSL } from './displayTransform'

/**
 * BLOOM HATTI (SRP: tek iş — HDR lens çıkışından parlama üretip ekrana bas).
 *
 * Neden gerekliydi: ton eşleme lens shader'ının İÇİNDEYDİ (`aces()`), yani
 * 1'in üstündeki değerler daha ekrana yazılmadan kırpılıyordu. Sıcak iç disk ve
 * foton halkası ne kadar parlak olursa olsun çevresine ışık taşıyamıyordu.
 * Doğru sıra: lens DOĞRUSAL HDR yazar → parlaklık eşiği → mip zinciri → toplam
 * → ton eşleme. Ton eşleme artık bloom eklendikten SONRA yapılır.
 *
 * Süzgeçler Call of Duty: Advanced Warfare'in (Jimenez 2014) çift süzgeç
 * şemasıdır: 13 örnekli indirgeme + 9 örnekli çadır süzgeciyle toplamalı
 * yükseltme. Ayrık Gauss'a göre çok daha ucuzdur ve halka/kare artefaktı
 * üretmez — parlama geniş ve yumuşak çıkar.
 *
 * Geometri (Endurance, parçacıklar) bu hattan GEÇMEZ: yalnız lens katmanı HDR
 * hedefe çizilir, birleştirmeden sonra sahnenin geri kalanı tuvale üstüne
 * çizilir. Böylece gemi ve HUD'un mevcut görünümü bit düzeyinde korunur —
 * bloom yalnız kara deliğe uygulanır.
 */

/** Lens mesh'inin katmanı: HDR geçişinde YALNIZ bu katman çizilir. */
export const LENS_LAYER = 1

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`

/**
 * Parlaklık eşiği — yumuşak diz (soft knee). Sert eşik, eşiğin iki yanında
 * gidip gelen pikselleri kare kare yakıp söndürür (disk dokusu kaynar);
 * yumuşak diz geçişi karesel olarak açar.
 */
const PREFILTER_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uThreshold, uKnee;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0*uKnee);
  soft = soft*soft/(4.0*uKnee + 1e-4);
  gl_FragColor = vec4(c * max(soft, br - uThreshold)/max(br, 1e-4), 1.0);
}
`

/** 13 örnekli indirgeme (ağırlıklar toplamı tam 1). */
const DOWNSAMPLE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
void main(){
  vec3 a = texture2D(tSrc, vUv + uTexel*vec2(-2., 2.)).rgb;
  vec3 b = texture2D(tSrc, vUv + uTexel*vec2( 0., 2.)).rgb;
  vec3 c = texture2D(tSrc, vUv + uTexel*vec2( 2., 2.)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel*vec2(-2., 0.)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + uTexel*vec2( 2., 0.)).rgb;
  vec3 g = texture2D(tSrc, vUv + uTexel*vec2(-2.,-2.)).rgb;
  vec3 h = texture2D(tSrc, vUv + uTexel*vec2( 0.,-2.)).rgb;
  vec3 i = texture2D(tSrc, vUv + uTexel*vec2( 2.,-2.)).rgb;
  vec3 j = texture2D(tSrc, vUv + uTexel*vec2(-1., 1.)).rgb;
  vec3 k = texture2D(tSrc, vUv + uTexel*vec2( 1., 1.)).rgb;
  vec3 l = texture2D(tSrc, vUv + uTexel*vec2(-1.,-1.)).rgb;
  vec3 m = texture2D(tSrc, vUv + uTexel*vec2( 1.,-1.)).rgb;
  gl_FragColor = vec4(
    e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125, 1.0);
}
`

/** 9 örnekli çadır süzgeci; toplamalı harmanla bir üst mip'e eklenir. */
const UPSAMPLE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
void main(){
  vec2 o = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb
         + texture2D(tSrc, vUv + vec2( 0.0,  o.y)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb
         + texture2D(tSrc, vUv + vec2(-o.x,  0.0)).rgb * 2.0
         + texture2D(tSrc, vUv).rgb * 4.0
         + texture2D(tSrc, vUv + vec2( o.x,  0.0)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb
         + texture2D(tSrc, vUv + vec2( 0.0, -o.y)).rgb * 2.0
         + texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb;
  gl_FragColor = vec4(s * 0.0625, 1.0);
}
`

/** Birleştirme: HDR sahne + parlama, ardından TEK ekran transformu. */
const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom;
uniform float uStrength;
${DISPLAY_TRANSFORM_GLSL}
void main(){
  vec3 hdr = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uStrength;
  gl_FragColor = vec4(finish(hdr, vUv*2.0 - 1.0), 1.0);
}
`

export interface BloomParams {
  /** parlama eşiği (doğrusal ışık); altı hiç parlamaz */
  threshold: number
  /** yumuşak diz genişliği — eşik çevresindeki geçişi açar */
  knee: number
  /** birleştirmede parlamanın ağırlığı */
  strength: number
  /** yükseltme yarıçapı (teksel cinsinden); büyüdükçe parlama genişler */
  radius: number
  /** mip zinciri derinliği; her kademe parlamanın yayılımını ikiye katlar */
  levels: number
}

/**
 * Ölçümle seçilmiş "gölge-güvenli" ayar. Sahnenin doğrusal parlaklığı ölçüldü:
 * tepe 4.3, karenin %3'ü 1.0'ın üstünde, %0.21'i 2.0'ın üstünde. Bu dar HDR
 * aralığında toplamalı bloom'un asıl etkisi parlak bölgeyi parlatmak DEĞİL
 * (ACES omzu eklenen ışığı yutuyor), karanlık bölgeyi kaldırmaktır — ve gölge
 * her yandan parlak halkayla çevrili olduğu için enerji en çok oraya yığılır.
 * Ölçülen takas: hale +%12 için gölge 0.3 → 67.6 (0-255). Bu yüzden eşik
 * yüksek, güç ve kademe sayısı düşük tutuldu: gölge 0.3 → 6.2'de kalır.
 */
export const DEFAULT_BLOOM: BloomParams = {
  threshold: 1.1,
  knee: 0.4,
  strength: 0.25,
  radius: 0.9,
  levels: 4,
}

const hdrSupport = new WeakMap<THREE.WebGLRenderer, boolean>()

/**
 * Yarım-kayan nokta hedefi bu cihazda ÇİZİLEBİLİR mi? Desteklenmiyorsa bloom
 * kurulmaz ve lens shader'ı kendi ton eşlemesini yapar (uToneMap = 1) —
 * yani eski davranış birebir korunur, kimse bozuk bir görüntüyle kalmaz.
 */
export function supportsHdrPost(renderer: THREE.WebGLRenderer): boolean {
  const cached = hdrSupport.get(renderer)
  if (cached !== undefined) return cached
  const gl = renderer.getContext()
  const ok =
    renderer.capabilities.isWebGL2 &&
    (!!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float'))
  hdrSupport.set(renderer, ok)
  return ok
}

function makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(w, 1), Math.max(h, 1), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    generateMipmaps: false,
    depthBuffer: false,
  })
}

export class BloomPipeline {
  private readonly renderer: THREE.WebGLRenderer
  private readonly params: BloomParams
  private hdr: THREE.WebGLRenderTarget
  private mips: THREE.WebGLRenderTarget[] = []
  private width = 0
  private height = 0

  private readonly prefilter: THREE.ShaderMaterial
  private readonly down: THREE.ShaderMaterial
  private readonly up: THREE.ShaderMaterial
  private readonly composite: THREE.ShaderMaterial
  private readonly quad: THREE.Mesh
  private readonly quadScene: THREE.Scene
  private readonly quadCamera: THREE.Camera

  constructor(renderer: THREE.WebGLRenderer, params: BloomParams = DEFAULT_BLOOM) {
    this.renderer = renderer
    this.params = params
    this.hdr = makeTarget(1, 1)

    const mk = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERTEX,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
      })

    this.prefilter = mk(PREFILTER_FRAGMENT, {
      tSrc: { value: null },
      uThreshold: { value: params.threshold },
      uKnee: { value: Math.max(params.knee, 1e-3) },
    })
    this.down = mk(DOWNSAMPLE_FRAGMENT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } })
    this.up = mk(UPSAMPLE_FRAGMENT, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: params.radius },
    })
    // yükseltme bir üst mip'in ÜSTÜNE eklenir: zincir aşağıdan yukarı toplanır
    this.up.blending = THREE.AdditiveBlending
    this.composite = mk(COMPOSITE_FRAGMENT, {
      tScene: { value: null },
      tBloom: { value: null },
      uStrength: { value: params.strength },
    })

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.prefilter)
    this.quad.frustumCulled = false
    this.quadScene = new THREE.Scene().add(this.quad)
    this.quadCamera = new THREE.Camera()
  }

  /** Ayarları canlı değiştirir (DEV'de `__bloom.set({...})` ile denemek için). */
  set(next: Partial<BloomParams>): BloomParams {
    Object.assign(this.params, next)
    this.prefilter.uniforms.uThreshold.value = this.params.threshold
    this.prefilter.uniforms.uKnee.value = Math.max(this.params.knee, 1e-3)
    this.up.uniforms.uRadius.value = this.params.radius
    this.composite.uniforms.uStrength.value = this.params.strength
    if (next.levels !== undefined) {
      this.width = 0 // hedefleri yeniden kurmaya zorla
    }
    return { ...this.params }
  }

  /** Çizim tamponu boyutu değiştiyse hedefleri yeniden kur (kalite kademesi
   *  dpr'ı değiştirdiğinde de buradan yakalanır — ayrı bir abonelik gerekmez). */
  private resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h
    this.hdr.setSize(w, h)
    for (const m of this.mips) m.dispose()
    this.mips = []
    let mw = Math.max(Math.floor(w / 2), 1)
    let mh = Math.max(Math.floor(h / 2), 1)
    for (let i = 0; i < this.params.levels && mw > 8 && mh > 8; i++) {
      this.mips.push(makeTarget(mw, mh))
      mw = Math.max(Math.floor(mw / 2), 1)
      mh = Math.max(Math.floor(mh / 2), 1)
    }
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear: boolean): void {
    this.quad.material = material
    this.renderer.setRenderTarget(target)
    this.renderer.autoClear = clear
    this.renderer.render(this.quadScene, this.quadCamera)
  }

  /**
   * Bir kareyi baştan sona çizer. R3F'in otomatik render'ı, bu hattı süren
   * useFrame önceliği ile kapalıdır (bkz. PostFx.tsx).
   */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const { renderer } = this
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    this.resize(size.x, size.y)
    const prevAutoClear = renderer.autoClear

    // 1) Lens katmanı → doğrusal HDR hedefi
    camera.layers.set(LENS_LAYER)
    renderer.setRenderTarget(this.hdr)
    renderer.autoClear = true
    renderer.render(scene, camera)

    // 2) Eşik → en büyük mip
    this.prefilter.uniforms.tSrc.value = this.hdr.texture
    this.draw(this.prefilter, this.mips[0], true)

    // 3) Aşağı: her kademe yayılımı ikiye katlar
    for (let i = 1; i < this.mips.length; i++) {
      const src = this.mips[i - 1]
      this.down.uniforms.tSrc.value = src.texture
      this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height)
      this.draw(this.down, this.mips[i], true)
    }

    // 4) Yukarı: toplamalı harman, temizleme YOK (üstüne eklenir)
    for (let i = this.mips.length - 1; i > 0; i--) {
      const src = this.mips[i]
      this.up.uniforms.tSrc.value = src.texture
      this.up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height)
      this.draw(this.up, this.mips[i - 1], false)
    }

    // 5) Birleştir → tuval. autoClear burada kareyi de temizler (renk+derinlik).
    this.composite.uniforms.tScene.value = this.hdr.texture
    this.composite.uniforms.tBloom.value = this.mips[0].texture
    this.draw(this.composite, null, true)

    // 6) Sahnenin geri kalanı (gemi, parçacıklar) birleştirmenin ÜSTÜNE.
    //    Derinlik 5. adımda temizlendi, renk korunur.
    camera.layers.set(0)
    renderer.autoClear = false
    renderer.render(scene, camera)

    renderer.autoClear = prevAutoClear
  }

  dispose(): void {
    this.hdr.dispose()
    for (const m of this.mips) m.dispose()
    this.mips = []
    this.quad.geometry.dispose()
    this.prefilter.dispose()
    this.down.dispose()
    this.up.dispose()
    this.composite.dispose()
  }
}

/**
 * Hat da pişirilmiş bulutsu gibi RENDERER'A aittir: hedefleri çizim tamponuna
 * bağlıdır ve bağlam başına tek bir tanesi anlamlıdır. Sahipliği burada tutmak
 * bileşen yeniden bağlandığında hedeflerin yeniden kurulmasını önler ve
 * "cleanup çalıştı ama memo korundu" tuzağını baştan imkânsız kılar.
 * Açık dispose gerekmez: hedefler bağlamın ömrünü paylaşır.
 */
const pipelines = new WeakMap<THREE.WebGLRenderer, BloomPipeline>()

export function getBloomPipeline(renderer: THREE.WebGLRenderer): BloomPipeline {
  let p = pipelines.get(renderer)
  if (!p) {
    p = new BloomPipeline(renderer)
    pipelines.set(renderer, p)
    // DEV: konsoldan canlı ayar — __bloom.set({ strength: 0.4, threshold: 0.8 })
    // React'in dışında, hattın kurulduğu yerde: render sırasında yan etki yok.
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__bloom = p
    }
  }
  return p
}
