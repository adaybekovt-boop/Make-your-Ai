import { setServerOverclock } from './placement'
import { describe, expect, it } from 'vitest'
import { advanceSimulation, buyLocation, buyServer, createInitialGame, sellServer } from './simulation'
import { calculateCompanyEconomy } from './economy'
import { MAX_SERVERS_PER_LOCATION, SERVER, STARTING_CASH } from './config'
import type { ActionResult, GameState, LocationId } from './types'

function result(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

function runningGarage() {
  return result(buyServer(result(buyLocation(createInitialGame(), 'garage')), 'garage'))
}

function expectLedger(game: GameState) {
  expect(game.cash).toBeCloseTo(STARTING_CASH + game.totalRevenue - game.totalExpenses - game.totalCapex, 8)
}

describe('purchases and selling', () => {
  it('starts with capital and five independent unowned locations', () => {
    const initial = createInitialGame()
    expect(initial.cash).toBe(12000)
    expect(initial.locations).toHaveLength(5)
    expect(initial.locations.every((location) => !location.owned && location.servers === 0)).toBe(true)
    expect(initial).not.toBe(createInitialGame())
    expect(initial.locations[0]).not.toBe(createInitialGame().locations[0])
  })

  it('buying a garage and GPU is immutable and spends exactly 3500', () => {
    const game = createInitialGame()
    const copy = structuredClone(game)
    const purchased = result(buyLocation(game, 'garage'))
    const installed = result(buyServer(purchased, 'garage'))
    expect(game).toEqual(copy)
    expect(purchased.locations[0].servers).toBe(0)
    expect(installed.cash).toBe(8500)
    expect(installed.totalCapex).toBe(3500)
    expect(installed.milestones.installedServer).toBe(true)
    expectLedger(installed)
  })

  it('rejects installing on an unowned site, duplicate purchases and insufficient cash', () => {
    const game = createInitialGame()
    expect(buyServer(game, 'garage').ok).toBe(false)
    expect(buyLocation(game, 'campus').ok).toBe(false)
    const owned = result(buyLocation(game, 'garage'))
    expect(buyLocation(owned, 'garage').ok).toBe(false)
    expect(buyServer({ ...owned, cash: SERVER.price - 0.01 }, 'garage').ok).toBe(false)
    expect(buyLocation({ ...game, cash: 1499 }, 'garage').ok).toBe(false)
    expect(buyLocation(game, 'unknown' as LocationId).ok).toBe(false)
  })

  it('permits a purchase with exactly sufficient funds', () => {
    const game = { ...createInitialGame(), cash: 1500 }
    expect(result(buyLocation(game, 'garage')).cash).toBe(0)
  })

  it('energy overload is allowed and marked immediately even while paused', () => {
    const game = result(setServerOverclock({ ...runningGarage(), paused: true }, 'garage', 'server-1', 1.5))
    expect(game.locations[0].servers).toBe(1)
    expect(game.milestones.experiencedThrottle).toBe(true)
    expect(calculateCompanyEconomy(game).effectiveCompute).toBe(1)
  })

  it('enforces only the technical server safety cap', () => {
    const game = runningGarage()
    game.locations[0].servers = MAX_SERVERS_PER_LOCATION
    expect(buyServer(game, 'garage').ok).toBe(false)
  })

  it('refunds 60%, updates investment ledger and cannot sell an absent GPU', () => {
    const game = runningGarage()
    const sold = result(sellServer(game, 'garage'))
    expect(sold.cash).toBe(game.cash + 1200)
    expect(sold.totalCapex).toBe(2300)
    expect(sold.locations[0].servers).toBe(0)
    expect(game.locations[0].servers).toBe(1)
    expectLedger(sold)
    expect(sellServer(sold, 'garage').ok).toBe(false)
    expect(sellServer(createInitialGame(), 'garage').ok).toBe(false)
  })
})

describe('simulation time and accounting', () => {
  it('60 seconds on 1x produce exactly one game hour of income and expenses', () => {
    const game = runningGarage()
    const next = advanceSimulation(game, 60)
    expect(next.elapsedGameHours).toBe(1)
    expect(next.totalRevenue).toBe(960)
    expect(next.totalExpenses).toBe(206)
    expect(next.cash).toBe(game.cash + 754)
    expect(game.totalRevenue).toBe(0)
    expectLedger(next)
  })

  it('supports speed 3x and pause', () => {
    const game = { ...runningGarage(), speed: 3 as const }
    expect(advanceSimulation(game, 20).elapsedGameHours).toBe(1)
    const paused = { ...game, paused: true }
    expect(advanceSimulation(paused, 100)).toBe(paused)
  })

  it.each([0, -1, Infinity, Number.NaN])('ignores invalid or zero delta %s', (seconds) => {
    const game = runningGarage()
    expect(advanceSimulation(game, seconds)).toBe(game)
  })

  it('is independent of tick granularity', () => {
    const game = runningGarage()
    const single = advanceSimulation(game, 600)
    let many = game
    for (let i = 0; i < 2400; i++) many = advanceSimulation(many, 0.25)
    expect(many.cash).toBeCloseTo(single.cash, 6)
    expect(many.totalRevenue).toBeCloseTo(single.totalRevenue, 6)
    expect(many.totalExpenses).toBeCloseTo(single.totalExpenses, 6)
    expect(many.elapsedGameHours).toBeCloseTo(single.elapsedGameHours, 6)
  })

  it('allows operating debt instead of silently erasing expenses', () => {
    const game = result(buyLocation({ ...createInitialGame(), cash: 1500 }, 'garage'))
    const next = advanceSimulation(game, 60)
    expect(next.cash).toBe(-80)
    expect(next.totalExpenses).toBe(80)
  })

  it('completes the entire Phase 0 definition-of-done scenario', () => {
    let game = createInitialGame()
    game = result(buyLocation(game, 'garage'))
    game = result(buyServer(game, 'garage'))
    const cashBefore = game.cash
    game = advanceSimulation(game, 10)
    expect(game.cash).toBeGreaterThan(cashBefore)
    game = result(setServerOverclock(game, 'garage', 'server-1', 1.5))
    expect(Object.values(game.milestones).every(Boolean)).toBe(true)
    expect(calculateCompanyEconomy(game).profitPerHour).toBe(736)
    game = advanceSimulation(game, 60)
    game = result(buyLocation(game, 'workshop'))
    expect(game.locations[1].owned).toBe(true)
    expectLedger(game)
  })
})
