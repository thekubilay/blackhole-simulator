import * as THREE from 'three'

/** Bir sahne alt-ağacındaki tüm geometri/materyal/doku belleğini boşaltır. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (material) {
      const list = Array.isArray(material) ? material : [material]
      for (const m of list) {
        const mapped = m as THREE.Material & { map?: THREE.Texture | null }
        if (mapped.map) mapped.map.dispose()
        m.dispose()
      }
    }
  })
}
