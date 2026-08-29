import { useFrame } from '@react-three/fiber'
import type { GameController } from '../game/GameController'

/**
 * Oyun tick'i (öncelik −3): SimulationLayer'ın sim adımından (−2) hemen ÖNCE
 * koşar — itki, o karenin jeodezik adımına girmeden uygulanır.
 */
export function GameLoop({ game }: { game: GameController }) {
  useFrame((_, delta) => {
    game.tick(delta)
  }, -3)
  return null
}
