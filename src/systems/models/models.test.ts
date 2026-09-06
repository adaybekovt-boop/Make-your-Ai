import { createHash } from 'node:crypto'
import goldens from './fixtures/legacy-goldens.json'
import { describe, expect, it } from 'vitest'
import { advanceSimulation, buyLocation, createInitialGame } from '../simulation'
import { deliveredServer, unwrap } from '../testSupport'
import { calculateCompanyEconomy } from '../economy'
import { buyDataLot, startTraining } from '../training'
import { runBenchmark } from '../benchmark'
import { TECH_NODES, TRAINING_IQ_PER_VOLUME, USERS_PER_COMPUTE, INVESTOR_TARGET_PROFIT_PER_HOUR, ACQUISITION_REVENUE_THRESHOLD } from '../config'
import type { GameState, Rng } from '../types'
import {
  allocateCompute, benchmarkModel, buyCompanyLocation, buyModelData, changeStrategy, companyLearnedIQ,
  createCompanyGame, getModel, migrateSingleModel, modelWeightSizeGb, purchaseBaseModel,
  setQuantization, startModelTraining, acceptCompanyContract, toggleModelPreparing,
  portfolioEconomy, portfolioLocationEconomy, portfolioServerROI, advanceCompanySimulation, BASE_MODELS, CATEGORIES,
  effectiveProfile, GENERAL_GAINS, quantizationQuality, scaleProfile, acceptCompanyAcquisition,
} from './index'
import { companyView, ledgerOf } from './state'
import type { CompanyActionResult, CompanyState, DataDomain, ModelId, QuantizationStep } from './types'

const flat: Rng = () => .99
function ok(result: CompanyActionResult): CompanyState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}
function single(): GameState {
  return unwrap(deliveredServer(unwrap(buyLocation({ ...createInitialGame(), cash: 1_000_000 }, 'garage')), 'garage'))
}
function portfolio(count = 2): CompanyState {
  let state: CompanyState = { ...migrateSingleModel(single()), strategy: 'portfolio' }
  for (const spec of BASE_MODELS.slice(0, count - 1)) state = ok(purchaseBaseModel(state, spec.id))
  const portions = state.models.map((_, index) => index === count - 1 ? 10_000 - Math.floor(10_000 / count) * (count - 1) : Math.floor(10_000 / count))
  return ok(allocateCompute(state, Object.fromEntries(state.models.map((m, i) => [m.id, portions[i]]))))
}
function withLearned(state: CompanyState, ids: Partial<Record<ModelId, number>>): CompanyState {
  return { ...state, models: state.models.map(model => ids[model.id] === undefined ? model : { ...model,
    state: { ...model.state, iq: ids[model.id]! }, trainingScores: scaleProfile(GENERAL_GAINS, ids[model.id]!) }) }
}
function lcg(seed: number): Rng { let x = seed >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32) }

describe('strategy and canonical state', () => {
  it('defaults to exactly one independent flagship; a new portfolio also starts with one model', () => {
    const a = createCompanyGame(), b = createCompanyGame('portfolio')
    expect(a.strategy).toBe('flagship'); expect(b.strategy).toBe('portfolio')
    expect(a.models).toHaveLength(1); expect(b.models).toHaveLength(1)
    expect(a.models[0].allocationBps).toBe(10_000)
    expect(a.company.cash).toBe(12_000)
    expect(a.company).not.toHaveProperty('model'); expect(a.company).not.toHaveProperty('users')
    expect(a.company.team).not.toBe(b.company.team)
  })
  it.each(['flagship', 'portfolio'] as const)('never converts %s in the middle of a session', strategy => {
    const state = createCompanyGame(strategy), copy = structuredClone(state)
    expect(changeStrategy(state, strategy).ok).toBe(true)
    expect(changeStrategy(state, strategy === 'flagship' ? 'portfolio' : 'flagship').ok).toBe(false)
    expect(state).toEqual(copy)
  })
  it('preserves all assets, corporate counters and existing users on migration, no fabricated historic receipts', () => {
    const game = single(); game.officeOwned = true; game.cityProperties = ['meridian']; game.users = 123
    game.model.iq = 42; game.totalRevenue = 77_000; game.rareCarUntil = 50
    const state = migrateSingleModel(game)
    expect(state.company).toEqual(ledgerOf(game))
    expect(state.models[0].users).toBe(123); expect(state.models[0].state.iq).toBe(42)
    expect(state.models[0].receipts).toEqual({ tokens: 0, subscriptions: 0, licensing: 0 })
    expect(state.models[0].trainingScores).toEqual(scaleProfile(GENERAL_GAINS, 42))
    expect(state.company.locations).not.toBe(game.locations)
  })
})

describe('fixed marketplace v1', () => {
  it('pins all three prices, sizes and GMI profiles rather than letting the UI choose balance', () => {
    expect(BASE_MODELS.map(m => [m.id, m.parametersB, m.licensePrice, ...CATEGORIES.map(k => m.gmi[k])])).toEqual([
      ['terra-s3', 3, 18_000, 18, 20, 16, 14], ['titan-c7', 7, 60_000, 32, 48, 28, 24], ['helios-m13', 13, 120_000, 52, 48, 46, 58],
    ])
    expect(USERS_PER_COMPUTE).toBe(220); expect(INVESTOR_TARGET_PROFIT_PER_HOUR).toBe(1000)
    expect(ACQUISITION_REVENUE_THRESHOLD).toBe(1_000_000)
    expect(TECH_NODES.map(node => node.cost)).toEqual([150_000, 300_000, 150_000])
  })
  it.each(BASE_MODELS)('buys $name once, with no users, earned IQ, free compute or cash revenue', spec => {
    const state = { ...createCompanyGame('portfolio'), company: { ...createCompanyGame().company, cash: 1_000_000 } }
    const before = structuredClone(state), next = ok(purchaseBaseModel(state, spec.id))
    const added = next.models[1]
    expect(next.company.cash).toBe(state.company.cash - spec.licensePrice)
    expect(next.company.totalCapex).toBe(spec.licensePrice); expect(next.company.totalRevenue).toBe(0)
    expect(added.users).toBe(0); expect(added.state.iq).toBe(0); expect(added.allocationBps).toBe(0)
    expect(effectiveProfile(added)).toEqual(spec.gmi)
    expect(companyLearnedIQ(next)).toBe(0); expect(purchaseBaseModel(next, spec.id).ok).toBe(false)
    expect(state).toEqual(before)
  })
  it('refuses insufficient funds, unknown products, board restrictions and post-ending purchases', () => {
    const s = createCompanyGame('portfolio')
    expect(purchaseBaseModel(s, 'terra-s3').ok).toBe(false)
    expect(purchaseBaseModel(s, 'unknown' as never).ok).toBe(false)
    const rich = { ...s, company: { ...s.company, cash: 1_000_000 } }
    expect(purchaseBaseModel({ ...rich, company: { ...rich.company, investors: { ...rich.company.investors, restrictedUntil: 10 } } }, 'terra-s3').ok).toBe(false)
    expect(purchaseBaseModel({ ...rich, company: { ...rich.company, ending: 'acquired' } }, 'terra-s3').ok).toBe(false)
  })
  it('allows all three licenses plus the original, without silently deleting models', () => {
    const state = portfolio(4)
    expect(state.models).toHaveLength(4)
    expect(state.models.map(m => m.id)).toEqual(['model-1', 'model-2', 'model-3', 'model-4'])
  })
  it('requires explicit replacement of the single flagship and never refunds or clones its audience', () => {
    const state = migrateSingleModel(single()); state.models[0].users = 100
    expect(purchaseBaseModel(state, 'terra-s3').ok).toBe(false)
    const next = ok(purchaseBaseModel(state, 'terra-s3', { modelId: 'model-1', confirm: true }))
    expect(next.models).toHaveLength(1); expect(next.models[0].users).toBe(0)
    expect(next.models[0].id).toBe('model-2'); expect(next.company.team).toEqual(state.company.team)
    expect(next.company.cash).toBe(state.company.cash - 18_000)
  })
})

describe('compute allocation and one-time company posting', () => {
  it.each([1, 2, 3, 4])('%s models do not multiply the hardware budget or zero-user revenue', count => {
    const state = portfolio(count), rates = portfolioEconomy(state)
    expect(rates.models.reduce((sum, m) => sum + m.allocatedCompute, 0)).toBeCloseTo(rates.effectiveCompute, 12)
    expect(rates.serverRevenuePerHour).toBe(0); expect(rates.profitPerHour).toBe(-206)
    const next = advanceCompanySimulation(state, 60, flat)
    expect(next.company.cash - state.company.cash).toBe(-206)
    expect(next.company.totalRevenue - state.company.totalRevenue).toBe(0)
  })
  it.each([-1, .5, NaN, Infinity, 10_001])('rejects invalid allocation %s atomically', bad => {
    const state = portfolio(), copy = structuredClone(state)
    expect(allocateCompute(state, { 'model-1': bad, 'model-2': 0 }).ok).toBe(false)
    expect(state).toEqual(copy)
  })
  it('rejects excess, missing and unknown allocation entries', () => {
    const state = portfolio()
    for (const allocation of [{ 'model-1': 6000, 'model-2': 5000 }, { 'model-1': 100 }, { alien: 1, 'model-1': 1 }] as Record<string, number>[]) expect(allocateCompute(state, allocation).ok).toBe(false)
  })
  it('sums distinct model users once; property and payroll remain single company flows', () => {
    const state = portfolio()
    state.models[0].users = 10; state.models[1].users = 20
    state.company.cityProperties = ['meridian']
    state.company.team.employees = [{ id: 1, role: 'engineer', hiredDay: 1, salaryPerHour: 90 }]
    const rates = portfolioEconomy(state)
    expect(rates.serverRevenuePerHour).toBe(48); expect(rates.propertyRevenuePerHour).toBe(360)
    expect(rates.salariesPerHour).toBe(90); expect(rates.expensesPerHour).toBe(206 + 80 + 90)
    const next = advanceCompanySimulation(state, 60, flat)
    expect(next.company.totalRevenue - state.company.totalRevenue).toBe(408)
    expect(next.company.cash - state.company.cash).toBe(32)
    expect(next.models[0].receipts.tokens).toBe(12); expect(next.models[1].receipts.tokens).toBe(24)
    expect(portfolioLocationEconomy(state, 'garage').revenuePerHour).toBe(48)
  })
  it('one offline model loses only its own revenue and resumes at its exact deadline', () => {
    const state = portfolio(); state.models.forEach(m => { m.users = 20 })
    state.models[0].state.offlineUntil = state.company.elapsedGameHours + .5
    const next = advanceCompanySimulation(state, 60, flat)
    expect(next.company.totalRevenue - state.company.totalRevenue).toBe(48)
    expect(next.models[0].receipts.tokens).toBe(12); expect(next.models[1].receipts.tokens).toBe(24)
  })
  it('unused portfolio allocations cannot monetize a stored audience; reallocation does not move users', () => {
    const s = portfolio(); s.models[0].users = 10; s.models[1].users = 20
    const next = ok(allocateCompute(s, { 'model-1': 0, 'model-2': 10_000 }))
    expect(next.models.map(m => m.users)).toEqual([10, 20])
    expect(portfolioEconomy(next).serverRevenuePerHour).toBe(32)
  })
  it('location attribution includes regional output without assigning property revenue to rooms', () => {
    const s = portfolio()
    s.company.regionLocations = [{ id: 'overseas-east', owned: true, servers: 2 }]; s.company.regions = ['overseas']
    s.models.forEach(m => { m.users = 100 }); s.company.cityProperties = ['orbit']
    const rates = portfolioEconomy(s)
    const sum = [...s.company.locations, ...s.company.regionLocations].reduce((sum, location) => sum + portfolioLocationEconomy(s, location.id).revenuePerHour, 0)
    expect(sum).toBeCloseTo(rates.serverRevenuePerHour, 10)
    expect(sum).not.toBe(rates.revenuePerHour)
  })
})

describe('training domains and benchmark profiles', () => {
  it.each(['general', 'reasoning', 'coding', 'safety', 'multimodal'] as DataDomain[])('conserves the category budget for %s and increases earned IQ only on completion', domain => {
    let state = migrateSingleModel(single())
    state = ok(buyModelData(state, 'model-1', 'official', domain))
    state = ok(startModelTraining(state, 'model-1'))
    const partial = advanceCompanySimulation(state, 10 * 60, flat)
    expect(partial.models[0].state.iq).toBe(0); expect(partial.models[0].trainingScores).toEqual(scaleProfile(GENERAL_GAINS, 0))
    const next = advanceCompanySimulation(partial, 40 * 60, flat)
    expect(next.models[0].state.iq).toBe(6)
    const scores = next.models[0].trainingScores
    expect(CATEGORIES.reduce((sum, key) => sum + scores[key], 0)).toBeCloseTo(22.8, 12)
    if (domain === 'general') expect(scores.coding).toBeCloseTo(6.6)
    else expect(scores[domain]).toBe(12)
    expect(next.models[0].runGains).toBeNull()
  })
  it('uses volume-weighted mixed domains, not the number of lots', () => {
    let state = migrateSingleModel(single())
    state = ok(buyModelData(state, 'model-1', 'official', 'coding'))
    state = ok(buyModelData(state, 'model-1', 'official', 'general'))
    state.models[0].state.queue[0].volume = 25; state.models[0].state.queue[1].volume = 75
    state = ok(startModelTraining(state, 'model-1'))
    expect(state.models[0].runGains!.coding).toBeCloseTo(25 * .06 * 2 + 75 * .06 * 1.1)
  })
  it('benchmarks a purchased base with its exact profile without crediting purchased competence as trained IQ', () => {
    let state = portfolio()
    const id = state.models[1].id
    state = ok(benchmarkModel(state, id, () => .5))
    expect(state.models[1].benchmark.last).toMatchObject({ reasoning: 18, coding: 20, safety: 16, multimodal: 14, total: 17 })
    expect(state.models[1].state.iq).toBe(0)
  })
  it('two simultaneous training runs share compute instead of each processing a full-company budget', () => {
    let state = portfolio()
    for (const m of state.models) { state = ok(buyModelData(state, m.id, 'official')); state = ok(startModelTraining(state, m.id)) }
    const next = advanceCompanySimulation(state, 60, flat)
    expect(next.models.map(m => m.state.run!.remaining)).toEqual([99, 99])
  })
})

describe('quantization is reversible and used exactly once', () => {
  it.each([0, 1, 2] as QuantizationStep[])('pins step %s, weight size, serving, category scores and per-user yield', step => {
    let state = withLearned(portfolio(), { 'model-2': 30 })
    state.models[1].users = 100
    const before = portfolioEconomy(state).models[1]
    state = ok(setQuantization(state, 'model-2', step))
    const model = getModel(state, 'model-2'), after = portfolioEconomy(state).models[1]
    expect(modelWeightSizeGb(model)).toBe(6 / 2 ** step)
    expect(after.capacity / before.capacity).toBeCloseTo(1.25 ** step)
    expect(after.revenuePerHour / before.revenuePerHour).toBeCloseTo(.96 ** step)
    expect(after.trainingVolumePerHour).toBe(before.trainingVolumePerHour)
    expect(effectiveProfile(model).coding).toBeCloseTo((20 + 33) * .96 ** step)
    expect(companyLearnedIQ(state)).toBeCloseTo(30 * quantizationQuality(step))
  })
  it('does not accelerate audience acquisition or fabricate users at the moment of compression', () => {
    const state = portfolio(), next = ok(setQuantization(state, 'model-2', 2))
    expect(next.models.map(m => m.users)).toEqual(state.models.map(m => m.users))
    expect(portfolioEconomy(next).revenuePerHour).toBe(0)
  })
  it('round trips without cumulative score loss and invalidates old benchmark boosts', () => {
    let state = withLearned(portfolio(), { 'model-2': 30 })
    const full = effectiveProfile(state.models[1])
    state.models[1].benchmark.adBoostUntil = 100
    for (let i = 0; i < 100; i++) {
      state = ok(setQuantization(state, 'model-2', 2)); state = ok(setQuantization(state, 'model-2', 0))
    }
    expect(effectiveProfile(state.models[1])).toEqual(full); expect(state.models[1].benchmark.adBoostUntil).toBeNull()
  })
})

describe('company gates and contract routing', () => {
  it('passes the investor IQ gate by the sum of learned competence, never just the first model', () => {
    let state = withLearned(portfolio(), { 'model-1': 30, 'model-2': 30 })
    state.company.investors.nextCheckDay = 2
    const next = advanceCompanySimulation(state, (16 - state.company.elapsedGameHours) * 60, flat)
    expect(next.company.investors.misses).toBe(0)
    state = withLearned(state, { 'model-1': 29, 'model-2': 30 })
    const failed = advanceCompanySimulation(state, (16 - state.company.elapsedGameHours) * 60, flat)
    expect(failed.company.investors.misses).toBe(1)
  })
  it('does not offer acquisition for the catalog alone and uses combined learned IQ plus company revenue', () => {
    let state = portfolio(4); state.company.totalRevenue = ACQUISITION_REVENUE_THRESHOLD
    let next = advanceCompanySimulation(state, (16 - state.company.elapsedGameHours) * 60, flat)
    expect(next.company.acquisitionOffered).toBe(false)
    state = withLearned(state, { 'model-2': 55, 'model-3': 55 })
    next = advanceCompanySimulation(state, (16 - state.company.elapsedGameHours) * 60, flat)
    expect(next.company.acquisitionOffered).toBe(true)
    const sold = ok(acceptCompanyAcquisition(next))
    expect(acceptCompanyAcquisition(sold).ok).toBe(false)
    expect(advanceCompanySimulation(sold, 99_000, flat)).toBe(sold)
  })
  it('pays one contract, binds the next training to one model, and prohibits cheating company-wide', () => {
    let state = portfolio()
    state.company.contracts.pending = { id: 1, clientName: 'Аврора', officialPayout: 60_000, greyPayout: 108_000, enterprisePayout: 120_000, enterprise: false, expiresDay: 10 }
    const cash = state.company.cash
    state = ok(acceptCompanyContract(state, 'official', 'model-2'))
    expect(state.company.cash).toBe(cash + 60_000)
    for (const m of state.models) expect(toggleModelPreparing(state, m.id).ok).toBe(false)
    state = ok(buyModelData(state, 'model-1', 'unofficial', 'coding')); state = ok(startModelTraining(state, 'model-1'))
    state = advanceCompanySimulation(state, 100 * 60, flat)
    expect(state.company.contracts.active!.fulfilled).toBeNull()
    state = ok(buyModelData(state, 'model-2', 'official')); state = ok(startModelTraining(state, 'model-2'))
    const rep = state.company.reputation
    state = advanceCompanySimulation(state, 100 * 60, flat)
    expect(state.company.contracts.active!.fulfilled).toBe(true)
    expect(state.company.reputation).toBeGreaterThanOrEqual(rep)
    const revenue = state.company.totalRevenue
    // No second payout when the company closes the finished contract.
    state.company.elapsedGameHours = 256
    state = advanceCompanySimulation(state, 24 * 60, flat)
    expect(state.company.contracts.active).toBeNull()
    expect(state.company.totalRevenue - revenue).toBeLessThan(60_000)
  })
})

describe('clock equivalence and legacy flagship preservation', () => {
  it.each([1, 2, 17, 81])('matches the corrected single-model engine through daily events for seed %s', seed => {
    const legacy = single(); legacy.users = 50
    legacy.model.iq = 30; legacy.model.personality = 'friendly'
    const old = advanceSimulation(legacy, 15 * 24 * 60, lcg(seed))
    const modern = advanceCompanySimulation(migrateSingleModel(legacy), 15 * 24 * 60, lcg(seed))
    expect(modern.company).toEqual(ledgerOf(old))
    expect(modern.models[0].state).toEqual({ ...old.model, queue: old.model.queue.map(lot => ({ ...lot, domain: 'general' })) })
    expect(modern.models[0].users).toBe(old.users); expect(modern.models[0].benchmark).toEqual(old.benchmark)
  })
  it.each([1, 3] as const)('multi-day %sx equals hourly stepping with events, training, royalties and shared expenses', speed => {
    let state = withLearned(portfolio(3), { 'model-1': 80, 'model-2': 80, 'model-3': 80 })
    state.company.speed = speed; state.company.market.insurance = true; state.company.cityProperties = ['meridian']
    state.models.forEach(m => { m.state.licensed = true; m.state.dirtyHistory = true; m.users = 20 })
    for (const m of state.models) { state = ok(buyModelData(state, m.id, 'official', 'coding')); state = ok(startModelTraining(state, m.id)) }
    const one = advanceCompanySimulation(state, 15 * 24 * 60 / speed, lcg(39))
    let many = state; const rng = lcg(39)
    for (let i = 0; i < 360; i++) many = advanceCompanySimulation(many, 60 / speed, rng)
    expect(many.company.cash).toBeCloseTo(one.company.cash, 6)
    expect(many.company.totalRevenue).toBeCloseTo(one.company.totalRevenue, 6)
    expect(many.company.pendingNotices).toEqual(one.company.pendingNotices)
    expect(many.models.map(m => m.state.iq)).toEqual(one.models.map(m => m.state.iq))
    expect(many.models.map(m => m.users)).toEqual(one.models.map(m => m.users))
  })
  it.each([NaN, Infinity, -1, 0])('rejects invalid elapsed delta %s', delta => {
    const s = portfolio(); expect(advanceCompanySimulation(s, delta)).toBe(s)
  })
  it('resumes training and benchmarking after an expired downtime, without clearing the save by hand', () => {
    const legacy = single(); legacy.elapsedGameHours = 10; legacy.model.offlineUntil = 9; legacy.model.iq = 10
    const queued = unwrap(buyDataLot(legacy, 'official'))
    expect(startTraining(queued).ok).toBe(true); expect(runBenchmark(legacy, flat).ok).toBe(true)
    expect(startTraining({ ...queued, model: { ...queued.model, offlineUntil: 11 } }).ok).toBe(false)
    expect(runBenchmark({ ...legacy, model: { ...legacy.model, offlineUntil: 11 } }, flat).ok).toBe(false)
  })
  it('initial flagship uses exactly the corrected legacy hourly cash rate', () => {
    const legacy = single(), state = migrateSingleModel(legacy)
    expect(portfolioEconomy(state).profitPerHour).toBe(calculateCompanyEconomy(legacy).profitPerHour)
    expect(companyView(state).model.iq).toBe(0)
    expect(ok(buyCompanyLocation({ ...createCompanyGame(), company: { ...createCompanyGame().company, cash: 20_000 } }, 'workshop')).company.cash).toBe(13_500)
    expect(TRAINING_IQ_PER_VOLUME).toBe(.06)
  })
})

describe('independent pre-portfolio golden snapshots', () => {
  it.each(goldens.results)('preserves legacy seed $seed, training=$training across a 15-day jump', ({ seed, training, sha256 }) => {
    let game = single(); game.users = 50; game.model.iq = 30; game.model.personality = 'friendly'
    if (training) game = unwrap(startTraining(unwrap(buyDataLot(game, 'official'))))
    const actual = advanceSimulation(game, 15 * 24 * 60, lcg(seed))
    const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize((value as Record<string, unknown>)[key])])) : value
    expect(createHash('sha256').update(JSON.stringify(normalize(actual))).digest('hex')).toBe(sha256)
  })
})

describe('portfolio ROI aggregates each product forecast', () => {
  it('does not treat extra hardware as instant revenue and includes both model curves after growth', () => {
    let s = portfolio(3)
    s = ok(allocateCompute(s, { 'model-1': 0, 'model-2': 4000, 'model-3': 6000 }))
    s = ok(setQuantization(s, 'model-3', 2))
    const roi = portfolioServerROI(s, 'workshop')
    const perCompute = 220 * .75 * 1.6 * (.4 + .6 / 1.5 * 1.25 ** 2 * .96 ** 2)
    expect(roi.immediateProfitPerHour).toBe(-126)
    expect(roi.incrementalProfitPerHour).toBeCloseTo(perCompute - 126)
    expect(roi.forecast).toBe('steady-state')
    expect(portfolioEconomy(s).serverRevenuePerHour).toBe(0)
  })
})
