import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BodyBuild } from '../types'

/**
 * Endurance: dönen halka istasyon (Interstellar). Halka XZ düzleminde yatar,
 * spin ekseni +Y — yörünge düzleminden bakan pod, halkanın dönüşünü cepheden
 * görür. Dönüş fazı eşleme mekaniği (M3) bu spinPhase üzerinden okunacak.
 *
 * Görsel referans: filmdeki üstten kadraj — 12 kutu modül dönüşümlü iki tipte
 * (güneş paneli şeritli / düz kaportalı), aralarında silindirik kenetlenme
 * boğumları, merkezde 4 kollu çapraz göbek ve halkaya inen ince ispitler.
 * ~150 parça geometrisi malzeme başına TEK mesh'te birleştirilir (5 draw
 * call) — ayrı mesh'ler bu sahnede ölçülebilir fps yerdi.
 */

type Geos = THREE.BufferGeometry[]

function mat(x: number, y: number, z: number, ry = 0): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z)
}

/** geo'yu ebeveyn çerçevesindeki (lx,ly,lz) yerel konumuna taşıyıp listeye ekler */
function put(list: Geos, geo: THREE.BufferGeometry, parent: THREE.Matrix4, lx = 0, ly = 0, lz = 0): void {
  geo.applyMatrix4(new THREE.Matrix4().setPosition(lx, ly, lz).premultiply(parent))
  list.push(geo)
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d)
}

/** ekseni yerel X'e yatırılmış silindir (boğumlar, göbek kolları) */
function tubeX(r: number, len: number, seg = 10): THREE.BufferGeometry {
  const c = new THREE.CylinderGeometry(r, r, len, seg)
  c.rotateZ(Math.PI / 2)
  return c
}

export function makeEndurance(): BodyBuild {
  const g = new THREE.Group()
  const hullA: Geos = [] // panelli modül gövdeleri (parlak beyaz)
  const hullB: Geos = [] // düz modül gövdeleri (bir ton koyu — dönüşüm uzaktan okunsun)
  const solar: Geos = [] // koyu güneş paneli / pencere şeritleri
  const grey: Geos = [] // boğumlar, çerçeveler, göbek, ispitler

  const R = 0.085
  const modL = 0.033 // teğet
  const modH = 0.016 // spin ekseni (Y)
  const modW = 0.018 // radyal

  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2
    // ry = π/2 − ang: yerel +X teğet, +Z radyal DIŞARI (pencereler dışa baksın)
    const m = mat(R * Math.cos(ang), 0, R * Math.sin(ang), Math.PI / 2 - ang)
    const solarType = i % 2 === 0
    put(solarType ? hullA : hullB, box(modL, modH, modW), m)
    // uç çerçeveleri: modül gövdesini saran ince kuşaklar
    for (const lx of [-0.0145, 0.0145]) put(grey, box(0.0016, modH + 0.0015, modW + 0.0015), m, lx)
    if (solarType) {
      // ±Y yüzlerinde ikişer koyu panel şeridi + dışa bakan pencere bandı
      for (const ly of [-1, 1])
        for (const lz of [-0.0045, 0.0045])
          put(solar, box(0.026, 0.0009, 0.005), m, 0, ly * (modH / 2 + 0.0005), lz)
      put(solar, box(0.014, 0.005, 0.0009), m, 0, 0, modW / 2 + 0.0005)
    } else {
      // düz modül: iki ara panel çizgisi + dışa bakan üç küçük pencere
      for (const lx of [-0.0055, 0.0055]) put(grey, box(0.0012, modH + 0.001, modW + 0.001), m, lx)
      for (const lx of [-0.006, 0, 0.006])
        put(solar, box(0.0025, 0.0025, 0.0009), m, lx, 0, modW / 2 + 0.0005)
    }
  }

  // modüller arası kenetlenme boğumları (yarım açılarda): tüp + bilezik
  for (let i = 0; i < 12; i++) {
    const ang = ((i + 0.5) / 12) * Math.PI * 2
    const m = mat(R * Math.cos(ang), 0, R * Math.sin(ang), Math.PI / 2 - ang)
    put(grey, tubeX(0.0034, 0.0115), m)
    put(grey, tubeX(0.0046, 0.0032), m)
  }

  // merkez göbek: Y eksenli çekirdek + 4 kollu çapraz (kol yönü yerel +X)
  const hubC = mat(0, 0, 0)
  put(grey, new THREE.CylinderGeometry(0.0065, 0.0065, 0.014, 12), hubC)
  for (const ly of [-0.0085, 0.0085]) put(grey, new THREE.CylinderGeometry(0.004, 0.004, 0.003, 10), hubC, 0, ly)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    const m = mat(0, 0, 0, -a)
    put(grey, tubeX(0.0027, 0.032), m, 0.02)
    for (const d of [0.012, 0.028]) put(grey, tubeX(0.0039, 0.004), m, d)
    if (k % 2 === 1) put(hullB, box(0.009, 0.009, 0.009), m, 0.022)
    put(hullA, tubeX(0.005, 0.011), m, 0.039)
    put(grey, tubeX(0.0033, 0.0028, 8), m, 0.0455)
    // koldan halkaya inen ince ispit (filmdeki merdiven kafesi)
    put(grey, tubeX(0.0012, 0.03, 6), m, 0.061)
  }

  const parts: Array<[Geos, THREE.MeshStandardMaterial]> = [
    [hullA, new THREE.MeshStandardMaterial({ color: 0xdedbd4, roughness: 0.5, metalness: 0.35 })],
    [hullB, new THREE.MeshStandardMaterial({ color: 0xc9c5bd, roughness: 0.55, metalness: 0.35 })],
    [solar, new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.3, metalness: 0.75 })],
    [grey, new THREE.MeshStandardMaterial({ color: 0x8f8b83, roughness: 0.55, metalness: 0.5 })],
  ]
  for (const [list, matl] of parts) {
    const merged = mergeGeometries(list)
    if (merged) g.add(new THREE.Mesh(merged, matl))
  }

  // oyun kadrajında küçük kalıyordu: ×1.5 (size da orantılı büyür)
  g.scale.setScalar(1.5)
  const w = new THREE.Group()
  w.add(g)
  // filmdeki tempoya yakın belirgin bir dönüş; M3'te faz eşlemenin hedefi
  return { group: w, size: 0.3, spinAxis: new THREE.Vector3(0, 1, 0), spinRate: 0.55 }
}
