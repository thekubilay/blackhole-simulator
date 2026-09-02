import * as THREE from 'three'

/**
 * GEMİ GEÇİŞİ — kırpılmış 4× MSAA hedefi (SRP: tek iş — katman 0'daki
 * geometriyi kenar yumuşatmalı çizip birleştirilmiş karenin üstüne basmak).
 *
 * NEDEN: tuvalin kendi MSAA'sı (`antialias: true`) ölçüldü — 0.27 ms/Mpix,
 * 8.3 Mpix'te 2.2 ms, karenin %11'i (scripts/olcum-protokolu.md §6). Maliyet
 * gemi geçişinde DEĞİL, çoklu örnekli tamponun kendisinde: tam ekran kompozit
 * quad'ı 4 örnekli tampona yazılıp her karede çözülüyor. Oysa MSAA yalnız
 * GEMİNİN kenarlarını düzeltir — lens tam ekran bir quad, shader aliasing'ine
 * MSAA dokunmaz. Yani tam ekran bedel ödeyip küçük bir alanda fayda alıyorduk.
 *
 * ÇÖZÜM: tuval MSAA'sız. Gemi (ve katman 0'daki diğer opak geometri) yalnız
 * ekran kutusu kadar bir 4× MSAA hedefe `setViewOffset` ile çizilir, çözülür,
 * premultiplied harmanla tuvale bindirilir. Gemi küçükken bedel ~0, kadrajda
 * değilken sıfır; kenetlenmede gemi kadrajı doldurunca eski maliyete yaklaşır
 * (kötüleşmez). FXAA/SMAA bilerek seçilmedi: Endurance'ın ince kafes kirişleri
 * var, post-AA ince geometride kötüdür, MSAA tam orada iyidir.
 *
 * PARÇACIKLAR (emberStream, TOPLAMALI harman) bu hedefe GİRMEZ: kırpılmış
 * hedefte alfa örtme oranıdır, toplamalı ışık bir alfa kanalıyla taşınamaz
 * (a += s.a·s.a birikir, kompozitte bölme patlar). Ayrı katmanda (PARTICLE_LAYER)
 * doğrudan tuvale çizilirler. Örtme doğru kalsın diye (ufuk örtücüsü deliğin
 * arkasındaki kıvılcımları gizler, gemi önündekini keser) parçacıklardan ÖNCE
 * katman 0 tuvale YALNIZ DERİNLİK yazar (overrideMaterial, colorWrite kapalı) —
 * MSAA'sız, renksiz, çok ucuz; parçacık yokken bu iki geçiş hiç yapılmaz.
 *
 * RENK: hedef SRGB8_ALPHA8. Three sıradan hedefe DOĞRUSAL yazar (outputColorSpace
 * yalnız tuvalde uygulanır); sRGB hedefte kodlamayı donanım yapar, 8 bitte
 * karanlıkta bantlanma olmaz, MSAA çözümlemesi doğrusal ortalar. Kompozit
 * örneklerken donanım geri açar; tuvale yazarken `linearToOutputTexel` ile
 * three'nin kendi çıkış kodlaması uygulanır — gemi eski yolla aynı renkte.
 * Kenar pikselleri premultiplied'dır (renk × örtme); kodlamadan önce bölünür,
 * sonra yeniden çarpılır, yoksa kenarlar açılır.
 *
 * KUTU: her katman-0 mesh'inin dünya küresinden bir AABB, 8 köşesi NDC'ye
 * yansıtılır (perspektif dışbükeyliği korur: köşelerin min/max'ı kürenin
 * izdüşümünü kapsar). Köşelerden biri kameranın arkasındaysa tam ekran. Kutu
 * 32 px adımlara yuvarlanır ki hedef her karede yeniden ayrılmasın.
 */

/** Toplamalı parçacık akışlarının katmanı; ShipPass her karede Points'lere basar. */
export const PARTICLE_LAYER = 2

const PAD_PX = 6
const QUANT = 32

const COMPOSITE_VERTEX = /* glsl */ `
uniform vec4 uRect;   // NDC: x0, y0 (alt-sol), x1, y1 (üst-sağ)
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(mix(uRect.xy, uRect.zw, uv), 0., 1.); }
`

const COMPOSITE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tShip;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(tShip, vUv);                 // sRGB hedef: donanım açtı, doğrusal, premultiplied
  vec3 rgb = c.a > 1e-4 ? c.rgb / c.a : vec3(0.);
  vec4 e = linearToOutputTexel(vec4(rgb, 1.0));   // three'nin tuval kodlaması (sRGB)
  gl_FragColor = vec4(e.rgb * c.a, c.a);          // premultiplied: ONE, ONE_MINUS_SRC_ALPHA
}
`

export class ShipPass {
  private readonly renderer: THREE.WebGLRenderer
  private readonly rt: THREE.WebGLRenderTarget
  private readonly composite: THREE.ShaderMaterial
  private readonly quad: THREE.Mesh
  private readonly quadScene: THREE.Scene
  private readonly quadCamera: THREE.Camera
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false })
  private rtW = 0
  private rtH = 0

  private readonly sphere = new THREE.Sphere()
  private readonly corner = new THREE.Vector3()
  private readonly clearColor = new THREE.Color()

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      samples: 4,
      depthBuffer: true,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.SRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    })
    // derinliği hiç okumuyoruz: çözümlemede derinlik blit'i boşuna
    this.rt.resolveDepthBuffer = false
    this.composite = new THREE.ShaderMaterial({
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: { tShip: { value: this.rt.texture }, uRect: { value: new THREE.Vector4(-1, -1, 1, 1) } },
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite)
    this.quad.frustumCulled = false
    this.quadScene = new THREE.Scene().add(this.quad)
    this.quadCamera = new THREE.Camera()
  }

  /**
   * Katman 0'ı (gemi, örtücüler) kırpılmış MSAA hedefe çizip tuvale bindirir,
   * ardından parçacıkları tuvale çizer. Tuvalin rengi korunur (üstüne çizim);
   * derinlik tamponunun bu noktada TEMİZ olması beklenir (bloom.ts 5. adım).
   * Kamera matrislerinin güncel olması beklenir (aynı karede lens geçişi
   * çoktan `render` çağırdı).
   */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, fullW: number, fullH: number): void {
    const { renderer } = this
    let hasParticles = false
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let full = false
    let any = false

    scene.traverseVisible((o) => {
      const pts = o as THREE.Points
      if (pts.isPoints) {
        pts.layers.set(PARTICLE_LAYER)
        hasParticles = true
        return
      }
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || (mesh.layers.mask & 1) === 0) return
      const mat = mesh.material as THREE.Material
      if (!mat || mat.visible === false || mat.colorWrite === false) return // örtücüler, tıklama düzlemi
      const geo = mesh.geometry
      if (!geo.boundingSphere) geo.computeBoundingSphere()
      if (!geo.boundingSphere) return
      this.sphere.copy(geo.boundingSphere).applyMatrix4(mesh.matrixWorld)
      const c = this.sphere.center, r = this.sphere.radius
      any = true
      if (full) return
      for (let i = 0; i < 8; i++) {
        this.corner.set(i & 1 ? c.x + r : c.x - r, i & 2 ? c.y + r : c.y - r, i & 4 ? c.z + r : c.z - r)
        this.corner.applyMatrix4(camera.matrixWorldInverse)
        if (this.corner.z > -camera.near) { full = true; return } // köşe kameranın arkasında/önünde
        this.corner.applyMatrix4(camera.projectionMatrix)
        if (this.corner.x < minX) minX = this.corner.x
        if (this.corner.x > maxX) maxX = this.corner.x
        if (this.corner.y < minY) minY = this.corner.y
        if (this.corner.y > maxY) maxY = this.corner.y
      }
    })

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false

    if (hasParticles) {
      // parçacık örtmesi için katman 0 derinliği tuvale (renk yazılmaz)
      camera.layers.set(0)
      scene.overrideMaterial = this.depthOnly
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      scene.overrideMaterial = null
    }

    if (any) this.drawShip(scene, camera, fullW, fullH, full, minX, minY, maxX, maxY)

    if (hasParticles) {
      camera.layers.set(PARTICLE_LAYER)
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
    }

    camera.layers.set(0)
    renderer.autoClear = prevAutoClear
  }

  private drawShip(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    fullW: number,
    fullH: number,
    full: boolean,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): void {
    const { renderer } = this
    let x = 0, y = 0, w = fullW, h = fullH
    if (!full) {
      if (maxX < -1 || minX > 1 || maxY < -1 || minY > 1) return // tümüyle kadraj dışı
      const x0 = Math.max(0, Math.floor(((minX + 1) * 0.5) * fullW) - PAD_PX)
      const x1 = Math.min(fullW, Math.ceil(((maxX + 1) * 0.5) * fullW) + PAD_PX)
      const y0 = Math.max(0, Math.floor(((1 - maxY) * 0.5) * fullH) - PAD_PX) // üstten
      const y1 = Math.min(fullH, Math.ceil(((1 - minY) * 0.5) * fullH) + PAD_PX)
      if (x1 <= x0 || y1 <= y0) return
      w = Math.min(Math.ceil((x1 - x0) / QUANT) * QUANT, fullW)
      h = Math.min(Math.ceil((y1 - y0) / QUANT) * QUANT, fullH)
      x = Math.min(x0, fullW - w)
      y = Math.min(y0, fullH - h)
    }
    if (w !== this.rtW || h !== this.rtH) {
      this.rtW = w
      this.rtH = h
      this.rt.setSize(w, h)
    }

    renderer.getClearColor(this.clearColor)
    const prevAlpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 0)
    camera.layers.set(0)
    camera.setViewOffset(fullW, fullH, x, y, w, h)
    renderer.setRenderTarget(this.rt)
    renderer.autoClear = true
    renderer.render(scene, camera) // render() sonunda three MSAA'yı çözer
    camera.clearViewOffset()
    renderer.setClearColor(this.clearColor, prevAlpha)

    // NDC dikdörtgeni: x sağa, y yukarı; kutunun y'si üstten sayıldı
    this.composite.uniforms.uRect.value.set(
      (x / fullW) * 2 - 1,
      1 - ((y + h) / fullH) * 2,
      ((x + w) / fullW) * 2 - 1,
      1 - (y / fullH) * 2,
    )
    renderer.setRenderTarget(null)
    renderer.autoClear = false
    renderer.render(this.quadScene, this.quadCamera)
  }

  dispose(): void {
    this.rt.dispose()
    this.quad.geometry.dispose()
    this.composite.dispose()
    this.depthOnly.dispose()
  }
}
