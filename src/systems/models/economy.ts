import { SERVER } from '../config'
import { locationDefinition, locationEquipment } from '../serverGrid'
import { calculateCompanyEconomy, calculateLocationEconomy, calculatePowerBalance, calculateServerROI } from '../economy'
import { dailyUserStep, isModelOnline, subscriptionPerHour, tokenRevenuePerHour, userCapacity } from '../market'
import { trainingRate } from '../training'
import type { AnyLocationId, CompanyEconomy } from '../types'
import { baseDefinition, COMPUTE_BUDGET_BPS, quantizationQuality, quantizationThroughput } from './config'
import { companyView, getModel, modelView, withModel } from './state'
import type { CompanyState, ManagedModel, ModelId } from './types'

export interface ModelEconomy {
  modelId: ModelId
  allocatedCompute: number
  inferenceCompute: number
  capacity: number
  users: number
  tokenRevenuePerHour: number
  subscriptionRevenuePerHour: number
  revenuePerHour: number
  trainingVolumePerHour: number
}
export interface PortfolioEconomy extends CompanyEconomy { models: ModelEconomy[] }

export function modelEconomy(state: CompanyState, id: ModelId, totalCompute: number): ModelEconomy {
  const model = getModel(state, id), view = modelView(state, id), base = baseDefinition(model.baseId)
  const allocatedCompute = totalCompute * model.allocationBps / COMPUTE_BUDGET_BPS
  const inferenceCompute = allocatedCompute / base.inferenceCost * quantizationThroughput(model.quantization)
  const capacity = userCapacity(view, { effectiveCompute: inferenceCompute })
  // Keep legacy flagship billing intact. Portfolio entries with no resources cannot earn on stored users.
  const available = state.strategy === 'flagship' || allocatedCompute > 0
  const quality = quantizationQuality(model.quantization)
  const tokenRevenue = available ? tokenRevenuePerHour(view) * quality : 0
  const subscriptionRevenue = available ? subscriptionPerHour(view) * quality : 0
  return {
    modelId: id, allocatedCompute, inferenceCompute, capacity, users: model.users,
    tokenRevenuePerHour: tokenRevenue, subscriptionRevenuePerHour: subscriptionRevenue,
    revenuePerHour: tokenRevenue + subscriptionRevenue,
    // Quantization changes serving, never full-precision training speed.
    trainingVolumePerHour: trainingRate(view, allocatedCompute / base.trainingCost),
  }
}
export function portfolioEconomy(state: CompanyState): PortfolioEconomy {
  const infrastructure = calculateCompanyEconomy(companyView(state))
  const models = state.models.map(model => modelEconomy(state, model.id, infrastructure.effectiveCompute))
  const serverRevenuePerHour = models.reduce((sum, model) => sum + model.revenuePerHour, 0)
  const revenuePerHour = infrastructure.propertyRevenuePerHour + serverRevenuePerHour
  return { ...infrastructure, models, serverRevenuePerHour, revenuePerHour,
    profitPerHour: revenuePerHour - infrastructure.expensesPerHour }
}
export function portfolioLocationEconomy(state: CompanyState, locationId: AnyLocationId) {
  const location = [...state.company.locations, ...state.company.regionLocations].find(item => item.id === locationId)
  if (!location) throw new RangeError('Локация не найдена.')
  const view = companyView(state)
  const local = calculateLocationEconomy(location, undefined, view)
  const total = portfolioEconomy(state)
  const revenuePerHour = total.effectiveCompute > 0 ? total.serverRevenuePerHour * local.effectiveCompute / total.effectiveCompute : 0
  return { ...local, revenuePerHour, profitPerHour: revenuePerHour - local.expensesPerHour }
}
/** Target changes never create users. Acquisition/churn stays on the existing daily hook. */
export function dailyPortfolioUsers(state: CompanyState): CompanyState {
  const economy = portfolioEconomy(state)
  let next = state
  for (const rates of economy.models) {
    const model = getModel(next, rates.modelId), view = modelView(next, rates.modelId)
    const users = Math.max(0, dailyUserStep(view, rates.capacity))
    next = withModel(next, { ...model, users })
  }
  return next
}
export function modelIsOnline(state: CompanyState, model: ManagedModel): boolean {
  return isModelOnline(modelView(state, model.id))
}

/** Forecasts all models on the same shared budget; no first-model-only ROI approximation. */
export function portfolioServerROI(state: CompanyState, locationId: AnyLocationId) {
  const location = [...state.company.locations, ...state.company.regionLocations].find(item => item.id === locationId)
  if (!location) throw new RangeError('Локация не найдена.')
  const physical = calculateCompanyEconomy(companyView(state))
  const base = calculateServerROI(location, companyView(state))
  const current = calculateLocationEconomy(location)
  const equipment = locationEquipment(location)
  const power = calculatePowerBalance(equipment.demandKw + SERVER.powerKw, locationDefinition(location.id).powerLimitKw)
  const deltaCompute = (equipment.compute + SERVER.compute) * power.efficiency - current.effectiveCompute
  const stable: CompanyState = { ...state,
    company: { ...state.company, market: { ...state.company.market, viralUntil: null, ambientBoostUntil: null, ambientPenaltyUntil: null } },
    models: state.models.map(model => ({ ...model, state: { ...model.state, offlineUntil: null },
      benchmark: { ...model.benchmark, adBoostUntil: null } })) }
  const revenueAt = (compute: number): number => stable.models.reduce((sum, model) => {
    const capacity = modelEconomy(stable, model.id, compute).capacity
    return sum + modelEconomy(withModel(stable, { ...model, users: capacity }), model.id, compute).revenuePerHour
  }, 0)
  const incrementalProfitPerHour = revenueAt(physical.effectiveCompute + deltaCompute) - revenueAt(physical.effectiveCompute) + base.immediateProfitPerHour
  return { ...base, incrementalProfitPerHour,
    paybackHours: incrementalProfitPerHour > 0 ? base.capitalCost / incrementalProfitPerHour : null }
}
