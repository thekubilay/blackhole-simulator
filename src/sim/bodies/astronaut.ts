import * as THREE from 'three'
import type { BodyBuild } from '../types'

export function makeAstronaut(): BodyBuild {
  const g = new THREE.Group()
  const suit = new THREE.MeshStandardMaterial({ color: 0xe8e9ec, roughness: 0.6 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a13b, roughness: 0.15, metalness: 1 })
  const gray = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5 })
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    rz = 0,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    if (rx) m.rotation.x = rx
    if (rz) m.rotation.z = rz
    g.add(m)
    return m
  }
  add(new THREE.CapsuleGeometry(0.022, 0.032, 6, 14), suit, 0, 0, 0)
  add(new THREE.SphereGeometry(0.021, 20, 14), suit, 0, 0.045, 0)
  add(new THREE.SphereGeometry(0.017, 20, 14), gold, 0, 0.046, 0.01)
  add(new THREE.BoxGeometry(0.034, 0.046, 0.018), gray, 0, 0.006, -0.026)
  add(new THREE.CapsuleGeometry(0.0075, 0.034, 4, 10), suit, -0.03, 0.008, 0, 0, 1.0)
  add(new THREE.CapsuleGeometry(0.0075, 0.034, 4, 10), suit, 0.03, 0.008, 0, 0, -1.0)
  add(new THREE.CapsuleGeometry(0.0085, 0.04, 4, 10), suit, -0.013, -0.052, 0, 0, 0.25)
  add(new THREE.CapsuleGeometry(0.0085, 0.04, 4, 10), suit, 0.013, -0.052, 0, 0, -0.25)
  const w = new THREE.Group()
  w.add(g)
  // Serbest düşen cismin spini paralel taşınır — kendiliğinden dönüş kazanmaz.
  // Bırakılma anından kalan küçük bir yuvarlanma verilir (~0.4 rad/s görsel);
  // spin ekseninin jeodetik presesyonu Simulation.step'te uygulanır.
  return { group: w, size: 0.09, spinAxis: new THREE.Vector3(0.6, 0.8, 0.3).normalize(), spinRate: 0.07 }
}
