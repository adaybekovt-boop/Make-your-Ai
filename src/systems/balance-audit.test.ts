import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ACQUISITION_IQ_THRESHOLD, ACQUISITION_REVENUE_THRESHOLD, CONTRACT_ENTERPRISE_PAYOUT, CONTRACT_OFFICIAL_PAYOUT, INVESTOR_TARGET_PROFIT_PER_HOUR, TECH_NODES } from './config'
import { calculateCompanyEconomy } from './economy'
import { createInitialGame } from './simulation'
import { play } from './balanceScenario'
import { acquisitionConditionsMet, userCapacity } from './market'
import type { ChassisId, ChipId, LocationId } from './types'


function stablePark(chip: ChipId, chassis: ChassisId, id: LocationId, qty: number) {
  const state = createInitialGame()
  state.model.personality = 'friendly'
  const location = state.locations.find(item => item.id === id)!
  location.owned = true
  location.servers = chip === 'consumer-gpu' ? qty : 0
  location.racks = chip === 'consumer-gpu' ? [] : [{ chip, count: qty }]
  location.installedServers = Array.from({ length: qty }, (_, index) => ({ id: `audit-${index}`, chip, chassis, overclock: 1, gridPosition: { row: 0, col: index } }))
  state.users = userCapacity(state, calculateCompanyEconomy(state))
  return state
}

describe('balance audit for 220 users per compute', () => {
  it('measures a passive start and two explicit development policies without free money or fake deliveries', () => {
    const reports = [play({ contractKind: 'official', expand: false }), play({ contractKind: 'official', expand: true }), play({ contractKind: 'grey', expand: true })]
    for (const report of reports) {
      expect(report.measurement.speed).toBe(1)
      expect(report.measurement.humanPlaytest).toBe(false)
      console.log('PROGRESSION_AUDIT', JSON.stringify(report))
    }
    expect(reports[0].firstOfferHour).toBeNull()
    expect(reports[0].day10?.misses).toBe(1)
    expect(reports[0].day10!.profit).toBeLessThan(INVESTOR_TARGET_PROFIT_PER_HOUR)
    // These assertions verify legal/solvent execution, not an invented target duration.
    for (const report of reports.slice(1)) expect(report.minimumCash).toBeGreaterThanOrEqual(0)
    mkdirSync('artifacts/economy-validation', { recursive: true })
    writeFileSync('artifacts/economy-validation/progression.json', JSON.stringify(reports, null, 2))
  })
  it('measures contract purchasing power and technology marginal income at defined stages', () => {
    const mid = stablePark('accelerator', 'rack-cooled', 'technopark', 2)
    const late = stablePark('flagship', 'rack-enterprise', 'campus', 6)
    const economics = [mid, late].map(state => {
      const current = calculateCompanyEconomy(state)
      return { compute: current.effectiveCompute, revenuePerHour: current.revenuePerHour, profitPerHour: current.profitPerHour, officialContractHoursOfRevenue: CONTRACT_OFFICIAL_PAYOUT / current.revenuePerHour, enterpriseContractHoursOfRevenue: CONTRACT_ENTERPRISE_PAYOUT / current.revenuePerHour, technologies: TECH_NODES.map(node => {
        const unlocked = { ...state, model: { ...state.model, tech: [node.id] } }
        unlocked.users = userCapacity(unlocked, calculateCompanyEconomy(unlocked))
        const incremental = calculateCompanyEconomy(unlocked).profitPerHour - current.profitPerHour
        return { id: node.id, price: node.cost, incrementalProfitPerHour: incremental, steadyStatePaybackHours: node.cost / incremental }
      }) }
    })
    console.log('PURCHASING_POWER', JSON.stringify({ officialContract: CONTRACT_OFFICIAL_PAYOUT, enterpriseContract: CONTRACT_ENTERPRISE_PAYOUT, investorTarget: INVESTOR_TARGET_PROFIT_PER_HOUR, acquisitionIQ: ACQUISITION_IQ_THRESHOLD, acquisitionRevenue: ACQUISITION_REVENUE_THRESHOLD, economics }))
    for (const row of economics) expect(row.profitPerHour).toBeGreaterThan(0)
    const state = createInitialGame()
    state.model.iq = ACQUISITION_IQ_THRESHOLD
    state.totalRevenue = ACQUISITION_REVENUE_THRESHOLD - 1
    expect(acquisitionConditionsMet(state)).toBe(false)
    state.totalRevenue++
    expect(acquisitionConditionsMet(state)).toBe(true)
  })
})
