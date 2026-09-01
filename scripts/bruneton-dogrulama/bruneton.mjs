// Bruneton (arXiv:2010.08735) tablo yönteminin Node portu — doğrulama koşumu.
// Referans uygulama BSD-3-Clause, Copyright (c) 2020 Eric Bruneton.
// Birimler: r_s = 1 (u'' = 1.5u^2 - u), bizim shader'ımızla aynı.

export const KMU = 4 / 27;
export const DW = 512, DH = 512, IW = 64, IH = 32;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function uApsis(e2) {
  const x = clamp((2 / KMU) * e2 - 1, -1, 1);
  return 1 / 3 + (2 / 3) * Math.sin(Math.asin(x) / 3);
}
export function deflTexU(e2) {
  return e2 < KMU
    ? 0.5 - Math.sqrt(-Math.log(1 - e2 / KMU) / 50)
    : 0.5 + Math.sqrt(-Math.log(1 - KMU / e2) / 50);
}
export function deflTexUInv(tu) {
  const x = 1 - Math.exp(-50 * (tu - 0.5) * (tu - 0.5));
  return tu < 0.5 ? KMU * x : KMU / x;
}
export function deflTexV(e2, u) {
  if (e2 > KMU) {
    const x = u < 2 / 3 ? -Math.sqrt(2 / 3 - u) : Math.sqrt(u - 2 / 3);
    return (Math.sqrt(2 / 3) + x) / (Math.sqrt(2 / 3) + Math.sqrt(1 / 3));
  }
  return 1 - Math.sqrt(Math.max(1 - u / uApsis(e2), 0));
}
export const texCoord = (x, n) => 0.5 / n + x * (1 - 1 / n);
export const phiUb = (e2) => (1 + e2) / (1 / 3 + 2 * e2 * Math.sqrt(e2));
export const invRadTexU = (e2) => 1 / (1 + 6 * e2);
export const invRadTexUInv = (tu) => (1 / tu - 1) / 6;

// ---- tablo ön hesabı (ComputeRayDeflectionTexture birebir) ----
export function buildDeflectionTable() {
  const data = new Float32Array(DW * DH * 2);
  const set = (i, k, a, t) => { data[(k * DW + i) * 2] = a; data[(k * DW + i) * 2 + 1] = t; };
  for (let i = 0; i < DW; i++) {
    const e2 = deflTexUInv(i / (DW - 1));
    const e = Math.sqrt(e2);
    let t = 0, u = 0, ud = e, phi = 0;
    const dphi = 1e-5;
    let pDefl = 0, pT = 0, pJ = 0;
    set(i, 0, 0, 0);
    for (;;) {
      if (u >= 1 || ud < 0) { set(i, DH - 1, pDefl, pT); break; }
      const defl = phi - Math.atan2(u, ud);
      const j = deflTexV(e2, u) * (DH - 1);
      const k0 = Math.ceil(pJ), k1 = Math.ceil(j);
      for (let k = k0; k < k1; k++) {
        const l = (k - pJ) / (j - pJ);
        set(i, k, pDefl * (1 - l) + defl * l, pT * (1 - l) + t * l);
      }
      pDefl = defl; pT = t; pJ = j;
      if (u > 1e-2) t += (e / (u * u * (1 - u))) * dphi;
      ud += (1.5 * u * u - u) * dphi;
      u += ud * dphi;
      phi += dphi;
    }
  }
  return data;
}

export function buildInverseRadiusTable() {
  const data = new Float32Array(IW * IH * 2);
  const set = (i, k, a, t) => { data[(k * IW + i) * 2] = a; data[(k * IW + i) * 2 + 1] = t; };
  for (let i = 0; i < IW; i++) {
    const e2 = invRadTexUInv(clamp(i / (IW - 1), 0.001, 0.999));
    const e = Math.sqrt(e2);
    const pub = phiUb(e2);
    let t = 0, u = 0, ud = e, phi = 0;
    const dphi = 1e-5;
    let pU = 0, pT = 0, pJ = 0;
    set(i, 0, 0, 0);
    for (;;) {
      const j = (phi / pub) * (IH - 1);
      const k0 = Math.ceil(pJ), k1 = Math.min(Math.ceil(j), IH);
      for (let k = k0; k < k1; k++) {
        const l = (k - pJ) / (j - pJ);
        set(i, k, pU * (1 - l) + u * l, pT * (1 - l) + t * l);
      }
      if (k1 === IH) break;
      pU = u; pT = t; pJ = j;
      if (u > 1e-2) t += (e / (u * u * (1 - u))) * dphi;
      ud += (1.5 * u * u - u) * dphi;
      u += ud * dphi;
      phi += dphi;
    }
  }
  return data;
}

// ---- GL texture() eşdeğeri: bilinear, kenarda clamp ----
export function sample2(data, W, H, tu, tv) {
  const x = tu * W - 0.5, y = tv * H - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const cx = (i) => clamp(i, 0, W - 1), cy = (j) => clamp(j, 0, H - 1);
  const at = (i, j, c) => data[(cy(j) * W + cx(i)) * 2 + c];
  const out = [0, 0];
  for (let c = 0; c < 2; c++) {
    out[c] = at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy)
           + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy;
  }
  return out;
}

// ---- TraceRay'in sapma kısmı ----
export function tableDeflection(D, u, ud, e2) {
  if (e2 < KMU && u > 2 / 3) return -1;
  const tu = texCoord(deflTexU(e2), DW);
  const tv = texCoord(deflTexV(e2, u), DH);
  const tvA = texCoord(1, DH);
  const apsis = sample2(D, DW, DH, tu, tvA);
  const defl = sample2(D, DW, DH, tu, tv);
  let rd = defl[0];
  if (ud > 0) rd = e2 < KMU ? 2 * apsis[0] - rd : -1;
  return rd;
}

// ---- yüksek doğrulukta referans: RK4, u'' = 1.5u^2 - u ----
export function refEscapeAngle(u0, ud0, h = 1e-3, phiMax = 400) {
  let u = u0, ud = ud0, phi = 0;
  const f = (u, ud) => [ud, 1.5 * u * u - u];
  while (phi < phiMax) {
    if (u >= 1) return null;                 // yakalandı
    const [k1u, k1d] = f(u, ud);
    const [k2u, k2d] = f(u + h / 2 * k1u, ud + h / 2 * k1d);
    const [k3u, k3d] = f(u + h / 2 * k2u, ud + h / 2 * k2d);
    const [k4u, k4d] = f(u + h * k3u, ud + h * k3d);
    const nu = u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u);
    const nd = ud + h / 6 * (k1d + 2 * k2d + 2 * k3d + k4d);
    if (nu <= 0) {                            // u = 0'a doğrusal ara değer
      return phi + h * (u / (u - nu));
    }
    u = nu; ud = nd; phi += h;
  }
  return null;
}

// ---- RK4 varyantı: referans uygulama düz Euler + dφ=1e-5 kullanıyor (6 sn).
// RK4 ile çok daha büyük adım aynı doğruluğu vermeli — açılışta pişirilebilir.
export function buildDeflectionTableRK4(dphi = 1e-3) {
  const data = new Float32Array(DW * DH * 2);
  const set = (i, k, a, t) => { data[(k * DW + i) * 2] = a; data[(k * DW + i) * 2 + 1] = t; };
  const f = (u, ud) => [ud, 1.5 * u * u - u];
  for (let i = 0; i < DW; i++) {
    const e2 = deflTexUInv(i / (DW - 1));
    const e = Math.sqrt(e2);
    let t = 0, u = 0, ud = e, phi = 0;
    let pDefl = 0, pT = 0, pJ = 0;
    set(i, 0, 0, 0);
    for (;;) {
      if (u >= 1 || ud < 0) { set(i, DH - 1, pDefl, pT); break; }
      const defl = phi - Math.atan2(u, ud);
      const j = deflTexV(e2, u) * (DH - 1);
      const k0 = Math.ceil(pJ), k1 = Math.ceil(j);
      for (let k = k0; k < k1; k++) {
        const l = (k - pJ) / (j - pJ);
        set(i, k, pDefl * (1 - l) + defl * l, pT * (1 - l) + t * l);
      }
      pDefl = defl; pT = t; pJ = j;
      const h = dphi;
      // t integrali de RK4 ile: dt/dφ = e/(u²(1-u))
      const g = (u) => (u > 1e-2 ? e / (u * u * (1 - u)) : 0);
      const [a1, b1] = f(u, ud);
      const [a2, b2] = f(u + h/2*a1, ud + h/2*b1);
      const [a3, b3] = f(u + h/2*a2, ud + h/2*b2);
      const [a4, b4] = f(u + h*a3, ud + h*b3);
      const um = u + h/2*a2;
      t += h/6 * (g(u) + 4*g(um) + g(u + h*a3));
      u += h/6 * (a1 + 2*a2 + 2*a3 + a4);
      ud += h/6 * (b1 + 2*b2 + 2*b3 + b4);
      phi += h;
    }
  }
  return data;
}

// ---- Uyarlanabilir RK4: adım, TABLO SATIRINA göre seçilir.
// Anahtar gözlem: max hatayı ODE mertebesi değil, ardışık örnekler arasındaki
// satır doldurmanın doğrusal ara değeri belirliyor. Referans uygulama bunu
// çok küçük sabit adımla (Euler, dφ=1e-5) çözüyor — 6 sn. Adımı "j en fazla
// maxRows satır ilerlesin" koşuluna bağlarsak aynı yoğunluğu çok daha ucuza
// alırız: düz bölgede büyük adım, apsis civarında küçük.
export function buildDeflectionTableAdaptive(maxRows = 0.5, hMax = 0.05) {
  const data = new Float32Array(DW * DH * 2);
  const set = (i, k, a, t) => { data[(k * DW + i) * 2] = a; data[(k * DW + i) * 2 + 1] = t; };
  const f = (u, ud) => [ud, 1.5 * u * u - u];
  let steps = 0;
  for (let i = 0; i < DW; i++) {
    const e2 = deflTexUInv(i / (DW - 1));
    const e = Math.sqrt(e2);
    const g = (u) => (u > 1e-2 ? e / (u * u * (1 - u)) : 0);
    let t = 0, u = 0, ud = e, phi = 0, h = 1e-3;
    let pDefl = 0, pT = 0, pJ = 0;
    set(i, 0, 0, 0);
    for (;;) {
      if (u >= 1 || ud < 0) { set(i, DH - 1, pDefl, pT); break; }
      const defl = phi - Math.atan2(u, ud);
      const j = deflTexV(e2, u) * (DH - 1);
      const k0 = Math.ceil(pJ), k1 = Math.ceil(j);
      for (let k = k0; k < k1; k++) {
        const l = (k - pJ) / (j - pJ);
        set(i, k, pDefl * (1 - l) + defl * l, pT * (1 - l) + t * l);
      }
      pDefl = defl; pT = t; pJ = j;
      // adayı dene; satır sıçraması büyükse adımı küçült ve TEKRARLA
      for (;;) {
        const [a1, b1] = f(u, ud);
        const [a2, b2] = f(u + h/2*a1, ud + h/2*b1);
        const [a3, b3] = f(u + h/2*a2, ud + h/2*b2);
        const [a4, b4] = f(u + h*a3, ud + h*b3);
        const nu = u + h/6*(a1 + 2*a2 + 2*a3 + a4);
        const nd = ud + h/6*(b1 + 2*b2 + 2*b3 + b4);
        steps++;
        // Sonlandıran adım (apsis ya da ufuk) RAFİNE EDİLMELİ: büyük bir adım
        // apsisi aşarsa pJ ile son satır arasındaki satırlar hiç doldurulmaz ve
        // orada tablo sıfır kalır. Max hatayı belirleyen tek şey buydu.
        if (nu >= 1 || nd < 0) {
          if (h > 1e-5) { h *= 0.5; continue; }
          u = nu; ud = nd; break;
        }
        const nj = deflTexV(e2, nu) * (DH - 1);
        if (Math.abs(nj - j) > maxRows && h > 1e-6) { h *= 0.5; continue; }
        t += h/6 * (g(u) + 4*g(u + h/2*a2) + g(u + h*a3));
        u = nu; ud = nd; phi += h;
        if (Math.abs(nj - j) < maxRows * 0.25) h = Math.min(h * 2, hMax);
        break;
      }
    }
  }
  return { data, steps };
}

// ═══ FAZ B3: 𝕌 tablosunun φ EKSENİ BİZİM ═══════════════════════════════
// Bruneton'un phi_ub'si apsisi olmayan (e² ≥ KMU, yani YAKALANAN) ışınlarda
// ufka varmadan kesiliyor — ölçüldü (phiaralik.mjs): gölge önündeki disk
// kesişimlerinin %34'ü kapsam dışında kalıyor, o pikseller marşa düşüyor.
//
// Doğru eksen tavanı φ_end: ışının sonsuzdan APSİSE (e²<KMU) ya da UFKA
// (e²≥KMU) varana dek süpürdüğü açı. YENİ TABLOYA GEREK YOK — 𝔻'nin son
// satırındaki Δ_son'dan analitik çıkar, çünkü Δ = φ − atan2(u, u̇):
//   • apsis: u̇ = 0        → φ_a = Δ_son + π/2
//   • ufuk : u = 1, u̇ = e → φ_h = Δ_son + atan2(1, e)
// (u̇² = e² + u³ − u², u=1'de u̇² = e².)
export function phiEndFromDefl(e2, deflEnd) {
  return deflEnd + (e2 < KMU ? Math.PI / 2 : Math.atan2(1, Math.sqrt(e2)));
}
/** 𝔻'nin son satırı — shader'daki tableRaw'ın 'apsis' çıkışıyla birebir */
export function deflEndOf(D, e2) {
  return sample2(D, DW, DH, texCoord(deflTexU(e2), DW), texCoord(1, DH))[0];
}

/**
 * 𝕌'yu φ ∈ [0, Φ] üstünde pişirir; Φ = min(φ_end(e²), cap).
 *
 * Φ, 𝔻 DOKUSUNDAN okunur (analitik φ_end'den değil): shader de öyle okuyacak,
 * iki taraf birebir aynı ekseni kullanmalı yoksa satır eşlemesi kayar.
 *
 * Satır ekseni φ'de DOĞRUSAL olduğu için 𝔻'deki uyarlanabilir adım gerekmez —
 * sabit h = maxRows·Φ/(H−1) zaten satır başına sabit yoğunluk verir. Doğruluğu
 * ODE mertebesi değil satır doldurmanın doğrusal ara değeri sınırlar (𝔻 dersi).
 *
 * cap: φ_end e² → KMU'da IRAKSAR (ışın foton küresinde dolanır). Kapaklanan
 * sütunlarda tablo ufka/apsise ULAŞMAZ; shader bunu bilmeli ve o pikselleri
 * marşa bırakmalı (capped bayrağı).
 */
export function buildInverseRadiusTableB3(D, opts = {}) {
  const { W = IW, H = IH, cap = 8, maxRows = 0.125 } = opts;
  const data = new Float32Array(W * H * 2);
  const set = (i, k, a, t) => { data[(k * W + i) * 2] = a; data[(k * W + i) * 2 + 1] = t; };
  const f = (u, ud) => [ud, 1.5 * u * u - u];
  for (let i = 0; i < W; i++) {
    // SÜTUN EKSENİ 𝔻'ninkiyle AYNI (deflTexU): KMU'yu dokunun İKİ UCUNA
    // koyar, böylece bilineer aradeğerleme apsisli bir sütunla apsissiz bir
    // sütunu ASLA karıştırmaz. Eski 1/(1+6e²) ekseninde KMU tam ortadaydı ve
    // komşu iki sütun (e²=0.1492 ufuk / e²=0.1449 apsis) karışıyordu: yön
    // hatası 100°'ye çıkıyordu (ölçüldü, b3shader.mjs). Yan fayda: çözünürlük
    // KMU çevresinde yoğunlaşır — u(φ)'nin en hızlı değiştiği yer orası.
    const e2 = deflTexUInv(i / (W - 1));
    const e = Math.sqrt(e2);
    const PH = Math.min(phiEndFromDefl(e2, deflEndOf(D, e2)), cap);
    const uEnd = e2 < KMU ? uApsis(e2) : 1;
    const g = (u) => (u > 1e-2 ? e / (u * u * (1 - u)) : 0);
    const h0 = (maxRows * PH) / (H - 1);
    let u = 0, ud = e, phi = 0, t = 0, h = h0;
    let pU = 0, pT = 0, pJ = 0;
    set(i, 0, 0, 0);
    for (;;) {
      const j = (phi / PH) * (H - 1);
      const k1 = Math.min(Math.ceil(j), H);
      for (let k = Math.ceil(pJ); k < k1; k++) {
        const l = (k - pJ) / (j - pJ);
        set(i, k, pU * (1 - l) + u * l, pT * (1 - l) + t * l);
      }
      if (k1 >= H) break;
      pU = u; pT = t; pJ = j;
      // uç noktayı AŞAN adım rafine edilir (𝔻'deki aynı kritik ayrıntı):
      // aşılırsa son satırlar hiç doldurulmaz ve tabloda sıfır kalır.
      let bitti = false;
      for (;;) {
        const [a1, b1] = f(u, ud);
        const [a2, b2] = f(u + h / 2 * a1, ud + h / 2 * b1);
        const [a3, b3] = f(u + h / 2 * a2, ud + h / 2 * b2);
        const [a4, b4] = f(u + h * a3, ud + h * b3);
        const nu = u + h / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
        const nd = ud + h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
        if (nu >= uEnd || nd < 0) {
          if (h > 1e-7) { h *= 0.5; continue; }
          bitti = true; break;
        }
        t += h / 6 * (g(u) + 4 * g(u + h / 2 * a2) + g(u + h * a3));
        u = nu; ud = nd; phi += h; h = h0;
        break;
      }
      if (bitti) {                       // apsise/ufka varıldı: kalanı uçla doldur
        for (let k = Math.ceil(pJ); k < H; k++) set(i, k, uEnd, t);
        break;
      }
    }
  }
  return data;
}
