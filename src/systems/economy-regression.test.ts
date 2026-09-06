import { describe, expect, it } from 'vitest'
import { CHIPS, GAME_HOURS_PER_REAL_SECOND, LICENSE_PAYOUT_PER_DAY, SEASON_SUMMER_MULT, SUMMER_START_DAY } from './config'
import { calculateCompanyEconomy, calculateLocationEconomy, calculateServerROI } from './economy'
import { buyCityTower } from './city'
import { gameDay, subscriptionPerHour, tokenRevenuePerHour, userCapacity } from './market'
import { mountChassisFromInventory, mountChipFromInventory, orderServerKit } from './procurement'
import { advanceSimulation, buyLocation, createInitialGame } from './simulation'
import type { ActionResult, ChassisId, ChipId, GameState, LocationId, Personality, Rng } from './types'

const safe: Rng = () => 0.99
function unwrap(result: ActionResult): GameState { if (!result.ok) throw new Error(result.error); return result.state }
const advanceHours = (state: GameState, hours: number, rng: Rng = safe) => advanceSimulation(state, hours / (state.speed * GAME_HOURS_PER_REAL_SECOND), rng)
function startKit(chip: ChipId = 'consumer-gpu', chassis: ChassisId = 'rack-basic', id: LocationId = 'garage', cash = 12000, personality: Personality | null = null) {
  let state = createInitialGame()
  state = { ...state, cash, model: { ...state.model, personality } }
  state = unwrap(buyLocation(state, id))
  state = unwrap(orderServerKit(state, { locationId: id, chip, chassis, channel: 'official', qty: 1, targetCell: { row: 0, col: 0 } }))
  const arrival = Math.max(...state.orders.map(order => order.arriveAt))
  state = advanceHours(state, arrival - state.elapsedGameHours)
  expect(state.orders).toHaveLength(0)
  expect(state.locations.find(location => location.id === id)?.servers).toBe(0)
  state = unwrap(mountChassisFromInventory(state, id, { row: 0, col: 0 }, chassis, safe))
  return unwrap(mountChipFromInventory(state, id, { row: 0, col: 0 }, chip, safe))
}
function seeded(seed: number): Rng { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32 } }
const rounded = (state: GameState) => JSON.parse(JSON.stringify(state, (_key, value: unknown) => typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value)) as unknown

describe('real procurement and audience revenue', () => {
  it('an installed server with zero users loses money in both the UI model and cash posting', () => {
    const state = startKit()
    expect(state.cash).toBe(5220)
    expect(state.users).toBe(0)
    expect(calculateCompanyEconomy(state)).toMatchObject({ serverRevenuePerHour: 0, revenuePerHour: 0, profitPerHour: -206 })
    expect(calculateLocationEconomy(state.locations[0], undefined, state).profitPerHour).toBe(-206)
    const next = advanceHours(state, 1)
    expect(next.cash).toBe(state.cash - 206)
    expect(next.totalRevenue).toBe(0)
  })
  it.each([null, 'friendly', 'raw'] as const)('survives the full $12,000 start, official delivery and audience ramp: %s', personality => {
    let state = startKit('consumer-gpu', 'rack-basic', 'garage', 12000, personality)
    let minimumCash = state.cash, firstPositiveHour: number | null = null
    const observations: Array<{ hour: number; users: number; revenue: number }> = []
    for (let hour = 0; hour < 80; hour++) {
      state = advanceHours(state, 1)
      minimumCash = Math.min(minimumCash, state.cash)
      const economy = calculateCompanyEconomy(state)
      if (economy.profitPerHour > 0 && firstPositiveHour === null) firstPositiveHour = state.elapsedGameHours
      if ((state.elapsedGameHours + 8) % 24 === 0) observations.push({ hour: state.elapsedGameHours, users: state.users, revenue: economy.serverRevenuePerHour })
      expect(economy.serverRevenuePerHour).toBeCloseTo(tokenRevenuePerHour(state) + subscriptionPerHour(state))
    }
    expect(minimumCash).toBeGreaterThan(0)
    expect(firstPositiveHour).not.toBeNull()
    expect(firstPositiveHour!).toBeGreaterThan(6)
    for (let i = 1; i < observations.length; i++) expect(observations[i].revenue).toBeGreaterThan(observations[i - 1].revenue)
    expect(state.users).toBeLessThan(userCapacity(state, calculateCompanyEconomy(state)))
    console.log('START_BALANCE', JSON.stringify({ personality, minimumCash, firstPositiveHour, observations }))
  })
  it.each([
    ['consumer-gpu', 'rack-basic', 'garage', 12000],
    ['pro-gpu', 'rack-basic', 'workshop', 30000],
    ['accelerator', 'rack-cooled', 'technopark', 100000],
    ['flagship', 'rack-enterprise', 'campus', 400000],
  ] as const)('staged viability uses actual delivery and mounting: %s', (chip, chassis, id, capital) => {
    let state = startKit(chip, chassis, id, capital)
    const initial = calculateCompanyEconomy(state)
    expect(initial.serverRevenuePerHour).toBe(0)
    expect(initial.profitPerHour).toBeLessThan(0)
    let minimumCash = state.cash
    for (let hour = 0; hour < 120; hour++) { state = advanceHours(state, 1); minimumCash = Math.min(minimumCash, state.cash) }
    const economy = calculateCompanyEconomy(state)
    expect(minimumCash).toBeGreaterThan(0)
    expect(economy.profitPerHour).toBeGreaterThan(0)
    console.log('CHIP_STAGE', JSON.stringify({ chip: CHIPS[chip].name, location: id, stageCapital: capital, minimumCash, profitPerHour: economy.profitPerHour }))
  })
})

describe('revenue channels and allocation', () => {
  it('preserves legitimate rent even without users and while the model is offline', () => {
    let state = createInitialGame()
    state = unwrap(buyCityTower({ ...state, cash: 50000 }, 'meridian'))
    state = { ...state, model: { ...state.model, offlineUntil: 10 } }
    expect(calculateCompanyEconomy(state)).toMatchObject({ serverRevenuePerHour: 0, propertyRevenuePerHour: 360, propertyExpensesPerHour: 80, revenuePerHour: 360, profitPerHour: 280 })
    expect(advanceHours(state, 1).cash).toBe(state.cash + 280)
  })
  it('allocates only actual user revenue, not property income, by effective compute', () => {
    const state = createInitialGame()
    state.users = 150
    state.cityProperties = ['meridian']
    state.locations[0] = { id: 'garage', owned: true, servers: 1 }
    state.locations[1] = { id: 'workshop', owned: true, servers: 2 }
    const company = calculateCompanyEconomy(state)
    expect(company).toMatchObject({ serverRevenuePerHour: 240, propertyRevenuePerHour: 360, revenuePerHour: 600 })
    expect(calculateLocationEconomy(state.locations[0], undefined, state).revenuePerHour).toBe(80)
    expect(calculateLocationEconomy(state.locations[1], undefined, state).revenuePerHour).toBe(160)
    const allocated = state.locations.reduce((sum, location) => sum + calculateLocationEconomy(location, undefined, state).revenuePerHour, 0)
    expect(allocated).toBe(company.serverRevenuePerHour)
    const next = advanceHours(state, 1)
    expect(next.totalRevenue - state.totalRevenue).toBe(600)
    expect(next.cash - state.cash).toBe(company.profitPerHour)
  })
  it('counts payroll exactly once in both company profit and cash', () => {
    const state = startKit()
    state.team.employees = [{ id: 1, role: 'engineer', salaryPerHour: 90, hiredDay: 1 }]
    expect(calculateCompanyEconomy(state)).toMatchObject({ salariesPerHour: 90, profitPerHour: -296 })
    expect(advanceHours(state, 1).cash).toBe(state.cash - 296)
  })
  it('has a finite zero allocation when no compute exists', () => {
    const state = createInitialGame()
    expect(calculateLocationEconomy(state.locations[0], undefined, state).revenuePerHour).toBe(0)
  })
  it('labels ROI as a steady-state kit forecast and separates its negative immediate effect', () => {
    const state = createInitialGame()
    state.locations[0] = { id: 'garage', owned: true, servers: 0 }
    const roi = calculateServerROI(state.locations[0], state)
    expect(roi).toMatchObject({ forecast: 'steady-state', capitalCost: 4800, installable: true, immediateProfitPerHour: -126, incrementalProfitPerHour: 138 })
    expect(roi.paybackHours).toBeCloseTo(4800 / 138)
    expect(state.users).toBe(0)
  })
})

describe('chronological multi-day simulation', () => {
  it('posts each crossed daily license payout once at the actual boundary', () => {
    const state = createInitialGame()
    state.model.licensed = true
    const next = advanceHours(state, 16 + 6 * 24)
    expect(gameDay(next)).toBe(8)
    expect(next.totalRevenue).toBe(7 * LICENSE_PAYOUT_PER_DAY)
    expect(next.competitor.samples).toHaveLength(8)
    expect(advanceHours(next, 1).totalRevenue).toBe(next.totalRevenue)
  })
  it.each([1, 3] as const)('one 15-day call equals hourly calls, including real daily events and RNG ordering, at %s×', speed => {
    const state = { ...startKit(), speed }
    state.model.run = { total: 500, remaining: 500, poisonedChance: 0.1, usedUnofficial: false }
    const single = advanceHours(structuredClone(state), 360, seeded(42))
    let many = structuredClone(state)
    const rng = seeded(42)
    for (let hour = 0; hour < 360; hour++) many = advanceHours(many, 1, rng)
    expect(rounded(single)).toEqual(rounded(many))
  })
  it('splits model downtime instead of billing or training retroactively', () => {
    const state = startKit()
    state.users = 100
    state.model.offlineUntil = state.elapsedGameHours + 3
    state.model.run = { total: 100, remaining: 100, poisonedChance: 0, usedUnofficial: false }
    const next = advanceHours(state, 5)
    expect(next.totalRevenue - state.totalRevenue).toBe(2 * 160)
    expect(next.model.run?.remaining).toBe(96)
  })
  it('splits a cooling season change even though it is not a visible day boundary', () => {
    const state = startKit()
    state.elapsedGameHours = SUMMER_START_DAY * 24 - 1
    const next = advanceHours(state, 2)
    expect(next.totalExpenses - state.totalExpenses).toBeCloseTo(2 * (80 + 90) + 36 * (1 + SEASON_SUMMER_MULT))
  })
})
