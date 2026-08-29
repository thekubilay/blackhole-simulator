import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { LabController } from '../sim/LabController'
import { useLabSnapshot } from '../hooks/useLabSnapshot'

/**
 * "Başa sar" komutunda kamerayı başlangıç konumuna döndürür: OrbitControls
 * kuruluş anındaki durumunu (position0/target0) saklar, reset() onu geri yükler.
 */
export function CameraRewind({ controller }: { controller: LabController }) {
  const seq = useLabSnapshot(controller).resetSeq
  const controls = useThree((s) => s.controls) as { reset?: () => void } | null
  useEffect(() => {
    if (seq > 0) controls?.reset?.()
  }, [seq, controls])
  return null
}
