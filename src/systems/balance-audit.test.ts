import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ACQUISITION_IQ_THRESHOLD, ACQUISITION_REVENUE_THRESHOLD, CHASSIS, CHIPS, CONTRACT_ENTERPRISE_PAYOUT, CONTRACT_OFFICIAL_PAYOUT, GAME_HOURS_PER_REAL_SECOND, INVESTOR_TARGET_PROFIT_PER_HOUR, TECH_NODES } from './config'
import { calculateCompanyEconomy } from './economy'
import { advanceSimulation, buyLocation, createInitialGame } from './simulation'
import { acceptContract } from './contracts'
import { firstFreeCell, locationDefinition, locationEquipment } from './serverGrid'
import { mountChassisFromInventory, mountChipFromInventory, orderPrice, orderServerKit } from './procurement'
import { acquisitionConditionsMet, gameDay, techAvailable, unlockTech, userCapacity } from './market'
import { buyDataLot, startTraining } from './training'
import type { ActionResult, ChassisId, ChipId, ContractKind, GameState, LocationId } from './types'

const safe = () => 0.99
const unwrap = (action: ActionResult): GameState => { if (!action.ok) throw new Error(action.error); return action.state }
const step = (state: GameState) => advanceSimulation(state, 1 / GAME_HOURS_PER_REAL_SECOND, safe)
const plans: Array<{ id: LocationId; chip: ChipId; chassis: ChassisId; qty: number }> = [
  { id: 'garage', chip: 'consumer-gpu', chassis: 'rack-basic', qty: 1 },
  { id: 'workshop', chip: 'pro-gpu', chassis: 'rack-basic', qty: 2 },
  { id: 'technopark', chip: 'accelerator', chassis: 'rack-cooled', qty: 2 },
  { id: 'server-hall', chip: 'flagship', chassis: 'rack-enterprise', qty: 3 },
  { id: 'campus', chip: 'flagship', chassis: 'rack-enterprise', qty: 6 },
]

/** A reproducible player policy, not an optimal agent or a stochastic playtest. */
function play(contractKind: Extract<ContractKind, 'official' | 'grey'>, expand: boolean) {
  let state = createInitialGame()
  state.model.personality = 'friendly'
  let minimumCash = state.cash, firstOfferHour: number | null = null
  let day10: { cash: number; profit: number; iq: number; misses: number } | null = null
  const snapshots: Array<Record<string, number>> = []
  for (let hour = 0; hour < 960; hour++) {
    if (state.contracts.pending && expand) state = unwrap(acceptContract(state, contractKind))
    const currentPlan = plans.find(plan => {
      if (!expand && plan.id !== 'garage') return false
      const location = state.locations.find(item => item.id === plan.id)!
      return !location.owned || (location.installedServers?.length ?? 0) < plan.qty
    })
    if (currentPlan && state.orders.length === 0) {
      const definition = locationDefinition(currentPlan.id)
      let location = state.locations.find(item => item.id === currentPlan.id)!
      const kit = orderPrice(CHIPS[currentPlan.chip].price, 'official', 1) + orderPrice(CHASSIS[currentPlan.chassis].price, 'official', 1)
      const inStock = (location.inventory?.chips[currentPlan.chip] ?? 0) > 0 && (location.inventory?.chassis[currentPlan.chassis] ?? 0) > 0
      const reserve = currentPlan.id === 'garage' ? 0 : Math.max(12000, calculateCompanyEconomy(state).expensesPerHour * 24)
      if (inStock) {
        const position = firstFreeCell(location)
        if (position) {
          state = unwrap(mountChassisFromInventory(state, location.id, position, currentPlan.chassis, safe))
          state = unwrap(mountChipFromInventory(state, location.id, position, currentPlan.chip, safe))
        }
      } else if (state.cash >= kit + (location.owned ? 0 : definition.price) + reserve) {
        if (!location.owned) {
          const purchase = buyLocation(state, location.id)
          if (purchase.ok) state = purchase.state
        }
        location = state.locations.find(item => item.id === currentPlan.id)!
        const position = firstFreeCell(location)
        if (location.owned && position && locationEquipment(location).demandKw + CHIPS[currentPlan.chip].powerKw <= definition.powerLimitKw) {
          const order = orderServerKit(state, { locationId: location.id, chip: currentPlan.chip, chassis: currentPlan.chassis, channel: 'official', qty: 1, targetCell: position })
          if (order.ok) state = order.state
        }
      }
    }
    if (expand && !state.model.run && state.model.iq < 126 && state.cash >= 14000 + Math.max(12000, calculateCompanyEconomy(state).expensesPerHour * 24)) {
      const bought = buyDataLot(state, 'official')
      if (bought.ok) { state = bought.state; const training = startTraining(state); if (training.ok) state = training.state }
    }
    if (expand) {
      const node = TECH_NODES.find(node => techAvailable(state, node.id))
      if (node && state.cash >= node.cost + 50000) state = unlockTech(state, node.id)
    }
    minimumCash = Math.min(minimumCash, state.cash)
    state = step(state)
    minimumCash = Math.min(minimumCash, state.cash)
    const economy = calculateCompanyEconomy(state)
    if (day10 === null && gameDay(state) >= 10) day10 = { cash: state.cash, profit: economy.profitPerHour, iq: state.model.iq, misses: state.investors.misses }
    if (state.acquisitionOffered && firstOfferHour === null) firstOfferHour = state.elapsedGameHours
    if (hour % 48 === 47) snapshots.push({ hour: state.elapsedGameHours, cash: state.cash, profit: economy.profitPerHour, iq: state.model.iq, revenue: state.totalRevenue, compute: economy.effectiveCompute })
    if (firstOfferHour !== null || state.cash < 0) break
  }
  return { policy: { contractKind, expand, training: 'official only', licensing: false, randomIncidents: 'benign deterministic RNG', reserveHours: 24, optimized: false }, minimumCash, day10, firstOfferHour, realMinutes1x: firstOfferHour, realMinutes3x: firstOfferHour === null ? null : firstOfferHour / 3, finalHour: state.elapsedGameHours, finalRevenue: state.totalRevenue, finalIQ: state.model.iq, tech: state.model.tech, snapshots }
}

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
    const reports = [play('official', false), play('official', true), play('grey', true)]
    for (const report of reports) console.log('PROGRESSION_AUDIT', JSON.stringify(report))
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
