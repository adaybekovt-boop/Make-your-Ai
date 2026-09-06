import { createInitialGame } from '../simulation'
import { TRAINING_IQ_PER_VOLUME } from '../config'
import type { ActionResult, GameState, ModelState } from '../types'
import type { CompanyActionResult, CompanyLedger, CompanyState, ManagedModel, ModelId, Strategy } from './types'
import { addProfile, CATEGORIES, COMPUTE_BUDGET_BPS, effectiveProfile, GENERAL_GAINS, quantizationQuality, scaleProfile } from './config'

export function ledgerOf(game: GameState): CompanyLedger {
  const { model: _model, users: _users, benchmark: _benchmark, ...ledger } = game
  return ledger
}
export function modelFromLegacy(game: GameState, id: ModelId = 'model-1'): ManagedModel {
  return {
    id, baseId: 'custom', allocationBps: COMPUTE_BUDGET_BPS, quantization: 0,
    state: { ...game.model, queue: game.model.queue.map(lot => ({ ...lot, domain: 'general' })) },
    users: game.users, benchmark: game.benchmark, benchmarkQuantization: game.benchmark.last ? 0 : null,
    trainingScores: scaleProfile(GENERAL_GAINS, game.model.iq),
    runGains: game.model.run ? scaleProfile(GENERAL_GAINS, game.model.run.total * TRAINING_IQ_PER_VOLUME) : null,
    receipts: { tokens: 0, subscriptions: 0, licensing: 0 },
  }
}
/** Pure migration: no money, users, employees or random events are created. */
export function migrateSingleModel(game: GameState): CompanyState {
  return adaptSingleModel(structuredClone(game))
}
/** Internal pure runtime adapter: no deep clone on every UI tick. */
export function adaptSingleModel(copy: GameState): CompanyState {
  return { strategy: 'flagship', company: ledgerOf(copy), models: [modelFromLegacy(copy)], modelSeq: 1, purchasedBases: [],
    dataLiability: copy.model.dirtyHistory, contractModelId: copy.contracts.active?.requiresOfficialData ? 'model-1' : null }
}
export function createCompanyGame(strategy: Strategy = 'flagship'): CompanyState {
  if (strategy !== 'flagship' && strategy !== 'portfolio') throw new RangeError('Неизвестная стратегия.')
  return { ...migrateSingleModel(createInitialGame()), strategy }
}
export function changeStrategy(state: CompanyState, strategy: Strategy): CompanyActionResult {
  return strategy === state.strategy ? { ok: true, state } : { ok: false, error: 'Стратегия выбирается только при создании новой игры.' }
}
export function getModel(state: CompanyState, id: ModelId): ManagedModel {
  const model = state.models.find(item => item.id === id)
  if (!model) throw new RangeError('Модель не найдена.')
  return model
}
/** Ephemeral adapter for existing pure rules, never persisted and never fed to the full simulator. */
export function modelView(state: CompanyState, id: ModelId): GameState {
  const model = getModel(state, id)
  return { ...state.company, model: model.state, users: model.users, benchmark: model.benchmark }
}
export function withModel(state: CompanyState, model: ManagedModel): CompanyState {
  if (!state.models.some(item => item.id === model.id)) throw new RangeError('Модель не найдена.')
  return { ...state, models: state.models.map(item => item.id === model.id ? model : item) }
}
export function mergeModel(state: CompanyState, id: ModelId, result: GameState): CompanyState {
  const previous = getModel(state, id)
  const completed = previous.state.run !== null && result.model.run === null
  const updated: ManagedModel = {
    ...previous, state: { ...result.model, queue: result.model.queue.map(lot => ({ ...lot,
      domain: previous.state.queue.find(old => old.id === lot.id)?.domain ?? 'general' })) },
    users: result.users, benchmark: result.benchmark,
    trainingScores: completed && previous.runGains ? addProfile(previous.trainingScores, previous.runGains) : previous.trainingScores,
    runGains: completed ? null : previous.runGains,
  }
  return { ...withModel(state, updated), company: ledgerOf(result), dataLiability: state.dataLiability || result.model.dirtyHistory }
}
export function mergeCompany(state: CompanyState, result: GameState): CompanyState {
  return { ...state, company: ledgerOf(result), dataLiability: state.dataLiability || result.model.dirtyHistory, contractModelId: result.contracts.active ? state.contractModelId : null }
}
export function applyModel(state: CompanyState, id: ModelId, action: (view: GameState) => ActionResult): CompanyActionResult {
  if (!state.models.some(item => item.id === id)) return { ok: false, error: 'Модель не найдена.' }
  const result = action(modelView(state, id))
  return result.ok ? { ok: true, state: mergeModel(state, id, result.state) } : result
}
export function companyLearnedIQ(state: CompanyState): number {
  return state.models.reduce((sum, model) => sum + model.state.iq * quantizationQuality(model.quantization), 0)
}
export function companyUsers(state: CompanyState): number {
  return state.models.reduce((sum, model) => sum + model.users, 0)
}
/** Sum earned IQ for company gates. GMI's 0..N score scale is not summed across products. */
export function companyView(state: CompanyState): GameState {
  const first = modelView(state, state.models[0].id)
  const model: ModelState = {
    ...first.model, iq: companyLearnedIQ(state),
    dirtyHistory: state.dataLiability || state.models.some(item => item.state.dirtyHistory),
    tech: [...new Set(state.models.flatMap(item => item.state.tech))],
  }
  // Existing single flagship uses its actual benchmark record unchanged.
  if (state.models.length === 1) return { ...first, model, benchmark: { ...first.benchmark, last: benchmarkIsCurrent(state.models[0]) ? first.benchmark.last : null } }
  const measured = state.models.filter(item => benchmarkIsCurrent(item) && item.allocationBps > 0)
  const weights = measured.reduce((sum, item) => sum + item.allocationBps, 0)
  const last = weights > 0 ? {
    ...first.benchmark.last!,
    ...Object.fromEntries(CATEGORIES.map(key => [key, measured.reduce((sum, item) => sum + item.benchmark.last![key] * item.allocationBps, 0) / weights])),
    total: measured.reduce((sum, item) => sum + item.benchmark.last!.total * item.allocationBps, 0) / weights,
    cheated: measured.some(item => item.benchmark.last!.cheated), exposed: measured.some(item => item.benchmark.last!.exposed),
    day: Math.max(...measured.map(item => item.benchmark.last!.day)),
  } : null
  return { ...first, model, users: companyUsers(state), benchmark: { ...first.benchmark, last: last as GameState['benchmark']['last'] } }
}
/** Diagnostic competence selector; it never mints money or changes progression IQ. */
export function companyGmi(state: CompanyState) {
  const weight = state.models.reduce((sum, model) => sum + model.allocationBps, 0)
  return Object.fromEntries(CATEGORIES.map(key => [key, weight > 0
    ? state.models.reduce((sum, model) => sum + effectiveProfile(model)[key] * model.allocationBps, 0) / weight : 0]))
}

export function benchmarkIsCurrent(model: ManagedModel): boolean {
  return model.benchmark.last !== null && model.benchmarkQuantization === model.quantization
}

/** Compatibility output for existing screens. V3-only metadata never leaks into V2 saves. */
export function legacyFlagshipView(state: CompanyState): GameState {
  if (state.strategy !== 'flagship' || state.models.length !== 1) throw new Error('Портфель нельзя понизить до старого состояния.')
  const view = modelView(state, state.models[0].id)
  return { ...view, model: { ...view.model, queue: state.models[0].state.queue.map(({ domain: _domain, ...lot }) => lot) } }
}
