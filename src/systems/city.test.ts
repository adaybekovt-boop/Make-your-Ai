import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CITY_TOWERS, buyCityTower, cityPropertyEconomy } from './city'
import { advanceSimulation, buyChip, buyLocation, createInitialGame, sellChip } from './simulation'
import { calculateCompanyEconomy } from './economy'
import { decodeSave, makeSaveEnvelope, validateGameState } from '../persistence/saves'
import { installedChips } from './serverSlots'
import type { ActionResult } from './types'

const unwrap = (result: ActionResult) => { if (!result.ok) throw new Error(result.error); return result.state }

describe('city properties', () => {
  it('rejects unaffordable, duplicate and restricted purchases without mutation', () => {
    const initial = createInitialGame()
    expect(buyCityTower(initial, 'meridian').ok).toBe(false)
    const rich = { ...initial, cash: 500_000 }
    const purchased = unwrap(buyCityTower(rich, 'meridian'))
    expect(rich.cityProperties).toBeUndefined()
    expect(purchased.cash).toBe(455_000)
    expect(purchased.totalCapex).toBe(45_000)
    expect(buyCityTower(purchased, 'meridian').ok).toBe(false)
    expect(buyCityTower({ ...rich, ending: 'acquired' }, 'horizon').ok).toBe(false)
    expect(buyCityTower({ ...rich, investors: { ...rich.investors, restrictedUntil: 24 } }, 'orbit').ok).toBe(false)
  })
  it('books rental income and operating costs through the existing hourly ledger', () => {
    const initial = { ...createInitialGame(), cash: 45_000 }
    const purchased = unwrap(buyCityTower(initial, 'meridian'))
    const economy = calculateCompanyEconomy(purchased)
    expect(economy.revenuePerHour).toBe(360)
    expect(economy.expensesPerHour).toBe(80)
    expect(economy.profitPerHour).toBe(280)
    const after = advanceSimulation(purchased, 60, () => .99)
    expect(after.cash).toBe(280)
    expect(after.totalRevenue).toBe(360)
    expect(after.totalExpenses).toBe(80)
  })
  it('preserves old saves and roundtrips purchased towers', () => {
    const initial = createInitialGame()
    expect(decodeSave(makeSaveEnvelope(initial)).game).toEqual(initial)
    const owned = { ...initial, cityProperties: CITY_TOWERS.map((item) => item.id) }
    expect(decodeSave(makeSaveEnvelope(owned)).game.cityProperties).toEqual(owned.cityProperties)
    expect(cityPropertyEconomy(owned).profitPerHour).toBe(2990)
    expect(() => validateGameState({ ...initial, cityProperties: ['not-a-tower'] })).toThrow()
    expect(() => validateGameState({ ...initial, cityProperties: ['orbit', 'orbit'] })).toThrow()
  })
})

describe('shop delivery and mixed roof slots', () => {
  it('delivers a pro chip at the existing market price and can sell the correct class', () => {
    let game = unwrap(buyLocation({ ...createInitialGame(), cash: 50_000 }, 'workshop'))
    game = { ...game, market: { ...game.market, chips: { ...game.market.chips, 'pro-gpu': { price: 5200, trend: -1 } } } }
    game = unwrap(buyChip(game, 'workshop', 'consumer-gpu'))
    const before = game.cash
    game = unwrap(buyChip(game, 'workshop', 'pro-gpu'))
    expect(game.cash).toBe(before - 5200)
    expect(installedChips(game.locations[1])).toEqual(['consumer-gpu', 'pro-gpu'])
    expect(calculateCompanyEconomy(game).demandKw).toBe(5)
    game = unwrap(sellChip(game, 'workshop', 'pro-gpu'))
    expect(installedChips(game.locations[1])).toEqual(['consumer-gpu'])
  })
})
