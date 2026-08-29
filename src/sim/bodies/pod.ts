import * as THREE from 'three'
import type { BodyBuild } from '../types'

/**
 * Oyuncunun mekiği (Ranger benzeri küçük kapsül). POV kamera bunun hemen
 * üstünde uçar; model çoğunlukla kadraj dışıdır ama gölgesi/varlığı sahnede
 * gerçektir (kenetlenme mesafesi bu gövdenin konumundan ölçülür).
 */
export function makePod(): BodyBuild {
  const g = new THREE.Group()
  const hull = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.4, metalness: 0.55 })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 10), hull)
  body.rotation.z = Math.PI / 2
  g.add(body)
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.02), hull)
  g.add(wing)
  const w = new THREE.Group()
  w.add(g)
  return { group: w, size: 0.05, spinAxis: new THREE.Vector3(0, 1, 0), spinRate: 0, alignToVel: true }
}
