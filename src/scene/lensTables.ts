import * as THREE from 'three'

/**
 * BRUNETON TABLOLARI — piksel başına jeodezik marşı sabit zamanlı iki doku
 * aramasıyla değiştiren ön hesap (arXiv:2010.08735, Eric Bruneton).
 * Referans uygulama BSD-3-Clause, Copyright (c) 2020 Eric Bruneton
 * (github.com/ebruneton/black_hole_shader) — buradaki kod ondan portlanmıştır.
 *
 * NEDEN: marş piksel başına 240 adım koşuyor ve bütçenin %42'sini yiyor. Tablolar
 * aynı bilgiyi iki dokudan verir. Doğrulandı (bkz. bruneton-tablo-yontemi hafızası,
 * 1123 ışın): kaçış yönü hatası medyan 0.0045 mrad / max 0.040 mrad; bugünkü marş
 * medyan 4.86 / max 202.5 mrad. Yani tablo daha ucuz OLMAKLA KALMIYOR, görüntüyü
 * ~1000× düzeltiyor — bugün yıldızlar doğru lenslenmiş yerlerinden ~12 piksel kayık.
 *
 * BİRİMLER: r_s = 1, yani u = 1/r ve yörünge denklemi u'' = 1.5u² − u. Bu, bizim
 * shader'ımızın Kartezyen marşıyla (`a = -1.5·h²·p/r⁵`) BİREBİR aynı metriktir;
 * marşın sabit küçük adımda referansa yakınsadığı ölçülerek doğrulandı.
 */

/** kritik e² = 4/27; e = 1/b olduğundan b_krit = 3√3/2 ≈ 2.598 (foton halkası) */
export const KMU = 4 / 27
export const DEFL_W = 512
export const DEFL_H = 512
export const INVR_W = 64
export const INVR_H = 32

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))

/** u̇ = 0 olan nokta (periapsis); e² = kMu'da tam foton küresine (u = 2/3) oturur */
function uApsis(e2: number): number {
  const x = clamp((2 / KMU) * e2 - 1, -1, 1)
  return 1 / 3 + (2 / 3) * Math.sin(Math.asin(x) / 3)
}

/**
 * Tablo sütunu → e². Kritik değer (KMU) çevresinde örnek yoğunlaştıran eşleme
 * (paper Ek A). İLERİ yön (e² → sütun) yalnız shader'da gerekir; orada
 * `deflTexU` olarak duruyor — ikisi birbirinin tersidir, biri değişirse
 * diğeri de değişmeli.
 */
function deflTexUInv(tu: number): number {
  const x = 1 - Math.exp(-50 * (tu - 0.5) * (tu - 0.5))
  return tu < 0.5 ? KMU * x : KMU / x
}

/** (e², u) → tablo satırı; u = 2/3 (foton küresi) ve apsis çevresinde yoğun. */
function deflTexV(e2: number, u: number): number {
  if (e2 > KMU) {
    const x = u < 2 / 3 ? -Math.sqrt(2 / 3 - u) : Math.sqrt(u - 2 / 3)
    return (Math.sqrt(2 / 3) + x) / (Math.sqrt(2 / 3) + Math.sqrt(1 / 3))
  }
  return 1 - Math.sqrt(Math.max(1 - u / uApsis(e2), 0))
}

const phiUb = (e2: number) => (1 + e2) / (1 / 3 + 2 * e2 * Math.sqrt(e2))
const invRadTexUInv = (tu: number) => (1 / tu - 1) / 6

/**
 * 𝔻(e,u): sonsuzdan gelen ışının u yarıçapındaki sapması Δ ve ışık uçuş süresi.
 * Son satır (DEFL_H−1) apsisteki değeri tutar — dışa giden ışın için gereken
 * 2Δ_apsis − Δ simetrisi buradan gelir.
 *
 * ADIM SEÇİMİ BİZİM KATKIMIZ. Referans uygulama düz Euler + dφ = 1e-5 kullanıyor:
 * bu tablo onda 6.04 sn sürüyor (paper "~11 sn" diyor). Oysa max hatayı belirleyen
 * ODE mertebesi DEĞİL, ardışık örnekler arası satır doldurmanın doğrusal ara
 * değeri. Adımı "j en fazla maxRows satır ilerlesin" koşuluna bağlayıp RK4'e
 * geçince aynı iş 83 ms'de ve DAHA doğru bitiyor (max 0.037 vs 0.042 mrad).
 *
 * KRİTİK AYRINTI: sonlandıran adım (apsis ya da ufuk) rafine EDİLMELİDİR. Büyük
 * bir adım apsisi aşarsa son yazılan satır ile DEFL_H−1 arasındaki satırlar hiç
 * doldurulmaz ve tabloda sıfır kalır. Max hata bu yüzden 1.3 mrad'da takılıyordu;
 * rafineyle 0.037'ye indi. Bunu kaldırırsan foton halkası çevresinde hata patlar.
 */
function bakeDeflection(maxRows = 1.0, hMax = 0.05): Float32Array {
  const data = new Float32Array(DEFL_W * DEFL_H * 2)
  const set = (i: number, k: number, a: number, t: number) => {
    data[(k * DEFL_W + i) * 2] = a
    data[(k * DEFL_W + i) * 2 + 1] = t
  }
  for (let i = 0; i < DEFL_W; i++) {
    const e2 = deflTexUInv(i / (DEFL_W - 1))
    const e = Math.sqrt(e2)
    // dt/dφ = e/(u²(1−u)); u → 0'da ıraksar, orada zaten uçuş süresi anlamsız
    const g = (u: number) => (u > 1e-2 ? e / (u * u * (1 - u)) : 0)
    let t = 0
    let u = 0
    let ud = e
    let phi = 0
    let h = 1e-3
    let pDefl = 0
    let pT = 0
    let pJ = 0
    set(i, 0, 0, 0)
    for (;;) {
      if (u >= 1 || ud < 0) {
        set(i, DEFL_H - 1, pDefl, pT)
        break
      }
      const defl = phi - Math.atan2(u, ud)
      const j = deflTexV(e2, u) * (DEFL_H - 1)
      const k1 = Math.ceil(j)
      for (let k = Math.ceil(pJ); k < k1; k++) {
        const l = (k - pJ) / (j - pJ)
        set(i, k, pDefl * (1 - l) + defl * l, pT * (1 - l) + t * l)
      }
      pDefl = defl
      pT = t
      pJ = j
      for (;;) {
        const a1 = ud
        const b1 = 1.5 * u * u - u
        const a2 = ud + (h / 2) * b1
        const b2 = 1.5 * (u + (h / 2) * a1) * (u + (h / 2) * a1) - (u + (h / 2) * a1)
        const a3 = ud + (h / 2) * b2
        const b3 = 1.5 * (u + (h / 2) * a2) * (u + (h / 2) * a2) - (u + (h / 2) * a2)
        const a4 = ud + h * b3
        const b4 = 1.5 * (u + h * a3) * (u + h * a3) - (u + h * a3)
        const nu = u + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4)
        const nd = ud + (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4)
        if (nu >= 1 || nd < 0) {
          if (h > 1e-5) {
            h *= 0.5
            continue
          }
          u = nu
          ud = nd
          break
        }
        const nj = deflTexV(e2, nu) * (DEFL_H - 1)
        if (Math.abs(nj - j) > maxRows && h > 1e-6) {
          h *= 0.5
          continue
        }
        t += (h / 6) * (g(u) + 4 * g(u + (h / 2) * a2) + g(u + h * a3))
        u = nu
        ud = nd
        phi += h
        if (Math.abs(nj - j) < maxRows * 0.25) h = Math.min(h * 2, hMax)
        break
      }
    }
  }
  return data
}

/**
 * 𝕌(e,φ): sonsuzdan gelen ışının φ açısındaki ters yarıçapı u ve uçuş süresi.
 * Disk kesişim noktasını sabit zamanda verir. 64×32 yeter: doğrulandı, bağıl
 * hata medyan %0.03 / max %0.24. Burada uyarlanabilir adıma gerek yok — satır
 * ekseni doğrudan φ olduğu için sabit adım zaten düzgün örnekliyor.
 */
function bakeInverseRadius(): Float32Array {
  const data = new Float32Array(INVR_W * INVR_H * 2)
  const set = (i: number, k: number, a: number, t: number) => {
    data[(k * INVR_W + i) * 2] = a
    data[(k * INVR_W + i) * 2 + 1] = t
  }
  for (let i = 0; i < INVR_W; i++) {
    const e2 = invRadTexUInv(clamp(i / (INVR_W - 1), 0.001, 0.999))
    const e = Math.sqrt(e2)
    const pub = phiUb(e2)
    let t = 0
    let u = 0
    let ud = e
    let phi = 0
    const dphi = 1e-5
    let pU = 0
    let pT = 0
    let pJ = 0
    set(i, 0, 0, 0)
    for (;;) {
      const j = (phi / pub) * (INVR_H - 1)
      const k1 = Math.min(Math.ceil(j), INVR_H)
      for (let k = Math.ceil(pJ); k < k1; k++) {
        const l = (k - pJ) / (j - pJ)
        set(i, k, pU * (1 - l) + u * l, pT * (1 - l) + t * l)
      }
      if (k1 === INVR_H) break
      pU = u
      pT = t
      pJ = j
      if (u > 1e-2) t += (e / (u * u * (1 - u))) * dphi
      ud += (1.5 * u * u - u) * dphi
      u += ud * dphi
      phi += dphi
    }
  }
  return data
}

function makeTexture(data: Float32Array, w: number, h: number): THREE.DataTexture {
  // RG32F: WebGL2 çekirdeğinde SÜZÜLEBİLİR DEĞİL (OES_texture_float_linear ister)
  // ve lens shader'ı GLSL ES 1.00 olduğu için texelFetch de yok. Bu yüzden
  // NEAREST bağlanır ve shader bilinear'ı dört komşunun TEKSEL MERKEZİNDEN
  // elle yapar (fetch2) — eklenti bağımlılığı sıfır, aritmetik de doğrulama
  // koşumundaki sample2() ile birebir aynı.
  const tex = new THREE.DataTexture(data, w, h, THREE.RGFormat, THREE.FloatType)
  tex.internalFormat = 'RG32F'
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

export interface LensTables {
  /** 𝔻(e,u) — sapma; kaçış yönü, apsis ve yakalama kararı buradan gelir */
  deflection: THREE.DataTexture
  /** 𝕌(e,φ) — disk kesişim yarıçapı. TEMBEL: ilk erişimde pişer. */
  readonly inverseRadius: THREE.DataTexture
}

let cachedDefl: THREE.DataTexture | null = null
let cachedInvR: THREE.DataTexture | null = null

/**
 * Tablolar sahneden ve zamandan bağımsızdır (yalnız Schwarzschild geometrisine
 * bağlı) — süreç başına BİR KEZ pişirilir. Bulutsu küp haritasının aksine
 * renderer'a değil MODÜLE aittir: içinde GL durumu yok, saf veri.
 *
 * 𝕌 tablosu TEMBEL: bugün yalnız 𝔻 kullanılıyor (bkz. lensShader'daki
 * muhafazakâr atlama testi) ve 𝕌'yu pişirmek açılışta ~120 ms yiyor.
 * Hacimli disk analitik kesişime çapalandığında (B2) erişilir ve o an pişer.
 */
export function getLensTables(): LensTables {
  if (!cachedDefl) cachedDefl = makeTexture(bakeDeflection(), DEFL_W, DEFL_H)
  return {
    deflection: cachedDefl,
    get inverseRadius(): THREE.DataTexture {
      if (!cachedInvR) cachedInvR = makeTexture(bakeInverseRadius(), INVR_W, INVR_H)
      return cachedInvR
    },
  }
}
