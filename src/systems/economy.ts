import { CHASSIS, ELECTRICITY_PRICE_PER_KWH, SERVER } from './config'
import { firstFreeCell, locationDefinition, locationEquipment } from './serverGrid'
import { cityPropertyEconomy } from './city'
import { regionElectricityMult, seasonalityMult, subscriptionPerHour, tokenRevenuePerHour, userCapacity } from './market'
import { salariesPerHour } from './team'
import { orderPrice } from './procurement'
import type { CompanyEconomy, GameState, LocationEconomy, LocationState } from './types'

export function calculatePowerBalance(demandKw: number, capacityKw: number): { suppliedKw: number; efficiency: number } {
  if (!Number.isFinite(demandKw) || demandKw < 0) throw new RangeError('Power demand must be finite and nonnegative.')
  if (!Number.isFinite(capacityKw) || capacityKw < 0) throw new RangeError('Power capacity must be finite and nonnegative.')
  return { suppliedKw: Math.min(demandKw, capacityKw), efficiency: demandKw === 0 ? 1 : Math.min(1, capacityKw / demandKw) }
}

/** Physical output and costs only. No direct conversion of compute into money. */
function infrastructure(location: LocationState, electricityMult: number): LocationEconomy {
  const definition = locationDefinition(location.id)
  const equipment = location.owned ? locationEquipment(location) : { demandKw: 0, compute: 0, maintenancePerHour: 0 }
  const { suppliedKw, efficiency } = calculatePowerBalance(equipment.demandKw, definition.powerLimitKw)
  const electricityPerHour = suppliedKw * ELECTRICITY_PRICE_PER_KWH * electricityMult
  const rentPerHour = location.owned ? definition.rentPerHour : 0
  const expensesPerHour = electricityPerHour + equipment.maintenancePerHour + rentPerHour
  return {
    demandKw: equipment.demandKw, suppliedKw, efficiency, effectiveCompute: equipment.compute * efficiency,
    revenuePerHour: 0, electricityPerHour, maintenancePerHour: equipment.maintenancePerHour,
    rentPerHour, expensesPerHour, profitPerHour: -expensesPerHour,
  }
}

function companyCompute(state: GameState): number {
  return [...state.locations, ...state.regionLocations].reduce((sum, location) => sum + infrastructure(location, 1).effectiveCompute, 0)
}

/** Without company context there is no audience revenue to attribute. */
export function calculateLocationEconomy(
  location: LocationState,
  electricityMult = regionElectricityMult(location.id),
  state?: GameState,
): LocationEconomy {
  const result = infrastructure(location, electricityMult * (state ? seasonalityMult(state) : 1))
  const totalCompute = state ? companyCompute(state) : 0
  const revenuePerHour = state && totalCompute > 0
    ? (tokenRevenuePerHour(state) + subscriptionPerHour(state)) * result.effectiveCompute / totalCompute
    : 0
  return { ...result, revenuePerHour, profitPerHour: revenuePerHour - result.expensesPerHour }
}

/** Recurring company cash rates; daily and one-off events are posted separately. */
export function calculateCompanyEconomy(state: GameState): CompanyEconomy {
  const totals: CompanyEconomy = {
    serverRevenuePerHour: tokenRevenuePerHour(state) + subscriptionPerHour(state),
    propertyRevenuePerHour: 0, propertyExpensesPerHour: 0, salariesPerHour: salariesPerHour(state),
    revenuePerHour: 0, electricityPerHour: 0, maintenancePerHour: 0, rentPerHour: 0,
    expensesPerHour: 0, profitPerHour: 0, demandKw: 0, suppliedKw: 0, capacityKw: 0,
    effectiveCompute: 0, serverCount: 0, ownedCount: 0,
  }
  for (const location of [...state.locations, ...state.regionLocations]) {
    const local = infrastructure(location, regionElectricityMult(location.id) * seasonalityMult(state))
    totals.electricityPerHour += local.electricityPerHour
    totals.maintenancePerHour += local.maintenancePerHour
    totals.rentPerHour += local.rentPerHour
    totals.demandKw += local.demandKw
    totals.suppliedKw += local.suppliedKw
    totals.effectiveCompute += local.effectiveCompute
    if (location.owned) {
      totals.capacityKw += locationDefinition(location.id).powerLimitKw
      totals.serverCount += location.servers + (location.racks?.reduce((sum, rack) => sum + rack.count, 0) ?? 0)
      totals.ownedCount += 1
    }
  }
  const property = cityPropertyEconomy(state)
  totals.propertyRevenuePerHour = property.revenuePerHour
  totals.propertyExpensesPerHour = property.expensesPerHour
  totals.revenuePerHour = totals.serverRevenuePerHour + totals.propertyRevenuePerHour
  totals.expensesPerHour = totals.electricityPerHour + totals.maintenancePerHour + totals.rentPerHour + totals.propertyExpensesPerHour + totals.salariesPerHour
  totals.profitPerHour = totals.revenuePerHour - totals.expensesPerHour
  return totals
}

/**
 * Conditional steady-state forecast for one additional official Terra T1/basic kit.
 * Excludes delivery time and the audience ramp from the nominal payback. It is NOT
 * an immediate revenue increase, and does not promise that placement is possible.
 */
export function calculateServerROI(location: LocationState, state: GameState) {
  const current = infrastructure(location, regionElectricityMult(location.id) * seasonalityMult(state))
  const equipment = locationEquipment(location)
  const definition = locationDefinition(location.id)
  const nextPower = calculatePowerBalance(equipment.demandKw + SERVER.powerKw, definition.powerLimitKw)
  const deltaCompute = (equipment.compute + SERVER.compute) * nextPower.efficiency - current.effectiveCompute
  const deltaCosts = SERVER.maintenancePerHour + (nextPower.suppliedKw - current.suppliedKw) * ELECTRICITY_PRICE_PER_KWH * regionElectricityMult(location.id) * seasonalityMult(state)
  // Temporary downtime and promotional boosts are not perpetual revenue sources.
  const stable: GameState = {
    ...state, model: { ...state.model, offlineUntil: null },
    benchmark: { ...state.benchmark, adBoostUntil: null },
    market: { ...state.market, viralUntil: null, ambientBoostUntil: null, ambientPenaltyUntil: null },
  }
  const revenueAtCapacity = (effectiveCompute: number): number => {
    const projected = { ...stable, users: userCapacity(stable, { effectiveCompute }) }
    return tokenRevenuePerHour(projected) + subscriptionPerHour(projected)
  }
  const compute = companyCompute(state)
  const incrementalProfitPerHour = revenueAtCapacity(compute + deltaCompute) - revenueAtCapacity(compute) - deltaCosts
  const capitalCost = orderPrice(SERVER.price, 'official', 1) + orderPrice(CHASSIS['rack-basic'].price, 'official', 1)
  return {
    forecast: 'steady-state' as const,
    capitalCost,
    installable: location.owned && firstFreeCell(location) !== null && equipment.demandKw + SERVER.powerKw <= definition.powerLimitKw,
    immediateProfitPerHour: -deltaCosts,
    incrementalProfitPerHour,
    paybackHours: incrementalProfitPerHour > 0 ? capitalCost / incrementalProfitPerHour : null,
  }
}
