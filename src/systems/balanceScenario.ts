import { CHASSIS, CHIPS, GAME_HOURS_PER_REAL_SECOND, TECH_NODES } from './config'
import { calculateCompanyEconomy } from './economy'
import { advanceSimulation, buyLocation, createInitialGame } from './simulation'
import { acceptContract } from './contracts'
import { firstFreeCell, locationDefinition, locationEquipment } from './serverGrid'
import { mountChassisFromInventory, mountChipFromInventory, orderEquipment, orderPrice, orderServerKit } from './procurement'
import { gameDay, isModelOnline, techAvailable, unlockTech } from './market'
import { buyDataLot, startTraining } from './training'
import type { ActionResult, ChassisId, ChipId, ContractKind, DataQuality, GameState, LocationId, Rng } from './types'

const unwrap = (action: ActionResult): GameState => { if (!action.ok) throw new Error(action.error); return action.state }
const plans: Array<{ id: LocationId; chip: ChipId; chassis: ChassisId; qty: number }> = [
  { id: 'garage', chip: 'consumer-gpu', chassis: 'rack-basic', qty: 1 },
  { id: 'workshop', chip: 'pro-gpu', chassis: 'rack-basic', qty: 2 },
  { id: 'technopark', chip: 'accelerator', chassis: 'rack-cooled', qty: 2 },
  { id: 'server-hall', chip: 'flagship', chassis: 'rack-enterprise', qty: 3 },
  { id: 'campus', chip: 'flagship', chassis: 'rack-enterprise', qty: 6 },
]

/** Reproducible policy for automated measurement, not a human playtest. */
export interface ScenarioOptions {
  contractKind: Extract<ContractKind, 'official' | 'grey'>
  expand: boolean
  quality?: DataQuality
  seed?: number
}

/** LCG already used by simulation regression tests; seeds are not selected for survival. */
function seeded(seed: number): Rng {
  let value = seed >>> 0
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32 }
}

export function play({ contractKind, expand, quality = 'official', seed }: ScenarioOptions) {
  const rng = seed === undefined ? () => .99 : seeded(seed)
  let state = createInitialGame()
  state.speed = 1
  state.model.personality = 'friendly'
  let minimumCash = state.cash, firstOfferHour: number | null = null
  let day10: { cash: number; profit: number; iq: number; misses: number } | null = null
  let acceptedContracts = 0
  let trainingBlockedAfterDowntime = false
  const incidents: Array<{ hour: number; cash: number; message: string }> = []
  const observe = () => {
    minimumCash = Math.min(minimumCash, state.cash)
    for (const message of state.pendingNotices) {
      if (/Пожар на сервере|Суд за нелегальные|Оборудование отказало|Промпт-инъекция|Обнаружен вредоносный|Брак серого/.test(message)) {
        incidents.push({ hour: state.elapsedGameHours, cash: state.cash, message })
      }
    }
    state = { ...state, pendingNotices: [] }
  }
  const snapshots: Array<Record<string, number>> = []
  for (let hour = 0; hour < 960; hour++) {
    if (state.speed !== 1) throw new Error('The primary pacing metric must use 1x.')
    if (state.contracts.pending && expand) {
      const action = acceptContract(state, contractKind)
      if (action.ok) { state = action.state; acceptedContracts++ }
    }
    const currentPlan = plans.find(plan => {
      if (!expand && plan.id !== 'garage') return false
      const location = state.locations.find(item => item.id === plan.id)!
      return !location.owned || (location.installedServers?.length ?? 0) < plan.qty
    })
    if (currentPlan && state.orders.length === 0) {
      const definition = locationDefinition(currentPlan.id)
      let location = state.locations.find(item => item.id === currentPlan.id)!
      const rig = location.rigs?.find(item => CHASSIS[item.chassis].chips.includes(currentPlan.chip))
      const kit = orderPrice(CHIPS[currentPlan.chip].price, 'official', 1) + (rig ? 0 : orderPrice(CHASSIS[currentPlan.chassis].price, 'official', 1))
      const inStock = (location.inventory?.chips[currentPlan.chip] ?? 0) > 0 && (!!rig || (location.inventory?.chassis[currentPlan.chassis] ?? 0) > 0)
      const reserve = currentPlan.id === 'garage' ? 0 : Math.max(12000, calculateCompanyEconomy(state).expensesPerHour * 24)
      if (inStock) {
        const position = rig?.gridPosition ?? firstFreeCell(location)
        if (position) {
          if (!rig) state = unwrap(mountChassisFromInventory(state, location.id, position, currentPlan.chassis, rng))
          state = unwrap(mountChipFromInventory(state, location.id, position, currentPlan.chip, rng))
        }
      } else if (state.cash >= kit + (location.owned ? 0 : definition.price) + reserve) {
        if (!location.owned) {
          const purchase = buyLocation(state, location.id)
          if (purchase.ok) state = purchase.state
        }
        location = state.locations.find(item => item.id === currentPlan.id)!
        const position = rig?.gridPosition ?? firstFreeCell(location)
        if (location.owned && position && locationEquipment(location).demandKw + CHIPS[currentPlan.chip].powerKw <= definition.powerLimitKw) {
          const order = rig ? orderEquipment(state, { locationId: location.id, kind: 'chip', item: currentPlan.chip, channel: 'official', qty: 1, targetCell: position }) : orderServerKit(state, { locationId: location.id, chip: currentPlan.chip, chassis: currentPlan.chassis, channel: 'official', qty: 1, targetCell: position })
          if (order.ok) state = order.state
        }
      }
    }
    if (expand && !state.model.run && state.model.iq < 126 && isModelOnline(state)) {
      // Do not buy another batch every hour while the previous one cannot start.
      // A historical offlineUntil guard is measured, never cleared by this harness.
      if (!state.model.queue.length && state.cash >= (quality === 'official' ? 14000 : 5000) + Math.max(12000, calculateCompanyEconomy(state).expensesPerHour * 24)) {
        state = unwrap(buyDataLot(state, quality))
      }
      if (state.model.queue.length) {
        const training = startTraining(state)
        if (training.ok) state = training.state
        else if (state.model.offlineUntil !== null) trainingBlockedAfterDowntime = true
      }
    }
    if (expand) {
      const node = TECH_NODES.find(node => techAvailable(state, node.id))
      if (node && state.cash >= node.cost + 50000) state = unlockTech(state, node.id)
    }
    observe()
    state = advanceSimulation(state, 1 / GAME_HOURS_PER_REAL_SECOND, rng)
    observe()
    const economy = calculateCompanyEconomy(state)
    if (day10 === null && gameDay(state) >= 10) day10 = { cash: state.cash, profit: economy.profitPerHour, iq: state.model.iq, misses: state.investors.misses }
    if (state.acquisitionOffered && firstOfferHour === null) firstOfferHour = state.elapsedGameHours
    if (hour % 48 === 47) snapshots.push({ hour: state.elapsedGameHours, cash: state.cash, profit: economy.profitPerHour, iq: state.model.iq, revenue: state.totalRevenue, compute: economy.effectiveCompute })
    if (firstOfferHour !== null || state.cash < 0) break
  }
  return { measurement: { speed: 1, humanPlaytest: false, wallClockPlaytest: false, horizonGameHours: 960, primaryMetric: 'realMinutes1x', rng: seed === undefined ? 'benign constant 0.99' : 'LCG32', seed: seed ?? null }, policy: { contractKind, expand, training: quality, licensing: false, reserveHours: 24, optimized: false, replacement: 'procurement into retained chassis or new kit; no restart' }, acceptedContracts, incidents, trainingBlockedAfterDowntime, outcome: firstOfferHour !== null ? 'acquisition-offered' : state.cash < 0 ? 'negative-balance' : 'time-limit', minimumCash, day10, firstOfferHour, realMinutes1x: firstOfferHour, realMinutes3x: firstOfferHour === null ? null : firstOfferHour / 3, finalHour: state.elapsedGameHours, finalRevenue: state.totalRevenue, finalIQ: state.model.iq, tech: state.model.tech, snapshots }
}
