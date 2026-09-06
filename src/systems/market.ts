import {
  ACQUISITION_IQ_THRESHOLD,
  ACQUISITION_OFFER,
  ACQUISITION_REVENUE_THRESHOLD,
  AD_DAILY_COST,
  AMBIENT_LOSS_PENALTY,
  AMBIENT_WIN_USER_BOOST,
  CHEAT_TOKEN_PENALTY,
  OPEN_SOURCE_TOKEN_PENALTY,
  USER_GROWTH_PER_DAY,
  VIRAL_USER_MULT,
  AD_USER_BOOST,
  CHIP_PRICE_PERIOD_DAYS,
  CHIP_PRICE_SWING,
  CHIPS,
  ELECTRICITY_PRICE_PER_KWH,
  GMI_AD_BOOST,
  INVESTOR_CHECK_INTERVAL_DAYS,
  INVESTOR_PAYOUT_RATIO,
  INVESTOR_RESTRICTION_HOURS,
  INVESTOR_TARGET_IQ,
  INVESTOR_TARGET_PROFIT_PER_HOUR,
  GAME_YEAR_DAYS,
  INSURANCE_COVERAGE,
  INSURANCE_DAILY_PREMIUM,
  LICENSE_IQ_THRESHOLD,
  LICENSE_PAYOUT_PER_DAY,
  LICENSE_VOICE_MULTIPLIER,
  RETENTION_FRIENDLY,
  RETENTION_RAW,
  RAW_TOKEN_BONUS,
  SEASON_SUMMER_MULT,
  SEASON_WINTER_MULT,
  SUMMER_END_DAY,
  SUMMER_START_DAY,
  TECH_NODES,
  TOKEN_PRICE_DEFAULT,
  TOKEN_REVENUE_PER_USER_HOUR,
  SUBSCRIPTION_PER_USER_HOUR,
  USERS_PER_COMPUTE,
  USERS_OFFLINE_DECAY_PER_DAY,
  WINTER_END_DAY,
  WINTER_START_DAY,
  getRegionLocationDefinition,
} from './config'
import { adCostMultiplier, adEffectiveness } from './reputation'
import { getLocationDefinition } from './config'
import type {
  AnyLocationId,
  ChipId,
  CompanyEconomy,
  GameState,
  LocationState,
  Rng,
  TechNodeId,
} from './types'

// ---------- Notices ----------
export function pushNotice(state: GameState, message: string): GameState {
  return { ...state, pendingNotices: [...state.pendingNotices, message] }
}

/** The UI clock starts at 08:00 of day 1, so day boundaries sit 8 hours into elapsed time. */
export function gameDay(state: GameState): number {
  return Math.floor((state.elapsedGameHours + 8) / 24) + 1
}

/** Insurance pays a fixed share of court fines, incident repairs and complaints. */
export function reduceFine(state: GameState, amount: number): number {
  return state.market.insurance ? amount * (1 - INSURANCE_COVERAGE) : amount
}

// ---------- Chip market ----------
export function chipBasePrice(chip: ChipId): number {
  return CHIPS[chip].price
}

/** Price of a chip class on a given day: base ±20% sine, phase offset per class. */
export function chipPriceForDay(chip: ChipId, day: number, rng: Rng): { price: number; trend: 1 | 0 | -1 } {
  const period = CHIP_PRICE_PERIOD_DAYS[chip]
  const phase = period === 9 ? 0 : period === 13 ? Math.PI / 2 : Math.PI
  const noise = (rng() * 2 - 1) * 0.03
  const factor = 1 + CHIP_PRICE_SWING * Math.sin((2 * Math.PI * day) / period + phase) + noise
  const price = Math.round(chipBasePrice(chip) * factor)
  return { price, trend: price > chipBasePrice(chip) ? 1 : price < chipBasePrice(chip) ? -1 : 0 }
}

export function currentChipPrice(state: GameState, chip: ChipId): number {
  return state.market.chips[chip].price
}

// ---------- Seasonality ----------
export function seasonalityMult(state: GameState): number {
  const dayIndex = Math.floor(state.elapsedGameHours / 24) % GAME_YEAR_DAYS
  if (dayIndex >= SUMMER_START_DAY && dayIndex < SUMMER_END_DAY) return SEASON_SUMMER_MULT
  if (dayIndex >= WINTER_START_DAY && dayIndex < WINTER_END_DAY) return SEASON_WINTER_MULT
  return 1
}

// ---------- Users ----------
export function retentionMultiplier(state: GameState): number {
  if (state.model.personality === 'friendly') return RETENTION_FRIENDLY
  if (state.model.personality === 'raw') return RETENTION_RAW
  return 1
}

export function techCapacityMultiplier(state: GameState): number {
  let mult = 1
  if (state.model.tech.includes('context')) mult *= 1.15
  if (state.model.tech.includes('multimodal')) mult *= 1.25
  if (state.model.tech.includes('voice')) mult *= 1.1
  return mult
}

export function effectCapacityMultiplier(state: GameState, now: number): number {
  let mult = 1
  if (state.market.viralUntil !== null && now < state.market.viralUntil) mult *= VIRAL_USER_MULT
  if (state.market.ambientBoostUntil !== null && now < state.market.ambientBoostUntil) mult *= 1 + AMBIENT_WIN_USER_BOOST
  if (state.market.ambientPenaltyUntil !== null && now < state.market.ambientPenaltyUntil) mult *= 1 - AMBIENT_LOSS_PENALTY
  return mult
}

/** How many users the current infrastructure and reputation can hold. */
export function userCapacity(state: GameState, economy: Pick<CompanyEconomy, 'effectiveCompute'>): number {
  if (economy.effectiveCompute <= 0) return 0
  const demandFactor = 1.6 - state.market.tokenPrice / TOKEN_PRICE_DEFAULT * 0.6
  const ads = state.market.advertising ? 1 + AD_USER_BOOST * adEffectiveness(state) : 1
  const gmiBoost = state.benchmark.adBoostUntil !== null ? 1 + GMI_AD_BOOST : 1
  const reputationFactor = 0.5 + state.reputation / 100 * 0.5
  const base = USERS_PER_COMPUTE * economy.effectiveCompute * demandFactor * retentionMultiplier(state)
  return Math.max(0, base * reputationFactor * ads * gmiBoost * techCapacityMultiplier(state) * effectCapacityMultiplier(state, state.elapsedGameHours))
}

export function isModelOnline(state: GameState): boolean {
  return state.model.offlineUntil === null || state.elapsedGameHours >= state.model.offlineUntil
}

/** Retail token income per hour; 0 while the model is offline or users are absent. */
export function tokenRevenuePerHour(state: GameState): number {
  if (!isModelOnline(state)) return 0
  let rate = TOKEN_REVENUE_PER_USER_HOUR * (state.market.tokenPrice / TOKEN_PRICE_DEFAULT)
  if (state.model.personality === 'raw') rate *= 1 + RAW_TOKEN_BONUS
  if (state.benchmark.preparing) rate *= 1 - CHEAT_TOKEN_PENALTY
  if (state.model.openSource) rate *= 1 - OPEN_SOURCE_TOKEN_PENALTY
  return state.users * rate
}

/** Subscription income per hour: steady, unaffected by token price. */
export function subscriptionPerHour(state: GameState): number {
  if (!isModelOnline(state)) return 0
  const multimodal = state.model.tech.includes('multimodal') ? 1.3 : 1
  return state.users * SUBSCRIPTION_PER_USER_HOUR * multimodal
}

/** Daily drift of the audience toward capacity; daily so tick granularity never matters. */
export function dailyUserStep(state: GameState, capacity: number): number {
  if (!isModelOnline(state)) {
    return state.users * (1 - USERS_OFFLINE_DECAY_PER_DAY)
  }
  return state.users + (capacity - state.users) * USER_GROWTH_PER_DAY
}

// ---------- Advertising, insurance ----------
export function toggleAdvertising(state: GameState): void {
  state.market = { ...state.market, advertising: !state.market.advertising }
}

export function advertisingDailyCost(state: GameState): number {
  return state.market.advertising ? Math.round(AD_DAILY_COST * adCostMultiplier(state)) : 0
}

export function dailyInsuranceBilling(state: GameState): GameState {
  if (!state.market.insurance) return state
  return {
    ...state,
    cash: state.cash - INSURANCE_DAILY_PREMIUM,
    totalExpenses: state.totalExpenses + INSURANCE_DAILY_PREMIUM,
  }
}

// ---------- Licensing ----------
export function licensingAvailable(state: GameState): boolean {
  return state.model.iq >= LICENSE_IQ_THRESHOLD
}

export function dailyLicensingPayout(state: GameState): GameState {
  if (!state.model.licensed) return state
  const voice = state.model.tech.includes('voice') ? LICENSE_VOICE_MULTIPLIER : 1
  const payout = LICENSE_PAYOUT_PER_DAY * voice
  return {
    ...state,
    cash: state.cash + payout,
    totalRevenue: state.totalRevenue + payout,
  }
}

// ---------- Tech tree ----------
export function techAvailable(state: GameState, id: TechNodeId): boolean {
  const node = TECH_NODES.find((item) => item.id === id)
  if (!node) throw new Error(`Unknown tech node: ${id}`)
  return !state.model.tech.includes(id) && state.model.iq >= node.iqThreshold
}

export function unlockTech(state: GameState, id: TechNodeId): GameState {
  const node = TECH_NODES.find((item) => item.id === id)
  if (!node) throw new Error(`Unknown tech node: ${id}`)
  return {
    ...state,
    cash: state.cash - node.cost,
    totalCapex: state.totalCapex + node.cost,
    model: { ...state.model, tech: [...state.model.tech, id] },
  }
}

// ---------- Regions ----------
export function regionElectricityMult(id: AnyLocationId): number {
  if (id === 'overseas-west' || id === 'overseas-east') return getRegionLocationDefinition(id).region.electricityMult
  return 1
}

// ---------- Electricity with season and region factors ----------
export function electricityPerHour(state: GameState, suppliedKw: number, id: AnyLocationId): number {
  return suppliedKw * ELECTRICITY_PRICE_PER_KWH * seasonalityMult(state) * regionElectricityMult(id)
}

// ---------- Acquisition ----------
export function acquisitionConditionsMet(state: GameState): boolean {
  return state.model.iq >= ACQUISITION_IQ_THRESHOLD && state.totalRevenue >= ACQUISITION_REVENUE_THRESHOLD
}

export function findLocation(state: GameState, id: AnyLocationId): LocationState | undefined {
  return [...state.locations, ...state.regionLocations].find((location) => location.id === id)
}

export function ownedLocationCount(state: GameState): number {
  return [...state.locations, ...state.regionLocations].filter((location) => location.owned).length
}

export function allOwnedLocations(state: GameState): LocationState[] {
  return [...state.locations, ...state.regionLocations].filter((location) => location.owned)
}

export function rentPerHourFor(id: AnyLocationId): number {
  if (id === 'overseas-west' || id === 'overseas-east') return getRegionLocationDefinition(id).location.rentPerHour
  return getLocationDefinition(id).rentPerHour
}

export function powerLimitFor(id: AnyLocationId): number {
  if (id === 'overseas-west' || id === 'overseas-east') return getRegionLocationDefinition(id).location.powerLimitKw
  return getLocationDefinition(id).powerLimitKw
}


// ---------- Daily market systems ----------
export function dailyChipMarket(state: GameState, rng: Rng): GameState {
  const day = gameDay(state)
  const chips = state.market.chips
  const next = {} as GameState['market']['chips']
  for (const chip of Object.keys(chips) as ChipId[]) {
    next[chip] = chipPriceForDay(chip, day, rng)
  }
  return { ...state, market: { ...state.market, chips: next } }
}

export function dailyAdvertisingBilling(state: GameState): GameState {
  if (!state.market.advertising) return state
  const cost = Math.round(AD_DAILY_COST * adCostMultiplier(state))
  return {
    ...state,
    cash: state.cash - cost,
    totalExpenses: state.totalExpenses + cost,
  }
}

/** Every INVESTOR_CHECK_INTERVAL_DAYS the board checks the growth target. */
export function dailyInvestors(state: GameState, economy: CompanyEconomy, rng: Rng): GameState {
  if (gameDay(state) < state.investors.nextCheckDay) return state
  const passed = economy.profitPerHour >= INVESTOR_TARGET_PROFIT_PER_HOUR || state.model.iq >= INVESTOR_TARGET_IQ
  const nextCheckDay = state.investors.nextCheckDay + INVESTOR_CHECK_INTERVAL_DAYS
  if (passed) {
    return pushNotice(
      { ...state, investors: { ...state.investors, nextCheckDay } },
      'Совет директоров принял отчёт: цель роста достигнута.',
    )
  }
  const payout = Math.max(0, Math.round(state.cash * INVESTOR_PAYOUT_RATIO))
  let next: GameState = {
    ...state,
    cash: state.cash - payout,
    investors: {
      nextCheckDay,
      restrictedUntil: state.elapsedGameHours + INVESTOR_RESTRICTION_HOURS,
      misses: state.investors.misses + 1,
    },
  }
  next = pushNotice(next, payout > 0
    ? `Цель роста не достигнута. Совет директоров изъял ${payout} и ограничил крупные траты на ${INVESTOR_RESTRICTION_HOURS} ч.`
    : `Цель роста не достигнута. Крупные траты ограничены на ${INVESTOR_RESTRICTION_HOURS} ч.`)
  void rng
  return next
}

export function purchasesRestricted(state: GameState): boolean {
  return state.investors.restrictedUntil !== null && state.elapsedGameHours < state.investors.restrictedUntil
}

// ---------- Acquisition ending ----------
export function maybeOfferAcquisition(state: GameState): GameState {
  if (state.acquisitionOffered || state.ending) return state
  if (state.model.iq < ACQUISITION_IQ_THRESHOLD || state.totalRevenue < ACQUISITION_REVENUE_THRESHOLD) return state
  return pushNotice({ ...state, acquisitionOffered: true }, 'Поступило предложение о поглощении компании. Решение ждёт на панели.')
}

export function acceptAcquisition(state: GameState): GameState {
  return {
    ...state,
    ending: 'acquired',
    cash: state.cash + ACQUISITION_OFFER,
    totalRevenue: state.totalRevenue + ACQUISITION_OFFER,
  }
}
