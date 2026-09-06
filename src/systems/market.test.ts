import { describe, expect, it } from 'vitest'
import {
  AD_DAILY_COST,
  CHIP_PRICE_SWING,
  CHIPS,
  INSURANCE_DAILY_PREMIUM,
  LICENSE_PAYOUT_PER_DAY,
  LICENSE_VOICE_MULTIPLIER,
  SUBSCRIPTION_PER_USER_HOUR,
  TECH_NODES,
  TOKEN_REVENUE_PER_USER_HOUR,
} from './config'
import { createInitialGame } from './simulation'
import {
  acceptAcquisition,
  acquisitionConditionsMet,
  chipPriceForDay,
  dailyAdvertisingBilling,
  dailyInsuranceBilling,
  dailyInvestors,
  dailyLicensingPayout,
  dailyUserStep,
  reduceFine,
  subscriptionPerHour,
  tokenRevenuePerHour,
  unlockTech,
  userCapacity,
  seasonalityMult,
  techAvailable,
} from './market'
import type { GameState, Rng } from './types'

const flat: Rng = () => 0.5

describe('chip market', () => {
  it('prices swing inside the ±20% band around the base', () => {
    for (const chip of Object.keys(CHIPS) as Array<keyof typeof CHIPS>) {
      for (let day = 0; day < 40; day += 1) {
        const { price } = chipPriceForDay(chip, day, flat)
        expect(price).toBeGreaterThanOrEqual(Math.round(CHIPS[chip].price * (1 - CHIP_PRICE_SWING - 0.03)))
        expect(price).toBeLessThanOrEqual(Math.round(CHIPS[chip].price * (1 + CHIP_PRICE_SWING + 0.03)))
      }
    }
  })

  it('trend points up above the base and down below it', () => {
    const above = chipPriceForDay('consumer-gpu', 2, flat)
    const below = chipPriceForDay('consumer-gpu', 6, flat)
    expect(above.trend).toBe(1)
    expect(below.trend).toBe(-1)
  })
})

describe('token and subscription income', () => {
  it('token revenue scales with users and the token price', () => {
    const game: GameState = { ...createInitialGame(), users: 1000 }
    expect(tokenRevenuePerHour(game)).toBeCloseTo(1000 * TOKEN_REVENUE_PER_USER_HOUR)
    const cheap: GameState = { ...game, market: { ...game.market, tokenPrice: 50 } }
    expect(tokenRevenuePerHour(cheap)).toBeCloseTo(tokenRevenuePerHour(game) / 2)
  })

  it('the model offline earns nothing from users', () => {
    const game: GameState = {
      ...createInitialGame(),
      users: 1000,
      model: { ...createInitialGame().model, offlineUntil: 10 },
    }
    expect(tokenRevenuePerHour(game)).toBe(0)
    expect(subscriptionPerHour(game)).toBe(0)
  })

  it('subscriptions are steady and unaffected by the token price', () => {
    const game: GameState = { ...createInitialGame(), users: 1000 }
    expect(subscriptionPerHour(game)).toBeCloseTo(1000 * SUBSCRIPTION_PER_USER_HOUR)
    const cheap: GameState = { ...game, market: { ...game.market, tokenPrice: 50 } }
    expect(subscriptionPerHour(cheap)).toBeCloseTo(subscriptionPerHour(game))
  })

  it('open-source cuts the token rate permanently', () => {
    const closed: GameState = { ...createInitialGame(), users: 1000 }
    const open: GameState = { ...closed, model: { ...closed.model, openSource: true } }
    expect(tokenRevenuePerHour(open)).toBeCloseTo(tokenRevenuePerHour(closed) * 0.75)
  })
})

describe('audience capacity', () => {
  it('is zero without compute', () => {
    const economy = { effectiveCompute: 0 } as never
    expect(userCapacity(createInitialGame(), economy)).toBe(0)
  })

  it('grows with compute and reputation, daily step moves users toward it', () => {
    const state = createInitialGame()
    const weak = userCapacity(state, { effectiveCompute: 1 } as never)
    const strong = userCapacity(state, { effectiveCompute: 4 } as never)
    expect(strong).toBeGreaterThan(weak)
    expect(dailyUserStep({ ...state, users: 0 }, 200)).toBeCloseTo(100)
    expect(dailyUserStep({ ...state, users: 300 }, 200)).toBeCloseTo(250)
  })
})

describe('seasonality of cooling', () => {
  it('is neutral in spring, hot in summer and mild in winter', () => {
    const at = (days: number): GameState => ({ ...createInitialGame(), elapsedGameHours: days * 24 })
    expect(seasonalityMult(at(0))).toBe(1)
    expect(seasonalityMult(at(100))).toBe(1.15)
    expect(seasonalityMult(at(300))).toBe(0.9)
  })
})

describe('insurance', () => {
  it('covers 40% of fines while active', () => {
    const bare = createInitialGame()
    expect(reduceFine(bare, 10_000)).toBe(10_000)
    const insured: GameState = { ...bare, market: { ...bare.market, insurance: true } }
    expect(reduceFine(insured, 10_000)).toBeCloseTo(6_000)
  })

  it('bills the daily premium only while active', () => {
    const insured: GameState = { ...createInitialGame(), market: { ...createInitialGame().market, insurance: true } }
    const billed = dailyInsuranceBilling(insured)
    expect(billed.cash).toBe(12_000 - INSURANCE_DAILY_PREMIUM)
    expect(dailyInsuranceBilling(createInitialGame()).cash).toBe(12_000)
  })
})

describe('advertising billing', () => {
  it('charges only while the campaign runs, scaled by reputation', () => {
    const advertising: GameState = { ...createInitialGame(), market: { ...createInitialGame().market, advertising: true } }
    // reputation 50 -> ads cost 1.5x the list price
    expect(dailyAdvertisingBilling(advertising).cash).toBe(12_000 - Math.round(AD_DAILY_COST * 1.5))
    expect(dailyAdvertisingBilling(createInitialGame()).cash).toBe(12_000)
  })
})

describe('licensing', () => {
  it('pays daily once the model is licensed, more with voice', () => {
    const licensed: GameState = { ...createInitialGame(), model: { ...createInitialGame().model, licensed: true } }
    expect(dailyLicensingPayout(licensed).cash).toBe(12_000 + LICENSE_PAYOUT_PER_DAY)

    const voiced: GameState = { ...licensed, model: { ...licensed.model, tech: ['voice'] } }
    expect(dailyLicensingPayout(voiced).cash).toBe(12_000 + LICENSE_PAYOUT_PER_DAY * LICENSE_VOICE_MULTIPLIER)

    expect(dailyLicensingPayout(createInitialGame()).cash).toBe(12_000)
  })
})

describe('technology tree', () => {
  it('gates nodes behind Model IQ and charges the price', () => {
    let game = { ...createInitialGame(), cash: 1_000_000, model: { ...createInitialGame().model, iq: 60 } }
    expect(techAvailable(game, 'context')).toBe(true)
    expect(techAvailable(game, 'multimodal')).toBe(false)
    game = unlockTech(game, 'context')
    expect(game.model.tech).toContain('context')
    expect(game.cash).toBe(1_000_000 - TECH_NODES[0].cost)
    expect(techAvailable(game, 'context')).toBe(false)
  })
})

describe('the board of directors', () => {
  it('passes a company that hits the profit target', () => {
    const game = { ...createInitialGame(), investors: { ...createInitialGame().investors, nextCheckDay: 1 } }
    const economy = { profitPerHour: 3_000 } as never
    const next = dailyInvestors(game, economy, flat)
    expect(next.investors.restrictedUntil).toBeNull()
    expect(next.investors.misses).toBe(0)
  })

  it('punishes a miss with a payout and a spending restriction', () => {
    const game = { ...createInitialGame(), cash: 50_000, investors: { ...createInitialGame().investors, nextCheckDay: 1 } }
    const economy = { profitPerHour: 0 } as never
    const next = dailyInvestors(game, economy, flat)
    expect(next.cash).toBe(50_000 - 5_000)
    expect(next.investors.restrictedUntil).not.toBeNull()
    expect(next.investors.misses).toBe(1)
  })
})

describe('acquisition ending', () => {
  it('requires the IQ and revenue thresholds, pays out and ends the run', () => {
    const weak = { ...createInitialGame(), model: { ...createInitialGame().model, iq: 110 } }
    expect(acquisitionConditionsMet(weak)).toBe(false)
    const strong: GameState = { ...weak, totalRevenue: 2_000_000 }
    expect(acquisitionConditionsMet(strong)).toBe(true)
    const ended = acceptAcquisition(strong)
    expect(ended.ending).toBe('acquired')
  })
})
