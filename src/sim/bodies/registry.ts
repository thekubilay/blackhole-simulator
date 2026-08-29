import type { BodyRegistry } from '../types'
import { makeAstronaut } from './astronaut'

/**
 * OCP kaydı: yeni bir gövde eklemek = yeni bir fabrika dosyası + buraya bir
 * satır. Motor ve UI (butonlar bu kayıttan türetilir) değişmez.
 */
export const BODY_REGISTRY: BodyRegistry = {
  astro: { label: 'Astronot', breakR: 1.35, make: makeAstronaut },
}
