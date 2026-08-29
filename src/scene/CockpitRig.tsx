import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { GameController, GameHud } from '../game/GameController'
import { useGameSnapshot } from '../hooks/useGameSnapshot'

/**
 * Oyun POV'u: GERÇEK 3B kokpit konsolu. Kameraya kilitli bir kök grup her
 * karede kamera pozunu kopyalar (GameCamera'dan SONRA, priority 1 — titreme
 * olmaz); içindeki eğik güverte gerçek perspektif ve sahne ışığıyla çizilir
 * (delik merkezindeki turuncu nokta ışık + kafa feneri konsolu doğal
 * aydınlatır). Üst HUD'daki dinamik sayaçlar kokpit ekranlarına da canlı
 * işlenir: sol MFD seyrüsefer (MESAFE/KAPANMA/YAKIT), sağ MFD kenetlenme
 * merdiveni (SEN r / END r / ISCO), orta panel yakıt segmanları + İTKİ +
 * uyarı lambaları (CanvasTexture, ~8 Hz). Kadran ibreleri her kare yumuşak
 * döner. Statik gövde malzeme başına TEK mesh'te birleşik — toplam ~15 draw
 * call. Ekran kapladığı alan alt ~%20 (orta yükselti biraz üstüne taşar).
 */

// ── yerleşim: güverte kamera-yerel uzayda eğik durur (gerçek derinlik).
// Konum, orta yükselti sırtı ekranın alt ~%20'sine gelecek şekilde seçildi
// (fov 55: yarı-yükseklik tanı 0.5206) — ekran görüntüsüyle doğrulanır.
const DECK_POS = new THREE.Vector3(0, -0.47, -0.95)
const DECK_TILT = 0.55 // rad — üst yüzey pilota bakar
const REDRAW_DT = 0.12 // ekran canvas'ları ~8 Hz tazelenir (yeterli, ucuz)

function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(rx, ry, rz))
    .setPosition(x, y, z)
}

function addBox(list: THREE.BufferGeometry[], w: number, h: number, d: number, m: THREE.Matrix4): void {
  const g = new THREE.BoxGeometry(w, h, d)
  g.applyMatrix4(m)
  list.push(g)
}

type Screen = {
  ctx: CanvasRenderingContext2D
  tex: THREE.CanvasTexture
  w: number
  h: number
}

function makeScreen(w: number, h: number): Screen {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  return { ctx, tex, w, h }
}

const CYAN = '#57c8ea'
const AMBER = '#ffa15c'
const GREEN = '#78dc82'
const RED = '#ff5a48'
const MUTED = 'rgba(150,180,200,0.55)'

/** sol MFD: seyrüsefer — MESAFE / KAPANMA / YAKIT çubuğu */
function drawNav(s: Screen, hud: GameHud | null): void {
  const { ctx, w, h } = s
  ctx.fillStyle = '#041018'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(87,200,234,0.12)'
  ctx.lineWidth = 1
  for (let y = 28; y < h; y += 28) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.fillStyle = MUTED
  ctx.font = '600 22px monospace'
  ctx.fillText('SEYRÜSEFER', 20, 34)
  ctx.strokeStyle = 'rgba(87,200,234,0.4)'
  ctx.beginPath()
  ctx.moveTo(20, 44)
  ctx.lineTo(w - 20, 44)
  ctx.stroke()
  ctx.font = '600 20px monospace'
  ctx.fillStyle = MUTED
  ctx.fillText('MESAFE', 20, 80)
  ctx.fillText('KAPANMA', 266, 80)
  ctx.font = '700 46px monospace'
  if (hud) {
    ctx.fillStyle = CYAN
    ctx.fillText(`${hud.sep.toFixed(2)}`, 20, 126)
    ctx.font = '600 20px monospace'
    ctx.fillText('r₊', 20 + ctx.measureText(hud.sep.toFixed(2)).width * 2.1, 126)
    ctx.font = '700 46px monospace'
    ctx.fillStyle = hud.closure > 0 ? GREEN : RED
    ctx.fillText(`${hud.closure >= 0 ? '+' : ''}${hud.closure.toFixed(3)}c`, 266, 126)
  } else {
    ctx.fillStyle = MUTED
    ctx.fillText('--.--', 126, 126)
  }
  ctx.font = '600 20px monospace'
  ctx.fillStyle = MUTED
  ctx.fillText('YAKIT', 20, 176)
  ctx.strokeStyle = 'rgba(87,200,234,0.5)'
  ctx.strokeRect(20, 190, w - 40, 34)
  if (hud) {
    ctx.fillStyle = hud.fuel < 0.25 ? RED : CYAN
    ctx.fillRect(24, 194, (w - 48) * Math.max(0, hud.fuel), 26)
    ctx.fillStyle = '#041018'
    ctx.font = '700 24px monospace'
    const pct = `%${Math.round(hud.fuel * 100)}`
    if (hud.fuel > 0.18) ctx.fillText(pct, 30, 214)
    else {
      ctx.fillStyle = RED
      ctx.fillText(pct, 34 + (w - 48) * hud.fuel, 214)
    }
  }
}

/** sağ MFD: kenetlenme merdiveni — ISCO / SEN r / END r düşey skalada */
function drawDock(s: Screen, hud: GameHud | null): void {
  const { ctx, w, h } = s
  ctx.fillStyle = '#140e06'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = MUTED
  ctx.font = '600 22px monospace'
  ctx.fillText('KENETLENME', 20, 34)
  ctx.strokeStyle = 'rgba(255,161,92,0.4)'
  ctx.beginPath()
  ctx.moveTo(20, 44)
  ctx.lineTo(w - 20, 44)
  ctx.stroke()
  if (!hud) {
    ctx.fillStyle = MUTED
    ctx.font = '700 40px monospace'
    ctx.fillText('BEKLEMEDE', 130, 160)
    return
  }
  // düşey yarıçap merdiveni: yukarı = dışarı (yüksek r)
  const rTop = Math.max(hud.podR, hud.endR) + 1.6
  const rBot = Math.min(hud.isco * 0.85, hud.podR - 0.5)
  const yOf = (r: number): number => 66 + ((rTop - r) / (rTop - rBot)) * (h - 96)
  const lx = 92
  ctx.strokeStyle = 'rgba(255,161,92,0.5)'
  ctx.beginPath()
  ctx.moveTo(lx, 60)
  ctx.lineTo(lx, h - 26)
  ctx.stroke()
  // ISCO: kesikli kırmızı taban çizgisi
  const yIsco = yOf(hud.isco)
  ctx.strokeStyle = RED
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(28, yIsco)
  ctx.lineTo(w - 150, yIsco)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = RED
  ctx.font = '600 20px monospace'
  ctx.fillText(`ISCO ${hud.isco.toFixed(1)}`, w - 140, yIsco + 7)
  // END: amber marker
  const yEnd = yOf(hud.endR)
  ctx.fillStyle = AMBER
  ctx.beginPath()
  ctx.moveTo(lx - 14, yEnd)
  ctx.lineTo(lx, yEnd - 9)
  ctx.lineTo(lx + 14, yEnd)
  ctx.lineTo(lx, yEnd + 9)
  ctx.closePath()
  ctx.fill()
  ctx.font = '700 26px monospace'
  ctx.fillText(`END ${hud.endR.toFixed(1)}`, lx + 30, yEnd + 9)
  // SEN: camgöbeği ok + eğilim (etiket END ile çakışırsa aşağı kaydır)
  const ySen = yOf(hud.podR)
  const ySenLabel = Math.abs(ySen - yEnd) < 28 ? yEnd + 30 : ySen
  ctx.fillStyle = CYAN
  ctx.beginPath()
  ctx.moveTo(lx - 16, ySen - 10)
  ctx.lineTo(lx + 16, ySen)
  ctx.lineTo(lx - 16, ySen + 10)
  ctx.closePath()
  ctx.fill()
  const trend = hud.vr > 0.01 ? '↑' : hud.vr < -0.01 ? '↓' : '·'
  ctx.font = '700 26px monospace'
  ctx.fillText(`SEN ${hud.podR.toFixed(1)} ${trend}`, lx + 30, ySenLabel + 9)
}

/** orta panel: yakıt segmanları + İTKİ + uyarı lambaları */
function drawCore(s: Screen, hud: GameHud | null): void {
  const { ctx, w, h } = s
  ctx.fillStyle = '#050608'
  ctx.fillRect(0, 0, w, h)
  const lit = hud ? Math.round(hud.fuel * 12) : 0
  for (let i = 0; i < 12; i++) {
    const on = i < lit
    ctx.fillStyle = on ? (i < 3 ? RED : i < 6 ? AMBER : '#ff7a5e') : '#2a1214'
    ctx.fillRect(28 + i * 40, 24, 30, h - 48)
    if (on) {
      ctx.fillStyle = 'rgba(255,90,72,0.25)'
      ctx.fillRect(24 + i * 40, 18, 38, h - 36)
    }
  }
  ctx.fillStyle = MUTED
  ctx.font = '600 24px monospace'
  ctx.fillText('YAKIT', 540, h / 2 + 8)
  // İTKİ göstergesi
  const th = hud?.thrust ?? 0
  ctx.font = '700 44px monospace'
  ctx.fillStyle = th > 0 ? GREEN : th < 0 ? AMBER : 'rgba(150,180,200,0.35)'
  ctx.fillText(th > 0 ? '▲ W' : th < 0 ? '▼ S' : '— İTKİ', 660, h / 2 + 14)
  // uyarı lambaları: HIZ (temas zarfında hızlı) + ISCO yakınlığı
  const fast = !!hud && hud.sep < 1.5 && hud.closure > 0.008
  const low = !!hud && hud.podR < hud.isco * 1.15
  for (const [x, on, label] of [
    [860, fast, 'HIZ'],
    [944, low, 'ISCO'],
  ] as const) {
    ctx.fillStyle = on ? RED : '#241012'
    ctx.fillRect(x, 22, 72, h - 44)
    ctx.fillStyle = on ? '#1a0505' : 'rgba(150,180,200,0.3)'
    ctx.font = '700 24px monospace'
    ctx.fillText(label, x + 10, h / 2 + 8)
  }
}

type Rig = {
  root: THREE.Group
  /** kare-başı iş: poz senkronu, ibreler, ekran tazeleme, görünürlük.
   * Mutasyonlar bu closure'da yaşar — hook kapsamı dışında (lint dersi). */
  tick: (camera: THREE.Camera, hud: GameHud | null, delta: number, visible: boolean) => void
}

function buildRig(): Rig {
  const root = new THREE.Group()
  root.visible = false
  const deck = new THREE.Group()
  deck.position.copy(DECK_POS)
  deck.rotation.x = DECK_TILT
  root.add(deck)
  const needles: Array<{ pivot: THREE.Object3D; value: (hud: GameHud | null) => number }> = []
  const screens: Array<{ s: Screen; draw: (s: Screen, hud: GameHud | null) => void }> = []

  const charcoal: THREE.BufferGeometry[] = []
  const housing: THREE.BufferGeometry[] = []
  const trim: THREE.BufferGeometry[] = []
  const dark: THREE.BufferGeometry[] = []

  // güverte: kenardan kenara (kanat denendi — köşelerde havada duran
  // çubuklar gibi okundu, kaldırıldı). Aletler uzak yarıda oturur: yakın
  // kenar perspektifte ekran altına düşer, oraya konan her şey kesilir.
  addBox(charcoal, 3.0, 0.05, 0.36, mat(0, -0.025, 0))
  // orta yükselti: gövde + V pahları
  addBox(housing, 0.52, 0.075, 0.2, mat(0, 0.0375, -0.09))
  addBox(housing, 0.11, 0.075, 0.2, mat(-0.295, 0.028, -0.09, 0, 0, 0.5))
  addBox(housing, 0.11, 0.075, 0.2, mat(0.295, 0.028, -0.09, 0, 0, -0.5))
  // metalik pervazlar: uzak kenar + yükselti sırtı + pah sırtları
  addBox(trim, 3.0, 0.028, 0.03, mat(0, 0.012, -0.19))
  addBox(trim, 0.54, 0.022, 0.028, mat(0, 0.082, -0.175))
  addBox(trim, 0.125, 0.022, 0.028, mat(-0.3, 0.062, -0.175, 0, 0, 0.5))
  addBox(trim, 0.125, 0.022, 0.028, mat(0.3, 0.062, -0.175, 0, 0, -0.5))
  // anahtar bankları (iki yanda 2×3)
  for (const sx of [-1, 1])
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 2; r++)
        addBox(dark, 0.026, 0.016, 0.032, mat(sx * (0.17 + c * 0.045), 0.008, 0.03 + r * 0.05))
  // gaz kolu rayları + kollar
  for (const sx of [-1, 1]) {
    addBox(dark, 0.032, 0.018, 0.16, mat(sx * 0.7, 0.009, 0.02))
    addBox(trim, 0.05, 0.03, 0.035, mat(sx * 0.7, 0.028, 0.0, -0.25))
  }

  const matCharcoal = new THREE.MeshStandardMaterial({ color: 0x1c2330, roughness: 0.55, metalness: 0.35 })
  const matHousing = new THREE.MeshStandardMaterial({ color: 0x242e3c, roughness: 0.5, metalness: 0.4 })
  const matTrim = new THREE.MeshStandardMaterial({ color: 0x8a97ab, roughness: 0.4, metalness: 0.6 })
  const matDark = new THREE.MeshStandardMaterial({ color: 0x0c1015, roughness: 0.6, metalness: 0.3 })
  for (const [list, m] of [
    [charcoal, matCharcoal],
    [housing, matHousing],
    [trim, matTrim],
    [dark, matDark],
  ] as const) {
    const merged = mergeGeometries(list)
    if (merged) deck.add(new THREE.Mesh(merged, m))
  }

  // LED noktaları (sabit; emissive okunaklılık için basic malzeme)
  const ledGeo = (xs: number[], color: number): void => {
    const g: THREE.BufferGeometry[] = []
    for (const x of xs) addBox(g, 0.016, 0.01, 0.016, mat(x, 0.008, -0.005))
    const merged = mergeGeometries(g)
    if (merged) deck.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color })))
  }
  ledGeo([-0.29, 0.2], 0x78dc82)
  ledGeo([-0.245, -0.155, 0.245], 0xff5a48)
  ledGeo([-0.2, 0.155, 0.29], 0xffa15c)
  // (LED sırası anahtar banklarının hemen önünde: z = -0.005)

  // MFD'ler: pahlı çerçeve + içe/öne eğik canlı ekran
  const bezelGeo = new THREE.BoxGeometry(0.46, 0.035, 0.3)
  const insetGeo = new THREE.BoxGeometry(0.4, 0.008, 0.24)
  const screenGeo = new THREE.PlaneGeometry(0.38, 0.22)
  for (const [sx, draw] of [
    [-1, drawNav],
    [1, drawDock],
  ] as const) {
    const grp = new THREE.Group()
    grp.position.set(sx * 0.47, 0.012, -0.05)
    grp.rotation.set(0.28, sx * -0.3, 0)
    const bezel = new THREE.Mesh(bezelGeo, matHousing)
    const inset = new THREE.Mesh(insetGeo, matDark)
    inset.position.y = 0.016
    const s = makeScreen(512, 288)
    const screen = new THREE.Mesh(
      screenGeo,
      new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false }),
    )
    screen.rotation.x = -Math.PI / 2
    screen.position.y = 0.022
    grp.add(bezel, inset, screen)
    deck.add(grp)
    screens.push({ s, draw })
  }

  // orta canlı panel (yakıt segmanları + İTKİ + lambalar)
  const core = makeScreen(1024, 116)
  const coreMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.44, 0.05),
    new THREE.MeshBasicMaterial({ map: core.tex, toneMapped: false }),
  )
  coreMesh.position.set(0, 0.055, 0.012)
  coreMesh.rotation.x = -0.12
  deck.add(coreMesh)
  screens.push({ s: core, draw: drawCore })

  // kadranlar: yükselti ön yüzünde, gerçek dönen ibreler
  const gaugeBody = new THREE.CylinderGeometry(0.032, 0.032, 0.016, 20)
  const gaugeRing = new THREE.CylinderGeometry(0.035, 0.035, 0.006, 20)
  const needleGeo = new THREE.BoxGeometry(0.005, 0.024, 0.004)
  needleGeo.translate(0, 0.011, 0)
  const gaugeDefs: Array<{ x: number; color: number; value: (hud: GameHud | null) => number }> = [
    { x: -0.15, color: 0xffa15c, value: (hud) => (hud ? hud.fuel * 2 - 1 : -1) },
    { x: 0, color: 0x78dc82, value: (hud) => THREE.MathUtils.clamp((hud?.closure ?? 0) / 0.02, -1, 1) },
    { x: 0.15, color: 0xff5a48, value: (hud) => THREE.MathUtils.clamp((hud?.vr ?? 0) / 0.05, -1, 1) },
  ]
  for (const def of gaugeDefs) {
    const g = new THREE.Group()
    // z: yükselti ön yüzünün (−0.09 + 0.10) önünde — gömülürse görünmez
    g.position.set(def.x, 0.014, 0.03)
    g.rotation.x = Math.PI / 2 - 0.12
    const body = new THREE.Mesh(gaugeBody, matDark)
    const ring = new THREE.Mesh(gaugeRing, matTrim)
    ring.position.y = 0.006
    g.add(body, ring)
    const pivot = new THREE.Group()
    pivot.position.y = 0.0115
    pivot.rotation.x = -Math.PI / 2
    const needle = new THREE.Mesh(needleGeo, new THREE.MeshBasicMaterial({ color: def.color }))
    pivot.add(needle)
    g.add(pivot)
    deck.add(g)
    needles.push({ pivot, value: def.value })
  }

  // konsolu tutarlı aydınlatan sıcak dolgu ışığı (kısa menzil — sahneye taşmaz)
  const fill = new THREE.PointLight(0xffc08a, 0.55, 1.8, 2)
  fill.position.set(0, -0.12, -0.32)
  root.add(fill)

  let acc = REDRAW_DT // ilk kare hemen çizilsin
  const tick: Rig['tick'] = (camera, hud, delta, visible) => {
    root.visible = visible
    if (!visible) return
    // GameCamera (priority 0) pozu bitirdikten sonra çağrılır — kilitli POV
    root.position.copy(camera.position)
    root.quaternion.copy(camera.quaternion)
    for (const n of needles) {
      const target = -n.value(hud) * 1.9 // ±109°
      n.pivot.rotation.z += (target - n.pivot.rotation.z) * Math.min(1, delta * 8)
    }
    acc += delta
    if (acc >= REDRAW_DT) {
      acc = 0
      for (const { s, draw } of screens) {
        draw(s, hud)
        s.tex.needsUpdate = true
      }
    }
  }
  return { root, tick }
}

function disposeRig(rig: Rig): void {
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      const m = o.material as THREE.Material & { map?: THREE.Texture }
      m.map?.dispose()
      m.dispose()
    }
  })
}

export function CockpitRig({ game }: { game: GameController }) {
  const active = useGameSnapshot(game).active
  // rig bir kez kurulur, oyun dışında görünmez durur (tick kapatır);
  // kare-başı mutasyonlar rig.tick closure'ında yaşar — immutability
  // lint'i hook değerine atamayı reddediyor (OrbitControls dersi)
  const [rig] = useState(buildRig)
  useEffect(() => () => disposeRig(rig), [rig])
  // son bilinen HUD tutulur: dünya donduğunda ekranlar son kareyi gösterir
  const hudRef = useRef<GameHud | null>(null)
  // DİKKAT: priority VERME — R3F'de pozitif priority otomatik render'ı
  // kapatır (sahne simsiyah kalır). Aynı priority'de sıra = mount sırası;
  // App'te GameCamera bu bileşenden önce mount edilir, poz senkronu böylece
  // kamera yerleştikten sonra çalışır (kilitli POV, titremez).
  useFrame(({ camera }, delta) => {
    const snapHud = game.getSnapshot().hud
    if (snapHud) hudRef.current = snapHud
    rig.tick(camera, hudRef.current, delta, active)
  })
  return <primitive object={rig.root} />
}
