import { describe, expect, it } from 'vitest'
import { setServerOverclock, sellServerById } from './placement'
import { advanceSimulation, buyLocation, createInitialGame } from './simulation'
import { calculateCompanyEconomy } from './economy'
import { STARTING_CASH } from './config'
import { deliveredServer, unwrap } from './testSupport'
import { orderServerKit } from './procurement'
import type { GameState } from './types'

const runningGarage = () => unwrap(deliveredServer(unwrap(buyLocation(createInitialGame(), 'garage')), 'garage'))
const ledger = (game: GameState) => expect(game.cash).toBeCloseTo(STARTING_CASH + game.totalRevenue - game.totalExpenses - game.totalCapex, 8)

describe('purchases, delivery and selling', () => {
  it('starts with independent unowned locations', () => {
    const game = createInitialGame()
    expect(game.cash).toBe(12000)
    expect(game.locations).toHaveLength(5)
    expect(game.locations.every((item) => !item.owned && item.servers === 0)).toBe(true)
    expect(game.locations[0]).not.toBe(createInitialGame().locations[0])
  })
  it('pays separately for rack and chip and keeps the original state immutable', () => {
    const game = createInitialGame(), copy = structuredClone(game)
    const installed = unwrap(deliveredServer(unwrap(buyLocation(game, 'garage')), 'garage'))
    expect(game).toEqual(copy)
    expect(installed.cash).toBe(5700)
    expect(installed.totalCapex).toBe(6300)
    expect(installed.milestones.installedServer).toBe(true)
    ledger(installed)
  })
  it('rejects unowned, duplicate, restricted and unaffordable purchases', () => {
    const game = createInitialGame()
    expect(deliveredServer(game, 'garage').ok).toBe(false)
    expect(buyLocation(game, 'campus').ok).toBe(false)
    const owned = unwrap(buyLocation(game, 'garage'))
    expect(buyLocation(owned, 'garage').ok).toBe(false)
    expect(deliveredServer({ ...owned, cash: 4799 }, 'garage').ok).toBe(false)
    expect(unwrap(buyLocation({ ...game, cash: 1500 }, 'garage')).cash).toBe(0)
  })
  it('refunds only the sold chip and retains its rack', () => {
    const game = runningGarage()
    const sold = unwrap(sellServerById(game, 'garage', 'server-1'))
    expect(sold.cash).toBe(game.cash + 1200)
    expect(sold.totalCapex).toBe(5100)
    expect(sold.locations[0].servers).toBe(0)
    expect(sold.locations[0].rigs).toHaveLength(1)
    expect(game.locations[0].servers).toBe(1)
    expect(sellServerById(sold, 'garage', 'server-1').ok).toBe(false)
    ledger(sold)
  })
})

describe('simulation accounting', () => {
  it('one real minute earns one hour of operating profit after mounting', () => {
    const game = runningGarage(), next = advanceSimulation(game, 60, () => .99)
    expect(next.elapsedGameHours).toBe(game.elapsedGameHours + 1)
    expect(next.totalRevenue).toBe(960)
    expect(next.totalExpenses).toBe(206)
    expect(next.cash).toBe(game.cash + 754)
    ledger(next)
  })
  it('delivers via simulation time, waits while paused and never auto-installs', () => {
    const owned = unwrap(buyLocation(createInitialGame(), 'garage'))
    const ordered = unwrap(orderServerKit(owned, { locationId: 'garage', chassis: 'rack-basic', chip: 'consumer-gpu', channel: 'official', qty: 1, targetCell: { row: 0, col: 0 } }))
    const paused = { ...ordered, paused: true }
    expect(advanceSimulation(paused, 9999)).toBe(paused)
    const early = advanceSimulation(ordered, 359, () => .99)
    expect(early.orders).toHaveLength(2)
    const delivered = advanceSimulation(early, 1, () => .99)
    expect(delivered.orders).toHaveLength(0)
    expect(delivered.locations[0].inventory?.chips['consumer-gpu']).toBe(1)
    expect(delivered.locations[0].servers).toBe(0)
    expect(delivered.totalRevenue).toBe(0)
    expect(delivered.totalCapex).toBe(ordered.totalCapex)
    expect(delivered.cash).toBeCloseTo(ordered.cash - 6 * 80)
    ledger(delivered)
  })
  it('supports speed 3x and overclock throttling', () => {
    const game = { ...runningGarage(), speed: 3 as const }
    expect(advanceSimulation(game, 20).elapsedGameHours).toBe(game.elapsedGameHours + 1)
    const throttled = unwrap(setServerOverclock(game, 'garage', 'server-1', 1.5))
    expect(throttled.milestones.experiencedThrottle).toBe(true)
    expect(calculateCompanyEconomy(throttled).effectiveCompute).toBe(1)
  })
  it.each([0, -1, Infinity, NaN])('ignores invalid or zero delta %s', (seconds) => {
    const game = runningGarage()
    expect(advanceSimulation(game, seconds)).toBe(game)
  })
  it('preserves the ledger across small simulation ticks', () => {
    const game = runningGarage()
    const single = advanceSimulation(game, 120, () => .99)
    let many = game
    for (let i = 0; i < 480; i++) many = advanceSimulation(many, .25, () => .99)
    expect(many.cash).toBeCloseTo(single.cash, 6)
    ledger(many)
  })
  it('allows operating debt', () => {
    const game = unwrap(buyLocation({ ...createInitialGame(), cash: 1500 }, 'garage'))
    expect(advanceSimulation(game, 60).cash).toBe(-80)
  })
})
