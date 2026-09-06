import {
  ELECTRICITY_PRICE_PER_KWH,
  getLocationDefinition,
  getRegionLocationDefinition,
  REVENUE_PER_COMPUTE_HOUR,
  SERVER,
} from './config'
import { locationDefinition, locationEquipment } from './serverGrid'
import { cityPropertyEconomy } from './city'
import { seasonalityMult } from './market'
import type { AnyLocationId, CompanyEconomy, GameState, LocationEconomy, LocationState } from './types'

export function calculatePowerBalance(
  demandKw: number,
  capacityKw: number,
): { suppliedKw: number; efficiency: number } {
  if (!Number.isFinite(demandKw) || demandKw < 0) {
    throw new RangeError('Power demand must be finite and nonnegative.')
  }
  if (!Number.isFinite(capacityKw) || capacityKw < 0) {
    throw new RangeError('Power capacity must be finite and nonnegative.')
  }

  return {
    suppliedKw: Math.min(demandKw, capacityKw),
    efficiency: demandKw === 0 ? 1 : Math.min(1, capacityKw / demandKw),
  }
}

export function calculateLocationEconomy(location: LocationState, electricityMult = 1): LocationEconomy {
  // Region entries reuse this shape but their rent/power are computed by the caller.
  const definition = locationDefinition(location.id)
  const equipment = locationEquipment(location)
  const demandKw = equipment.demandKw
  const { suppliedKw, efficiency } = calculatePowerBalance(demandKw, definition.powerLimitKw)
  const effectiveCompute = equipment.compute * efficiency
  const revenuePerHour = effectiveCompute * REVENUE_PER_COMPUTE_HOUR
  const electricityPerHour = suppliedKw * ELECTRICITY_PRICE_PER_KWH * electricityMult
  // Throttled servers still incur their full maintenance cost.
  const maintenancePerHour = equipment.maintenancePerHour
  const rentPerHour = location.owned ? definition.rentPerHour : 0
  const expensesPerHour = electricityPerHour + maintenancePerHour + rentPerHour

  return {
    demandKw,
    suppliedKw,
    efficiency,
    effectiveCompute,
    revenuePerHour,
    electricityPerHour,
    maintenancePerHour,
    rentPerHour,
    expensesPerHour,
    profitPerHour: revenuePerHour - expensesPerHour,
  }
}

export function calculateCompanyEconomy(state: GameState): CompanyEconomy {
  const totals: CompanyEconomy = {
    revenuePerHour: 0,
    electricityPerHour: 0,
    maintenancePerHour: 0,
    rentPerHour: 0,
    expensesPerHour: 0,
    profitPerHour: 0,
    demandKw: 0,
    suppliedKw: 0,
    capacityKw: 0,
    effectiveCompute: 0,
    serverCount: 0,
    ownedCount: 0,
  }

  const accumulate = (economy: LocationEconomy, servers: number, capacityKw: number | null) => {
    totals.revenuePerHour += economy.revenuePerHour
    totals.electricityPerHour += economy.electricityPerHour
    totals.maintenancePerHour += economy.maintenancePerHour
    totals.rentPerHour += economy.rentPerHour
    totals.expensesPerHour += economy.expensesPerHour
    totals.profitPerHour += economy.profitPerHour
    totals.demandKw += economy.demandKw
    totals.suppliedKw += economy.suppliedKw
    totals.effectiveCompute += economy.effectiveCompute
    totals.serverCount += servers
    if (capacityKw !== null) {
      totals.capacityKw += capacityKw
      totals.ownedCount += 1
    }
  }

  for (const location of state.locations) {
    // Balance each location before summing; spare power cannot cross locations.
    const economy = calculateLocationEconomy(location)
    const capacityKw = location.owned ? getLocationDefinition(location.id as Exclude<AnyLocationId, 'overseas-west' | 'overseas-east'>).powerLimitKw : null
    accumulate(economy, location.servers + (location.racks?.reduce((sum, rack) => sum + rack.count, 0) ?? 0), capacityKw)
  }

  for (const location of state.regionLocations) {
    const { region, location: definition } = getRegionLocationDefinition(location.id)
    // Region rent and power limit come from the region definition, not the base map.
    const equipment = locationEquipment(location)
  const demandKw = equipment.demandKw
    const { suppliedKw, efficiency } = calculatePowerBalance(demandKw, definition.powerLimitKw)
    const effectiveCompute = equipment.compute * efficiency
    const revenuePerHour = effectiveCompute * REVENUE_PER_COMPUTE_HOUR
    const electricityPerHour = suppliedKw * ELECTRICITY_PRICE_PER_KWH * region.electricityMult
    const maintenancePerHour = equipment.maintenancePerHour
    const rentPerHour = location.owned ? definition.rentPerHour : 0
    const expensesPerHour = electricityPerHour + maintenancePerHour + rentPerHour
    accumulate(
      {
        demandKw,
        suppliedKw,
        efficiency,
        effectiveCompute,
        revenuePerHour,
        electricityPerHour,
        maintenancePerHour,
        rentPerHour,
        expensesPerHour,
        profitPerHour: revenuePerHour - expensesPerHour,
      },
      location.servers + (location.racks?.reduce((sum, rack) => sum + rack.count, 0) ?? 0),
      location.owned ? definition.powerLimitKw : null,
    )
  }

  const property = cityPropertyEconomy(state)
  totals.revenuePerHour += property.revenuePerHour
  totals.rentPerHour += property.expensesPerHour

  // Cooling seasonality scales the whole electricity bill; it starts neutral.
  const season = seasonalityMult(state)
  totals.electricityPerHour *= season
  totals.expensesPerHour = totals.electricityPerHour + totals.maintenancePerHour + totals.rentPerHour
  totals.profitPerHour = totals.revenuePerHour - totals.expensesPerHour

  return totals
}

export function calculateServerROI(
  location: LocationState,
): { incrementalProfitPerHour: number; paybackHours: number | null } {
  const current = calculateLocationEconomy(location)
  const next = calculateLocationEconomy(location.installedServers
    ? { ...location, installedServers: [...location.installedServers, { id: 'roi-preview', chip: 'consumer-gpu', overclock: 1, gridPosition: { row: 0, col: 0 } }] }
    : { ...location, servers: location.servers + 1 })
  const incrementalProfitPerHour = next.profitPerHour - current.profitPerHour

  return {
    incrementalProfitPerHour,
    paybackHours: incrementalProfitPerHour > 0 ? SERVER.price / incrementalProfitPerHour : null,
  }
}
