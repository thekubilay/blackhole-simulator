import * as THREE from 'three'
import { RS } from '../physics/constants'
import type { GeodesicEngine, OrbitalState } from '../physics/geodesics'
import type { HoleProfile } from '../physics/presets'
import type { BodyRegistry, SpawnMode } from './types'
import { disposeTree } from './dispose'
import { createEmberStream, type EmberStream } from './emberStream'

const RED_TINT = new THREE.Color(1, 0.15, 0.08)

// Görselleştirme eğrisi: gerçek gelgit gradyanı (2GM·ℓ/r³) telemetride ham
// gösterilir; bu fonksiyon yalnız modelin ekrandaki uzama animasyonunu sürer.
function tidalStretchViz(breakR: number, r: number): number {
  const x = breakR / Math.max(r, 0.01)
  const t = Math.min(Math.max((x - 0.5) / 0.5, 0), 1)
  return Math.min(1 + 2.6 * x * x * x * (t * t * (3 - 2 * t)), 6.0)
}

interface MatEntry {
  m: THREE.MeshStandardMaterial
  c: THREE.Color
}

interface DebrisParticle {
  st: OrbitalState | null
  live: boolean
  age: number
}

export interface DebrisSystem {
  parts: DebrisParticle[]
  stream: EmberStream
  idx: number
  owner: SimObject | null
}

export interface SimObject {
  type: string
  label: string
  breakR: number
  size: number
  spinAxis: THREE.Vector3
  spinRate: number
  alignToVel: boolean
  outer: THREE.Group
  model: THREE.Object3D
  mats: MatEntry[]
  /** tam jeodezik durum — pos/vel bundan türetilen önbelleklerdir */
  st: OrbitalState
  pos: THREE.Vector3
  vel: THREE.Vector3
  alive: boolean
  fade: number
  spinPhase: number
  stretch: number
  status: string
  dissolving: boolean
  massLost: number
  shedAcc: number
  shed: DebrisSystem | null
  lastHeat: number
  spawnT: number
  /** görseli kaldırılmış ama jeodezik durumu hâlâ ilerletilen kalıntı:
   * uzak gözlemci telemetrisi ufka asimptotik sürünüşü göstermeye devam eder */
  ghost: boolean
  /** bırakılmadan beri geçen koordinat zamanı (uzak gözlemci saati, rs/c) */
  tCoord: number
  /** bırakılmadan beri biriken öz zaman (cismin kendi saati, rs/c) */
  tau: number
}

/**
 * Fizik durumu ve dinamik nesne yaşam döngüsü (SRP) — render kaygısı yok.
 * Kütleçekim TAM Schwarzschild jeodezikleriyle çözülür (enjekte edilen motor,
 * DIP); disk sürtünmesi ve kütle saçılımı jeodezik-dışı, fenomenolojik
 * pertürbasyonlar olarak açıkça uygulanır.
 */
export class Simulation {
  readonly root: THREE.Group = new THREE.Group()
  readonly objects: SimObject[] = []
  readonly debris: DebrisSystem[] = []
  private engine: GeodesicEngine
  private profile: HoleProfile
  private readonly registry: BodyRegistry
  private readonly tmpA = new THREE.Vector3()
  private readonly tmpB = new THREE.Vector3()
  private readonly tmpC = new THREE.Vector3()
  private readonly qTmp = new THREE.Quaternion()
  private readonly up = new THREE.Vector3(0, 1, 0)
  private readonly mTmp = new THREE.Matrix4()
  private time = 0
  private emberScale = 700

  constructor(engine: GeodesicEngine, registry: BodyRegistry, profile: HoleProfile) {
    this.engine = engine
    this.registry = registry
    this.profile = profile
  }

  /** Kara delik değişimi: sahneyi temizler, motoru ve eşik profilini değiştirir. */
  configure(engine: GeodesicEngine, profile: HoleProfile): void {
    this.clear()
    this.engine = engine
    this.profile = profile
  }

  /** Render katmanı piksel ölçeğini bildirir (point boyutu için). */
  setEmberScale(v: number): void {
    this.emberScale = v
  }

  spawn(type: string, point: THREE.Vector3, mode: SpawnMode, exactRadius = false): SimObject {
    const def = this.registry[type]
    if (!def) throw new Error(`Bilinmeyen gövde türü: ${type}`)
    const built = def.make()
    const pos = point.clone()
    pos.y = 0
    let r = pos.length()
    const minR = exactRadius ? 1 + this.profile.killDist * 2 : this.profile.minSpawnR
    if (r < 1e-6) {
      pos.set(minR, 0, 0)
      r = minR
    } else if (r < minR) {
      pos.multiplyScalar(minR / r)
      r = minR
    } else if (r > 34) {
      pos.multiplyScalar(34 / r)
      r = 34
    }
    const e1 = pos.clone().normalize()
    const e2 = new THREE.Vector3(-pos.z, 0, pos.x).normalize()
    const st: OrbitalState = { e1, e2, r, phi: 0, uR: 0, L: 0, E: 0 }
    if (mode === 'orbit') {
      // analitik (E, L): uç Kerr'de normalizasyondan E çözmek iptale uğrar
      const c = this.engine.circularState(r)
      st.E = c.E
      st.L = c.L
    } else if (mode === 'flyby') {
      st.L = this.engine.circularState(r).L * 0.72
      this.engine.recomputeE(st)
    } else {
      this.engine.recomputeE(st)
    }
    // ISCO içinde dairesel yörünge kararsızdır: küçük radyal itki dalışı başlatır
    // (Miller gibi tam-yarıçap bırakmalarında itki verilmez)
    if (mode === 'orbit' && !exactRadius && r < this.engine.isco && r > 1e-6) {
      st.uR = (-0.02 * st.L) / st.r
      this.engine.recomputeE(st)
    }
    const outer = built.group
    this.root.add(outer)
    const mats: MatEntry[] = []
    outer.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) {
        const m = mesh.material.clone()
        m.transparent = true
        mesh.material = m
        mats.push({ m, c: m.color.clone() })
      }
    })
    const vLoc = this.engine.localCircularSpeed(r)
    // gelgit kopma yarıçapı deliğin kütlesiyle ölçeklenir: süperkütleli delikte
    // ufuk üstünde kopma olmaz (gelgit gradyanı zayıftır) — breakR 0'a düşer
    const effBreakR = def.breakR * this.profile.breakFactor
    const obj: SimObject = {
      type,
      label: def.label,
      breakR: effBreakR > 1.001 ? effBreakR : 0,
      size: built.size,
      spinAxis: built.spinAxis,
      spinRate: built.spinRate,
      alignToVel: built.alignToVel ?? false,
      outer,
      model: outer.children[0],
      mats,
      st,
      pos,
      vel: this.engine.coordVelocityOf(st, new THREE.Vector3()),
      alive: true,
      fade: 1,
      spinPhase: Math.random() * 6,
      stretch: 1,
      status:
        mode === 'fall'
          ? 'Serbest düşüşte'
          : mode === 'orbit'
            ? r < this.engine.isco
              ? 'Kararsız yörünge — ISCO içinde!'
              : `Kararlı yörüngede (v = ${vLoc.toFixed(2)} c)`
            : 'Yakın geçişte',
      dissolving: false,
      massLost: 0,
      shedAcc: 0,
      shed: null,
      lastHeat: -1,
      spawnT: 0,
      ghost: false,
      tCoord: 0,
      tau: 0,
    }
    outer.position.copy(pos)
    this.objects.push(obj)
    return obj
  }

  private makeStream(owner: SimObject): DebrisSystem {
    const cap = 150
    const parts: DebrisParticle[] = Array.from({ length: cap }, () => ({ st: null, live: false, age: 1 }))
    const stream = createEmberStream(cap)
    stream.material.uniforms.uScaleH.value = this.emberScale
    this.root.add(stream.pts)
    const system: DebrisSystem = { parts, stream, idx: 0, owner }
    this.debris.push(system)
    return system
  }

  // Uzama ekseni boyunca parçacık saç: yakın kuyruk gövdeden biraz YAVAŞ
  // ayrılır, Kepler kayması onu içeri sarmallanan bir yaya dizer. Her parçacık
  // kendi TAM jeodeziğini izler — akım deliğin etrafında doğru bükülür.
  private shedFrom(o: SimObject, d: DebrisSystem): void {
    const pt = d.parts[d.idx]
    d.idx = (d.idx + 1) % d.parts.length
    const ydir = this.tmpB.set(0, 1, 0).applyQuaternion(o.outer.quaternion)
    const near = Math.random() < 0.8
    const tip = o.size * (1 + (o.stretch - 1) * 1.6) * (0.8 + 0.3 * Math.random())
    const p = this.tmpA.copy(o.pos).addScaledVector(ydir, near ? -tip : tip)
    p.x += (Math.random() - 0.5) * 0.012
    p.y += (Math.random() - 0.5) * 0.01
    p.z += (Math.random() - 0.5) * 0.012
    const v = this.tmpC.copy(o.vel).multiplyScalar(near ? 0.94 - 0.05 * Math.random() : 1.04 + 0.04 * Math.random())
    v.x += (Math.random() - 0.5) * 0.006
    v.z += (Math.random() - 0.5) * 0.006
    pt.st = this.engine.stateFromPosVel(p, v)
    pt.live = true
    pt.age = 0
    o.massLost = Math.min(o.massLost + 0.004, 0.6)
  }

  private kill(o: SimObject, status: string): void {
    o.alive = false
    o.ghost = true
    this.root.remove(o.outer)
    disposeTree(o.outer)
    o.status = status
  }

  step(dtSim: number): void {
    const { tmpA, tmpB, qTmp, up } = this
    this.time += dtSim
    for (const o of this.objects) {
      if (!o.alive) {
        // hayalet: görsel yok ama jeodezik durum akmaya devam eder — uzak
        // gözlemci için uzaklık 1'e asimptotik iner, Dünya saati akar, τ durur.
        // Ufka fiilen varınca (prox ≤ 1e-4) kayıt biter: saatler son değerde donar.
        if (o.ghost && o.st.r - 1 > 1e-4) {
          const gtau = this.engine.advance(o.st, dtSim)
          o.tCoord += dtSim
          o.tau += gtau
          this.engine.positionOf(o.st, o.pos)
        }
        continue
      }
      // TAM jeodezik ilerleme (koordinat zamanı bütçesi, öz zaman döner)
      const phi0 = o.st.phi
      const dtau = this.engine.advance(o.st, dtSim)
      let dphi = o.st.phi - phi0
      if (dphi < 0) dphi += Math.PI * 2
      // iki saat: uzak gözlemcininki her zaman akar; cismin öz zamanı ufka
      // yaklaştıkça durur — birikimleri telemetride dinamik gösterilir
      o.tCoord += dtSim
      o.tau += dtau
      this.engine.positionOf(o.st, o.pos)
      this.engine.coordVelocityOf(o.st, o.vel)
      const r = o.st.r
      const prox = r - 1 // ufka sahne-birimi uzaklık; eşikler deliğe özgü
      const { fadeStart, freezeFade, killDist } = this.profile
      // kopma yarıçapının içinde gövde "patlamaz" — maksimuma kadar uzar ve
      // deliğe akarak çözülür (breakR=0: süperkütleli delikte kopma yok)
      if (o.breakR > 0 && r < o.breakR && !o.dissolving) {
        o.dissolving = true
        o.status = 'Spagettileşiyor — kara deliğe akıyor'
      }
      const sTarget = o.dissolving ? 5.5 : tidalStretchViz(o.breakR, r)
      o.stretch += (sTarget - o.stretch) * Math.min(1, dtSim * (o.dissolving ? 2.5 : 4))
      const s = o.stretch
      // Deformasyon tabanı: X = yörünge teğeti, Y = dikey, Z = radyal
      tmpB.copy(o.pos).normalize()
      this.tmpC.set(-o.pos.z, 0, o.pos.x).normalize()
      if (o.vel.dot(this.tmpC) < 0) this.tmpC.negate()
      this.mTmp.makeBasis(this.tmpC, up, tmpB)
      qTmp.setFromRotationMatrix(this.mTmp)
      o.outer.quaternion.copy(qTmp)
      // Uzama ekseni FİZİKSEL harekete göre paylaştırılır: gerçek gelgit
      // uzaması RADYALDİR; yörünge hareketinde Kepler kayması onu teğetsel
      // bir smear'a çevirir. u_r/L oranı hangi rejimde olduğumuzu söyler.
      const vrMag = Math.abs(o.st.uR)
      const vtMag = Math.abs(o.st.L) / r
      const wr = vrMag / (vrMag + vtMag + 1e-6) // 1 → radyal dalış
      const mk = 1 - o.massLost * 0.55
      const g = Math.min(s, 4.0) - 1
      // bırakılma anı: tek yazarlı yumuşak büyüme (0.65 → 1, üstel ease-out)
      o.spawnT += dtSim
      const pop = 1 - 0.35 * Math.exp(-o.spawnT * 4)
      o.outer.scale.set(
        (1 + g * (1 - wr * 0.85)) * pop,
        Math.pow(1 + g, -0.7) * mk * pop,
        (1 + g * (0.35 + 0.65 * wr * 0.85)) * pop,
      )
      o.outer.position.copy(o.pos)
      // gelgit ısınması: sürtünme gövdeyi eritir — yüzey erimiş parıltıya döner
      const heat = Math.min(Math.max((s - 1.12) / 1.8, 0), 1)
      if (heat !== o.lastHeat) {
        o.lastHeat = heat
        for (const { m } of o.mats) {
          m.emissive.setRGB(1.0, 0.38, 0.1).multiplyScalar(heat * 0.95)
          if (m.map) {
            if (heat > 0.55) m.map = null
            m.needsUpdate = true
          }
        }
      }
      // erimiş yüzey hafifçe titreşir (yalnız ısınmışken, birkaç malzeme yazımı)
      if (heat > 0.05) {
        const flick = 0.85 + 0.15 * Math.sin(this.time * 13 + o.spinPhase * 7)
        for (const { m } of o.mats) m.emissiveIntensity = flick
      }
      if (o.alignToVel && o.vel.lengthSq() > 1e-8) {
        tmpA.copy(o.vel).normalize()
        const local = tmpA.clone().applyQuaternion(qTmp.clone().invert())
        o.model.quaternion.setFromUnitVectors(up, local)
      } else if (o.spinRate) {
        // Spin paralel taşınır: hızlanmaz. Görünen tek GR etkisi jeodetik
        // (de Sitter) presesyon: eksen, yörünge normali etrafında yörünge
        // başına Δψ = 2π[1 − √(1 − 1.5 r_s/r)] döner (Gravity Probe B etkisi).
        const geo = 1 - Math.sqrt(Math.max(1 - (1.5 * RS) / r, 0))
        if (geo > 0 && dphi > 0 && dphi < Math.PI) {
          tmpA.crossVectors(o.st.e1, o.st.e2).normalize()
          o.spinAxis.applyAxisAngle(tmpA, geo * dphi)
        }
        // yuvarlanma öz zamanda işler; gelgitler frenler (tidal kilitlenme)
        o.spinPhase += (o.spinRate * dtau) / (s * s)
        o.model.quaternion.setFromAxisAngle(o.spinAxis, o.spinPhase)
      }
      if (o.dissolving) {
        o.fade -= dtSim * 0.16
        o.massLost = Math.min(o.massLost + dtSim * 0.05, 0.7)
        o.shedAcc += dtSim * 4
        if (!o.shed) o.shed = this.makeStream(o)
        const stream = o.shed
        let dg = 0
        while (o.shedAcc >= 1 && dg++ < 8) {
          o.shedAcc--
          this.shedFrom(o, stream)
        }
        if (o.fade <= 0) {
          this.kill(o, 'Gelgit kuvvetiyle çözüldü — kara deliğe yutuldu')
          continue
        }
      }
      if (prox < killDist) {
        this.kill(o, 'Ufkun ardında kayboldu')
        continue
      }
      // yığılma diski plazma sürtünmesi: FENOMENOLOJİK model (gerçekte MHD
      // türbülansı) — jeodezik-dışı kuvvet olarak u_r ve L ölçeklenir,
      // E normalizasyondan yeniden hesaplanır: yörünge gerçekten bozunur.
      // Disk iç kenarı ISCO'dadır (deliğe özgü) — gaz oradan içerde yoktur.
      const rr = Math.hypot(o.pos.x, o.pos.z)
      const inDisk = Math.abs(o.pos.y) < 0.25 && rr > this.profile.diskIn && rr < this.profile.diskOut
      if (inDisk) {
        const drag = 0.012 * Math.pow(this.profile.diskIn / rr, 2) * o.vel.length()
        // taban 0.6: sürtünme 4-hızı asla sıfırlayamaz (ergosferde statik
        // durum yoktur; tam durdurma fiziksel değildir ve durumu bozar)
        this.engine.scaleVelocity(o.st, Math.max(0.6, 1 - drag * dtSim))
      }
      // Roche kütle kaybı: uzun "spagetti" parçacık akımının kendisidir
      if (!o.dissolving && s > 1.5) {
        o.shedAcc += dtSim * (s - 1.4) * 4
        if (!o.shed) o.shed = this.makeStream(o)
        const stream = o.shed
        let sg = 0
        while (o.shedAcc >= 1 && sg++ < 6) {
          o.shedAcc--
          this.shedFrom(o, stream)
        }
      }
      if (o.dissolving) {
        // durum zaten ayarlandı
      } else if (s > 1.35) o.status = `Gelgit gerilmesi — kütle kaybediyor, spagettileşiyor (×${s.toFixed(1)})`
      else if (prox < 5 * fadeStart) o.status = 'Ufka yaklaşıyor — zaman yavaşlıyor'
      else if (inDisk) o.status = 'Disk plazması içinde — sürtünme yörüngeyi bozuyor'
      // kütleçekimsel kızıla kayma tonu + tek noktadan opaklık:
      // çözülme solması artık ufuk solmasıyla ezilmeden görünür
      const red = THREE.MathUtils.clamp((3 * fadeStart - prox) / (3 * fadeStart), 0, 1)
      let op = prox < fadeStart ? THREE.MathUtils.clamp(prox / fadeStart, 0, 1) : 1
      if (prox < freezeFade) {
        o.status = 'Ufukta donuyor — kızıla kayıp soluyor'
        o.fade -= 0.004
      }
      if (o.dissolving || prox < freezeFade) op = Math.min(op, Math.max(o.fade, 0))
      for (const { m, c } of o.mats) {
        m.color.copy(c).lerp(RED_TINT, red * 0.85)
        m.opacity = op
      }
      if (prox < freezeFade && o.fade <= 0) this.kill(o, 'Ufkun ardında kayboldu')
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]
      const { posArr, ageArr } = d.stream
      d.stream.material.uniforms.uScaleH.value = this.emberScale
      let liveCount = 0
      for (let j = 0; j < d.parts.length; j++) {
        const pt = d.parts[j]
        if (pt.live && pt.st) {
          this.engine.advance(pt.st, Math.min(dtSim, 0.06))
          const pprox = pt.st.r - 1
          // kor yaşlanır: ufka yaklaşırken kızıla kayıp hızla söner
          pt.age += dtSim * 0.08 + (pprox < 2 * this.profile.fadeStart ? dtSim * 0.5 : 0)
          if (pt.age >= 1 || pprox < this.profile.killDist) pt.live = false
          else liveCount++
        }
        const k = j * 3
        if (pt.live && pt.st) {
          this.engine.positionOf(pt.st, this.tmpA)
          posArr[k] = this.tmpA.x
          posArr[k + 1] = this.tmpA.y
          posArr[k + 2] = this.tmpA.z
          ageArr[j] = Math.min(pt.age, 1)
        } else {
          posArr[k] = 1e5
          posArr[k + 1] = 1e5
          posArr[k + 2] = 1e5
          ageArr[j] = 1
        }
      }
      d.stream.pts.geometry.attributes.position.needsUpdate = true
      d.stream.pts.geometry.attributes.aAge.needsUpdate = true
      if (liveCount === 0 && !(d.owner && d.owner.alive)) {
        const u = d.stream.material.uniforms.uOpacity
        u.value -= 0.02
        if (u.value <= 0) {
          this.root.remove(d.stream.pts)
          d.stream.pts.geometry.dispose()
          d.stream.material.dispose()
          this.debris.splice(i, 1)
        }
      }
    }
  }

  clear(): void {
    for (const o of this.objects) {
      this.root.remove(o.outer)
      disposeTree(o.outer)
    }
    for (const d of this.debris) {
      this.root.remove(d.stream.pts)
      d.stream.pts.geometry.dispose()
      d.stream.material.dispose()
    }
    this.objects.length = 0
    this.debris.length = 0
  }
}
