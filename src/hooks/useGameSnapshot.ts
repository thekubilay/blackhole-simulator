import { useSyncExternalStore } from 'react'
import type { GameController, GameSnapshot } from '../game/GameController'

/** UI'yi oyun durumu yayınına bağlar (useLabSnapshot ile aynı desen). */
export function useGameSnapshot(game: GameController): GameSnapshot {
  return useSyncExternalStore(game.subscribe, game.getSnapshot)
}
