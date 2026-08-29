import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { QualityGovernor } from '../sim/QualityGovernor'

/** Governor'ın seviye kararlarını R3F piksel oranına uygular (DIP köprüsü). */
export function QualityManager({ governor }: { governor: QualityGovernor }) {
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    setDpr(governor.current.dpr)
    return governor.onChange((level) => setDpr(level.dpr))
  }, [governor, setDpr])
  return null
}
