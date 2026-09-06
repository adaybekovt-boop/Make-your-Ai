import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createInitialGame, buyLocation, advanceSimulation } from '../simulation'
import { deliveredServer, unwrap } from '../testSupport'
import { dailyExposureRoll } from '../benchmark'
import { dailyCourtRoll } from '../events'
import { GAME_HOURS_PER_REAL_SECOND, INVESTOR_TARGET_PROFIT_PER_HOUR, ACQUISITION_REVENUE_THRESHOLD, CONTRACT_OFFICIAL_PAYOUT, CONTRACT_ENTERPRISE_PAYOUT, TRAINING_IQ_PER_VOLUME } from '../config'
import {
  BASE_MODELS, advanceCompanySimulation, allocateCompute, benchmarkIsCurrent, benchmarkModel,
  buyCompanyLocation, buyModelData, createCompanyGame, effectiveProfile, getModel, meanProfile, migrateSingleModel,
  mountCompanyChassis, mountCompanyChip, orderCompanyServerKit, portfolioEconomy, purchaseBaseModel,
  setQuantization, startModelTraining, toggleModelPreparing, processCompanyDay,
} from './index'
import { companyView, mergeModel, modelView } from './state'
import type { CompanyActionResult, CompanyState, BaseModelId } from './types'
import type { ChipId, ChassisId, LocationId, Rng } from '../types'
const flat: Rng = () => .99
function ok(result: CompanyActionResult) { if (!result.ok) throw new Error(result.error); return result.state }
function lcg(seed: number): Rng { let x = seed >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32) }
function legacy() { return unwrap(deliveredServer(unwrap(buyLocation({ ...createInitialGame(), cash: 1_000_000 }, 'garage')), 'garage')) }

describe('anti-exploit boundaries', () => {
  it('quantization never erases a cheated benchmark or its exposure risk', () => {
    let s = migrateSingleModel(legacy())
    s = ok(purchaseBaseModel(s, 'terra-s3', { modelId: 'model-1', confirm: true }))
    s = ok(toggleModelPreparing(s, 'model-2'))
    s = ok(benchmarkModel(s, 'model-2', () => .5))
    s = advanceCompanySimulation(s, 6 * 60, flat)
    expect(s.models[0].benchmark.last!.cheated).toBe(true)
    s = ok(setQuantization(s, 'model-2', 2))
    expect(benchmarkIsCurrent(s.models[0])).toBe(false)
    const exposed = mergeModel(s, 'model-2', dailyExposureRoll(modelView(s, 'model-2'), () => 0))
    expect(exposed.models[0].benchmark.last!.exposed).toBe(true)
    expect(exposed.company.reputation).toBeLessThan(s.company.reputation)
    expect(benchmarkIsCurrent(exposed.models[0])).toBe(false)
  })
  it('replacement retains company liability for old illegal data', () => {
    const original = legacy(); original.model.dirtyHistory = true
    let s = migrateSingleModel(original)
    s = ok(purchaseBaseModel(s, 'terra-s3', { modelId: 'model-1', confirm: true }))
    expect(s.models[0].state.dirtyHistory).toBe(false)
    expect(s.dataLiability).toBe(true)
    expect(dailyCourtRoll(companyView(s), () => 0).cash).toBeLessThan(s.company.cash)
  })
  it('runs court risk once for the company rather than once per model', () => {
    let s = { ...migrateSingleModel(legacy()), strategy: 'portfolio' as const } as CompanyState
    for (const base of BASE_MODELS) s = ok(purchaseBaseModel(s, base.id))
    s.dataLiability = true
    const calls: number[] = []
    const rng: Rng = () => { calls.push(1); return .99 }
    const next = processCompanyDay(s, rng)
    expect(next.company.cash).toBe(s.company.cash)
    // Removing only liability removes exactly one roll; per-model incident rolls are unchanged.
    let withoutLiability = 0
    processCompanyDay({ ...s, dataLiability: false }, () => { withoutLiability++; return .99 })
    expect(calls.length - withoutLiability).toBe(1)
  })
  it('charges data exactly once and accounts for its full price in the V3 ledger', () => {
    const s = migrateSingleModel(legacy()), next = ok(buyModelData(s, 'model-1', 'official', 'coding'))
    expect(next.company.cash).toBe(s.company.cash - 14_000)
    expect(next.company.totalExpenses).toBe(s.company.totalExpenses + 14_000)
    const running = ok(startModelTraining(next, 'model-1'))
    expect(running.company.cash).toBe(next.company.cash)
  })
  it('keeps a pending trained-model snapshot immutable across long calls', () => {
    let s = migrateSingleModel(legacy())
    s = ok(buyModelData(s, 'model-1', 'official')); s = ok(startModelTraining(s, 'model-1'))
    const copy = structuredClone(s)
    advanceCompanySimulation(s, 1000 * 60, lcg(91))
    expect(s).toEqual(copy)
  })
})

describe('numerical catalog audit, not a human playtest', () => {
  it('performs real orders, delivery, mounting and user ramp for every base at a stated capital stage', () => {
    const cases: { base: BaseModelId; chip: ChipId; chassis: ChassisId; location: LocationId; capital: number }[] = [
      { base: 'terra-s3', chip: 'pro-gpu', chassis: 'rack-basic', location: 'workshop', capital: 50_000 },
      { base: 'titan-c7', chip: 'accelerator', chassis: 'rack-cooled', location: 'technopark', capital: 180_000 },
      { base: 'helios-m13', chip: 'flagship', chassis: 'rack-enterprise', location: 'server-hall', capital: 400_000 },
    ]
    const rows = cases.map(test => {
      let s = createCompanyGame('portfolio'); s.company.cash = test.capital
      s = ok(buyCompanyLocation(s, test.location))
      s = ok(orderCompanyServerKit(s, { locationId: test.location, chassis: test.chassis, chip: test.chip, channel: 'official', qty: 1, targetCell: { row: 0, col: 0 } }))
      s = ok(purchaseBaseModel(s, test.base))
      s = ok(allocateCompute(s, { 'model-1': 0, 'model-2': 10_000 }))
      let minimumCash = s.company.cash
      while (s.company.orders.length) { s = advanceCompanySimulation(s, 60, flat); minimumCash = Math.min(minimumCash, s.company.cash) }
      s = ok(mountCompanyChassis(s, test.location, { row: 0, col: 0 }, test.chassis, flat))
      s = ok(mountCompanyChip(s, test.location, { row: 0, col: 0 }, test.chip, flat))
      expect(portfolioEconomy(s).serverRevenuePerHour).toBe(0)
      let firstPositiveHour: number | null = null
      const costs = portfolioEconomy(s).expensesPerHour
      const initial = portfolioEconomy(s).models[1]
      const steadyRevenueNoPromotions = initial.capacity * 1.6
      for (let hour = 0; hour < 120; hour++) {
        s = advanceCompanySimulation(s, 60, flat); minimumCash = Math.min(minimumCash, s.company.cash)
        if (firstPositiveHour === null && portfolioEconomy(s).profitPerHour > 0) firstPositiveHour = s.company.elapsedGameHours
      }
      expect(minimumCash).toBeGreaterThan(0); expect(firstPositiveHour).not.toBeNull()
      expect(portfolioEconomy(s).profitPerHour).toBeGreaterThan(0)
      return { ...test, minimumCash, firstPositiveHour, steadyRevenueNoPromotions, expensesPerHour: costs,
        unpromotedSteadyProfit: steadyRevenueNoPromotions - costs, after120HoursProfit: portfolioEconomy(s).profitPerHour,
        priceAsOfficialDataBatches: BASE_MODELS.find(m => m.id === test.base)!.licensePrice / 14_000,
        startingMeanGmi: meanProfile(effectiveProfile(getModel(s, 'model-2'))) }
    })
    mkdirSync('artifacts/portfolio', { recursive: true })
    writeFileSync('artifacts/portfolio/catalog-audit.json', JSON.stringify({
      measuredGameSpeed: 1, humanPlaytest: false, realtimeWait: false, rng: 'constant 0.99, controlled baseline only',
      pricesLocked: true, stagesAreNotSingle12000Playthrough: true,
      thresholds: { investorProfit: INVESTOR_TARGET_PROFIT_PER_HOUR, acquisitionRevenue: ACQUISITION_REVENUE_THRESHOLD,
        officialContract: CONTRACT_OFFICIAL_PAYOUT, enterpriseContract: CONTRACT_ENTERPRISE_PAYOUT }, rows,
    }, null, 2))
  })
  it('starts flagship from actual 12000 without changing the initial cash, clock or user growth', () => {
    let legacyState = createInitialGame()
    legacyState = unwrap(buyLocation(legacyState, 'garage'))
    let s = migrateSingleModel(legacyState)
    s = ok(orderCompanyServerKit(s, { locationId: 'garage', chassis: 'rack-basic', chip: 'consumer-gpu', channel: 'official', qty: 1, targetCell: { row: 0, col: 0 } }))
    s = advanceCompanySimulation(s, 6 / GAME_HOURS_PER_REAL_SECOND, flat)
    expect(s.company.cash).toBe(5220)
    s = ok(mountCompanyChassis(s, 'garage', { row: 0, col: 0 }, 'rack-basic', flat))
    s = ok(mountCompanyChip(s, 'garage', { row: 0, col: 0 }, 'consumer-gpu', flat))
    let minimumCash = s.company.cash, positive: number | null = null
    for (let h = 0; h < 120; h++) {
      s = advanceCompanySimulation(s, 60, flat); minimumCash = Math.min(minimumCash, s.company.cash)
      if (positive === null && portfolioEconomy(s).profitPerHour > 0) positive = s.company.elapsedGameHours
    }
    expect(minimumCash).toBeCloseTo(1192); expect(positive).toBe(64)
    expect(TRAINING_IQ_PER_VOLUME).toBe(.06)
    expect(advanceSimulation(createInitialGame(), 0)).toEqual(createInitialGame())
  })
})
