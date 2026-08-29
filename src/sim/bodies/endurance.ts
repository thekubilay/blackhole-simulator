import * as THREE from 'three'
import type { BodyBuild } from '../types'

/**
 * Endurance: dönen halka istasyon (Interstellar). Halka XZ düzleminde yatar,
 * spin ekseni +Y — yörünge düzleminden bakan pod, halkanın dönüşünü cepheden
 * görür. Dönüş fazı eşleme mekaniği (M3) bu spinPhase üzerinden okunacak.
 */
export function makeEndurance(): BodyBuild {
  const g = new THREE.Group()
  const hull = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.45, metalness: 0.6 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.6, metalness: 0.4 })
  const R = 0.085
  // halka: 12 kapsül modül (filmdeki gibi boğumlu), ince tüp yerine
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2
    const mod = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.028, 4, 10), hull)
    mod.position.set(R * Math.cos(ang), 0, R * Math.sin(ang))
    mod.rotation.y = -ang
    mod.rotation.x = Math.PI / 2
    g.add(mod)
  }
  // merkez göbek + 4 ispit
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), dark)
  g.add(hub)
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, R, 6), dark)
    spoke.position.set((R / 2) * Math.cos(ang), 0, (R / 2) * Math.sin(ang))
    spoke.rotation.z = Math.PI / 2
    spoke.rotation.y = -ang
    g.add(spoke)
  }
  const w = new THREE.Group()
  w.add(g)
  // filmdeki tempoya yakın belirgin bir dönüş; M3'te faz eşlemenin hedefi
  return { group: w, size: 0.2, spinAxis: new THREE.Vector3(0, 1, 0), spinRate: 0.55 }
}
