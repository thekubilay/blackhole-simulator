import type { BodyRegistry } from '../types'
import { makeAstronaut } from './astronaut'
import { makeEndurance } from './endurance'
import { makePod } from './pod'

/**
 * OCP kaydı: yeni bir gövde eklemek = yeni bir fabrika dosyası + buraya bir
 * satır. Motor ve UI (butonlar bu kayıttan türetilir) değişmez.
 * breakR = 0: gemiler gelgitle spagettileşmez — oyun ölümleri kural katmanında.
 */
export const BODY_REGISTRY: BodyRegistry = {
  astro: { label: 'Astronot', breakR: 1.35, make: makeAstronaut },
  endurance: { label: 'Endurance', breakR: 0, make: makeEndurance },
  pod: { label: 'Mekik', breakR: 0, make: makePod },
}
