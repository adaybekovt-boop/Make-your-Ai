import { describe, expect, it } from 'vitest'
import { calculateCompanyEconomy, calculateLocationEconomy, calculatePowerBalance, calculateServerROI } from './economy'
import { createInitialGame } from './simulation'
import type { LocationState } from './types'

const garage = (servers = 0): LocationState => ({ id: 'garage', owned: true, servers })

describe('local power balance', () => {
  it.each([
    [0, 0, 0, 1], [0, 3, 0, 1], [2, 3, 2, 1], [3, 3, 3, 1],
    [4, 3, 3, 0.75], [6, 3, 3, 0.5], [2, 0, 0, 0],
  ])('demand %s, capacity %s gives supplied %s and efficiency %s', (demand, capacity, suppliedKw, efficiency) => {
    expect(calculatePowerBalance(demand, capacity)).toEqual({ suppliedKw, efficiency })
  })

  it.each([-1, Number.NaN, Infinity, -Infinity])('rejects invalid demand and capacity %s', (value) => {
    expect(() => calculatePowerBalance(value, 3)).toThrow(RangeError)
    expect(() => calculatePowerBalance(2, value)).toThrow(RangeError)
  })

  it('never supplies more than the request or limit and never boosts performance', () => {
    for (let demand = 0; demand <= 100; demand++) {
      for (let capacity = 0; capacity <= 100; capacity++) {
        const result = calculatePowerBalance(demand, capacity)
        expect(result.suppliedKw).toBeLessThanOrEqual(Math.min(demand, capacity))
        expect(result.efficiency).toBeGreaterThanOrEqual(0)
        expect(result.efficiency).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('location economics', () => {
  it('unowned empty locations cost nothing', () => {
    const economy = calculateLocationEconomy({ id: 'garage', owned: false, servers: 0 })
    expect(economy.profitPerHour).toBe(0)
    expect(economy.expensesPerHour).toBe(0)
    expect(economy.efficiency).toBe(1)
  })

  it('owned empty locations pay rent without revenue', () => {
    expect(calculateLocationEconomy(garage()).profitPerHour).toBe(-80)
  })

  it('one garage GPU earns 754 net per game hour', () => {
    expect(calculateLocationEconomy(garage(1))).toEqual({
      demandKw: 2, suppliedKw: 2, efficiency: 1, effectiveCompute: 1,
      revenuePerHour: 960, electricityPerHour: 36, maintenancePerHour: 90,
      rentPerHour: 80, expensesPerHour: 206, profitPerHour: 754,
    })
  })

  it('two garage GPUs throttle to 75% and pay electricity only for 3 kW', () => {
    expect(calculateLocationEconomy(garage(2))).toEqual({
      demandKw: 4, suppliedKw: 3, efficiency: 0.75, effectiveCompute: 1.5,
      revenuePerHour: 1440, electricityPerHour: 54, maintenancePerHour: 180,
      rentPerHour: 80, expensesPerHour: 314, profitPerHour: 1126,
    })
  })

  it('additional GPUs beyond saturation add maintenance, not compute', () => {
    const two = calculateLocationEconomy(garage(2))
    const three = calculateLocationEconomy(garage(3))
    expect(three.efficiency).toBe(0.5)
    expect(three.revenuePerHour).toBe(two.revenuePerHour)
    expect(three.profitPerHour).toBe(two.profitPerHour - 90)
  })

  it('spare power in a second location never removes garage throttling', () => {
    const game = createInitialGame()
    game.locations[0] = garage(2)
    game.locations[1] = { id: 'workshop', owned: true, servers: 1 }
    const result = calculateCompanyEconomy(game)
    expect(result).toMatchObject({ capacityKw: 11, demandKw: 6, suppliedKw: 5, effectiveCompute: 2.5, serverCount: 3, ownedCount: 2 })
    expect(result.profitPerHour).toBe(1126 + 674)
    expect(result.revenuePerHour - result.expensesPerHour).toBe(result.profitPerHour)
  })

  it('fresh company has no revenue or costs', () => {
    const result = calculateCompanyEconomy(createInitialGame())
    expect(Object.values(result).every((value) => value === 0)).toBe(true)
  })
})

describe('marginal server ROI', () => {
  it('first server excludes already committed rent and location CAPEX', () => {
    expect(calculateServerROI(garage())).toEqual({ incrementalProfitPerHour: 834, paybackHours: 2000 / 834 })
  })

  it('second server accounts for throttling all existing equipment', () => {
    expect(calculateServerROI(garage(1))).toEqual({ incrementalProfitPerHour: 372, paybackHours: 2000 / 372 })
  })

  it('unprofitable third GPU never has a misleading positive payback', () => {
    expect(calculateServerROI(garage(2))).toEqual({ incrementalProfitPerHour: -90, paybackHours: null })
  })
})
