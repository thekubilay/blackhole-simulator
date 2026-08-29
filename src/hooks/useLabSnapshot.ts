import { useSyncExternalStore } from 'react'
import type { LabSnapshot, SnapshotSource } from '../sim/types'

/** UI'yi 5 Hz snapshot yayınına bağlar; kare döngüsünden bağımsız. */
export function useLabSnapshot(source: SnapshotSource): LabSnapshot {
  return useSyncExternalStore(source.subscribe, source.getSnapshot)
}
