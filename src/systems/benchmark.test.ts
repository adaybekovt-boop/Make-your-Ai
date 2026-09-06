import { describe, expect, it } from 'vitest'
import {
  BENCHMARK_COST,
  BENCHMARK_OFFLINE_HOURS,
  CHEAT_GMI_BONUS,
  CHEAT_TOKEN_PENALTY,
  GMI_BOOST_THRESHOLD,
  GMI_CATEGORIES,
  GMI_NOISE,
} from './config'
import { createInitialGame } from './simulation'
import { dailyExposureRoll, gmiScores, runBenchmark, togglePreparing } from './benchmark'
import { tokenRevenuePerHour } from './market'
import type { ActionResult, GameState, Rng } from './types'

const rich = (): GameState => ({ ...createInitialGame(), cash: 1_000_000 })

function result(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

const always = (): Rng => () => 0.01

const spread = (): Rng => {
  // 0.5 maps to zero noise in gmiScores and always trips exposure rolls (0.01 < 0.15).
  let first = true
  return () => {
    if (first) {
      first = false
      return 0.5
    }
    return 0.01
  }
}

describe('GMI scoring', () => {
  it('keeps every subcategory within ±10% of IQ times weight', () => {
    const scores = gmiScores(100, () => 0.5)
    for (const category of GMI_CATEGORIES) {
      const value = scores[category.id]
      expect(value).toBeGreaterThanOrEqual(100 * category.weight * (1 - GMI_NOISE) - 1e-9)
      expect(value).toBeLessThanOrEqual(100 * category.weight * (1 + GMI_NOISE) + 1e-9)
    }
    expect(scores.total).toBeGreaterThan(0)
  })

  it('extreme noise stays inside the promised band', () => {
    const low = gmiScores(100, () => 0)
    const high = gmiScores(100, () => 1)
    expect(low.reasoning).toBeCloseTo(100 * (1 - GMI_NOISE))
    expect(high.reasoning).toBeCloseTo(100 * (1 + GMI_NOISE))
  })

  it('the hidden preparation bonus multiplies the result', () => {
    const honest = gmiScores(100, () => 0.5)
    const cheated = gmiScores(100, () => 0.5, 1 + CHEAT_GMI_BONUS)
    expect(cheated.total).toBeCloseTo(honest.total * (1 + CHEAT_GMI_BONUS))
  })
})

describe('running a benchmark', () => {
  it('refuses an untrained model', () => {
    expect(runBenchmark(rich(), spread()).ok).toBe(false)
  })

  it('costs 100k and takes the model offline for 5 hours', () => {
    const game = result(runBenchmark({ ...rich(), model: { ...rich().model, iq: 80 } }, spread()))
    expect(game.cash).toBe(1_000_000 - BENCHMARK_COST)
    expect(game.model.offlineUntil).toBe(game.elapsedGameHours + BENCHMARK_OFFLINE_HOURS)
    expect(game.benchmark.testing).toBe(true)
    expect(game.benchmark.last?.cheated).toBe(false)
  })

  it('a clean high score grants the temporary ad boost', () => {
    const game = result(runBenchmark({ ...rich(), model: { ...rich().model, iq: 120 } }, spread()))
    expect(game.benchmark.last!.total).toBeGreaterThanOrEqual(GMI_BOOST_THRESHOLD)
    expect(game.benchmark.adBoostUntil).not.toBeNull()
  })

  it('a cheated score never grants the ad boost', () => {
    let game = result(togglePreparing({ ...rich(), model: { ...rich().model, iq: 120 } }))
    game = result(runBenchmark(game, spread()))
    expect(game.benchmark.last!.cheated).toBe(true)
    expect(game.benchmark.adBoostUntil).toBeNull()
  })

  it('token revenue drops by 20% while preparing is on', () => {
    const base = { ...rich(), users: 1000 }
    const toggle = togglePreparing(base)
    if (!toggle.ok) throw new Error(toggle.error)
    expect(tokenRevenuePerHour(toggle.state)).toBeCloseTo(tokenRevenuePerHour(base) * (1 - CHEAT_TOKEN_PENALTY))
  })
})

describe('getting caught', () => {
  it('exposure fires with the daily chance and cancels the boost', () => {
    let game: GameState = { ...rich(), model: { ...rich().model, iq: 120 }, reputation: 50 }
    game = result(togglePreparing(game))
    game = result(runBenchmark(game, spread()))
    game = { ...game, benchmark: { ...game.benchmark, adBoostUntil: game.elapsedGameHours + 10 } }
    const exposed = dailyExposureRoll(game, always())
    expect(exposed.benchmark.last!.exposed).toBe(true)
    expect(exposed.benchmark.adBoostUntil).toBeNull()
    expect(exposed.reputation).toBe(50 - 25)
  })

  it('an honest result is never exposed', () => {
    const game = result(runBenchmark({ ...rich(), model: { ...rich().model, iq: 120 } }, spread()))
    expect(dailyExposureRoll(game, spread()).reputation).toBe(50)
  })
})

describe('the preparation toggle', () => {
  it('flips in either direction', () => {
    let game = result(togglePreparing(rich()))
    expect(game.benchmark.preparing).toBe(true)
    game = result(togglePreparing(game))
    expect(game.benchmark.preparing).toBe(false)
  })
})
