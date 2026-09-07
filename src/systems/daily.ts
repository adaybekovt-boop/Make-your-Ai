import { processCompanyDay } from './models/simulation'
import { adaptSingleModel, legacyFlagshipView } from './models/state'
import type { GameState, Rng } from './types'

/** Compatibility entry point. Company-wide daily systems are scheduled in one place. */
export function processDailySystems(state: GameState, rng: Rng): GameState {
  return legacyFlagshipView(processCompanyDay(adaptSingleModel(state), rng))
}
