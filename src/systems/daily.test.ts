import { deliveredServer } from './testSupport'
import { describe, expect, it } from 'vitest'
import { createInitialGame, advanceSimulation, buyLocation } from './simulation'
import { processDailySystems } from './daily'
import { GAME_HOURS_PER_REAL_SECOND } from './config'
import type { ActionResult, GameState, Rng } from './types'

const flat: Rng = () => 0.5

function result(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

describe('the daily hook', () => {
  it('runs exactly once when a tick crosses midnight', () => {
    const seeded = { ...createInitialGame(), locations: createInitialGame().locations.map((item) => item.id === 'garage' ? { ...item, owned: true, servers: 1 } : item) }
    let game: GameState = seeded
    // 16 game hours from 08:00 brings the clock to midnight of day 2.
    game = advanceSimulation(game, 16 / GAME_HOURS_PER_REAL_SECOND, flat)
    expect(game.users).toBeGreaterThan(0)
    const usersAfterFirstMidnight = game.users

    const sameDay = advanceSimulation(game, 60, flat)
    expect(sameDay.users).toBe(usersAfterFirstMidnight)
  })

  it('processDailySystems is deterministic for a fixed rng', () => {
    const seedTwo = (): GameState => ({ ...createInitialGame(), locations: createInitialGame().locations.map((item) => item.id === 'garage' ? { ...item, owned: true, servers: 2 } : item) })
    const a = processDailySystems(seedTwo(), flat)
    const b = processDailySystems(seedTwo(), flat)
    expect(a.users).toBe(b.users)
    expect(a.market.chips['consumer-gpu'].price).toBe(b.market.chips['consumer-gpu'].price)
    expect(a.competitor.score).toBeCloseTo(b.competitor.score)
  })

  it('never touches a paused company', () => {
    const game = { ...createInitialGame(), paused: true }
    expect(advanceSimulation(game, 999, flat)).toBe(game)
  })
})

describe('hourly accounting with the new flows', () => {
  it('compute revenue alone at the start: users are zero, so no token income', () => {
    let game = result(buyLocation(createInitialGame(), 'garage'))
    game = result(deliveredServer(game, 'garage'))
    const before = game.cash
    game = advanceSimulation(game, 60, flat)
    const economyProfit = 960 - 36 - 90 - 80
    expect(game.cash).toBeCloseTo(before + economyProfit, 6)
  })
})
