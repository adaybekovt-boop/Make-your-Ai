import { REPUTATION_MAX, REPUTATION_MIN } from './config'
import type { GameState } from './types'

export function clampReputation(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Reputation must be finite.')
  return Math.min(REPUTATION_MAX, Math.max(REPUTATION_MIN, value))
}

export function changeReputation(state: GameState, delta: number): GameState {
  return { ...state, reputation: clampReputation(state.reputation + delta) }
}

/** Ads convert half as well at rock-bottom reputation, 1.5× at a spotless name. */
export function adEffectiveness(state: GameState): number {
  return 0.5 + state.reputation / REPUTATION_MAX
}

/** At reputation 100 ads cost their list price; at 0 they cost double. */
export function adCostMultiplier(state: GameState): number {
  return 2 - state.reputation / REPUTATION_MAX
}
