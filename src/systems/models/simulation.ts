import { GAME_HOURS_PER_REAL_SECOND } from '../config'
import { dailyAmbientGmi, dailyCompetitorStep } from '../competitor'
import { clearExpiredOffer, closeCompletedContract, maybeGenerateOffer } from '../contracts'
import { dailyExposureRoll } from '../benchmark'
import { dailyComplaintRoll, dailyCourtRoll, dailyPromptInjectionRoll, dailyRandomEvent } from '../events'
import { dailyEquipmentFailures } from '../equipment'
import {
  dailyAdvertisingBilling, dailyChipMarket, dailyInsuranceBilling, dailyInvestors, dailyLicensingPayout,
  maybeOfferAcquisition,
} from '../market'
import { dailyMoraleStep } from '../team'
import { dailyMalwareRoll, tickTraining } from '../training'
import { deliverOrders } from '../procurement'
import { rareCarArrival } from '../rareTraffic'
import { locationDefinition, locationEquipment } from '../serverGrid'
import type { GameState, Rng } from '../types'
import { baseDefinition, CATEGORIES, effectiveProfile, meanProfile } from './config'
import { benchmarkIsCurrent, companyView, getModel, mergeCompany, mergeModel, modelView, withModel } from './state'
import { dailyPortfolioUsers, portfolioEconomy } from './economy'
import type { CompanyState, ModelId } from './types'

function onCompany(state: CompanyState, action: (view: GameState) => GameState): CompanyState {
  return mergeCompany(state, action(companyView(state)))
}
function onModel(state: CompanyState, id: ModelId, action: (view: GameState) => GameState, training = false): CompanyState {
  let view = modelView(state, id)
  // The next-training obligation is bound at acceptance; unrelated model work cannot settle it.
  const unrelated = training && state.contractModelId !== null && state.contractModelId !== id
  if (unrelated) view = { ...view, contracts: { ...view.contracts, active: null } }
  let result = action(view)
  if (unrelated) result = { ...result, contracts: state.company.contracts }
  return mergeModel(state, id, result)
}
function competitionView(state: CompanyState): GameState {
  const view = companyView(state)
  if (state.strategy === 'flagship' && state.models[0].baseId === 'custom') return view
  // A portfolio is compared on weighted quality, not the sum of arbitrarily many scorecards.
  const denominator = state.models.reduce((sum, model) => sum + model.allocationBps, 0)
  const scores = Object.fromEntries(CATEGORIES.map(key => [key, denominator > 0 ? state.models.reduce((sum, model) =>
    sum + (benchmarkIsCurrent(model) ? model.benchmark.last![key] : effectiveProfile(model)[key] * .8) * model.allocationBps, 0) / denominator : 0])) as ReturnType<typeof effectiveProfile>
  return { ...view, benchmark: { ...view.benchmark, last: { ...scores, total: meanProfile(scores),
    cheated: false, exposed: false, day: Math.floor((state.company.elapsedGameHours + 8) / 24) + 1 } } }
}
/** One global daily hook; only model-local events loop over model IDs. */
export function processCompanyDay(state: CompanyState, rng: Rng): CompanyState {
  let next = onCompany(state, view => dailyChipMarket(view, rng))
  next = dailyPortfolioUsers(next)
  next = mergeCompany(next, dailyCompetitorStep(competitionView(next), rng))
  next = mergeCompany(next, dailyAmbientGmi(competitionView(next), rng))
  next = onCompany(next, closeCompletedContract)
  next = onCompany(next, clearExpiredOffer)
  next = onCompany(next, view => maybeGenerateOffer(view, rng))

  // Stable ID order, independent of UI selection or the array's presentation order.
  const ids = next.models.map(model => model.id).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
  for (const id of ids) next = onModel(next, id, view => dailyMalwareRoll(view, rng))
  for (const id of ids) next = onModel(next, id, view => dailyExposureRoll(view, rng))
  for (const id of ids) next = onModel(next, id, view => dailyPromptInjectionRoll(view, rng, meanProfile(effectiveProfile(getModel(next, id))) > 0))
  next = onCompany(next, view => dailyCourtRoll(view, rng))
  next = onCompany(next, view => dailyComplaintRoll(view, rng))
  next = onCompany(next, view => dailyRandomEvent(view, rng))
  next = onCompany(next, view => dailyEquipmentFailures(view, rng))
  next = onCompany(next, view => dailyMoraleStep(view, rng))
  next = onCompany(next, dailyInsuranceBilling)
  next = onCompany(next, dailyAdvertisingBilling)
  for (const id of ids) {
    const before = next.company.totalRevenue
    next = onModel(next, id, dailyLicensingPayout)
    const model = getModel(next, id)
    next = withModel(next, { ...model, receipts: { ...model.receipts,
      licensing: model.receipts.licensing + next.company.totalRevenue - before } })
  }
  const economy = portfolioEconomy(next)
  next = onCompany(next, view => dailyInvestors(view, economy, rng))
  return onCompany(next, maybeOfferAcquisition)
}
/** Authoritative V3 clock. Company cash is posted once, not once per model simulation. */
export function advanceCompanySimulation(state: CompanyState, realSeconds: number, rng: Rng = Math.random): CompanyState {
  if (state.company.paused || state.company.ending || !Number.isFinite(realSeconds) || realSeconds <= 0) return state
  const target = state.company.elapsedGameHours + realSeconds * state.company.speed * GAME_HOURS_PER_REAL_SECOND
  if (!Number.isFinite(target) || target <= state.company.elapsedGameHours) return state
  let next = state
  while (next.company.elapsedGameHours < target) {
    const now = next.company.elapsedGameHours
    const dayBoundary = (Math.floor((now + 8) / 24) + 1) * 24 - 8
    const coolingBoundary = (Math.floor(now / 24) + 1) * 24
    const trafficBoundary = (Math.floor(now / 6) + 1) * 6
    let until = Math.min(target, dayBoundary, coolingBoundary, trafficBoundary)
    const split = (time: number | null) => { if (time !== null && Number.isFinite(time) && time > now && time < until) until = time }
    const economy = portfolioEconomy(next)
    for (const rates of economy.models) {
      const model = getModel(next, rates.modelId)
      split(model.state.offlineUntil)
      if (model.state.run && rates.trainingVolumePerHour > 0) split(now + model.state.run.remaining / rates.trainingVolumePerHour)
    }
    for (const order of next.company.orders) split(order.arriveAt)
    const hours = until - now
    if (!(hours > 0)) throw new RangeError('Невозможно продвинуть время при текущей точности.')
    const revenue = economy.revenuePerHour * hours
    const expenses = economy.expensesPerHour * hours
    next = { ...next, company: { ...next.company,
      cash: next.company.cash + revenue - expenses,
      totalRevenue: next.company.totalRevenue + revenue,
      totalExpenses: next.company.totalExpenses + expenses,
    } }
    for (const rates of [...economy.models].sort((a, b) => Number(a.modelId.slice(6)) - Number(b.modelId.slice(6)))) {
      const model = getModel(next, rates.modelId)
      next = withModel(next, { ...model, receipts: { ...model.receipts,
        tokens: model.receipts.tokens + rates.tokenRevenuePerHour * hours,
        subscriptions: model.receipts.subscriptions + rates.subscriptionRevenuePerHour * hours } })
      const compute = rates.allocatedCompute / baseDefinition(model.baseId).trainingCost
      next = onModel(next, rates.modelId, view => tickTraining(view, hours, compute, rng), true)
    }
    next = { ...next, company: { ...next.company, elapsedGameHours: until } }
    const arrival = rareCarArrival(now, until, rng)
    if (arrival !== undefined) next = { ...next, company: { ...next.company, rareCarUntil: arrival } }
    next = onCompany(next, view => deliverOrders(view, rng))
    for (const model of next.models) {
      if (model.benchmark.testing && model.state.offlineUntil !== null && until >= model.state.offlineUntil) {
        next = withModel(next, { ...model, benchmark: { ...model.benchmark, testing: false } })
      }
    }
    if (until === dayBoundary) next = processCompanyDay(next, rng)
  }
  const experiencedThrottle = next.company.milestones.experiencedThrottle || [...next.company.locations, ...next.company.regionLocations]
    .some(location => location.owned && locationEquipment(location).demandKw > locationDefinition(location.id).powerLimitKw)
  return { ...next, company: { ...next.company, milestones: { ...next.company.milestones, experiencedThrottle,
    earnedRevenue: next.company.milestones.earnedRevenue || next.company.totalRevenue > state.company.totalRevenue } } }
}
