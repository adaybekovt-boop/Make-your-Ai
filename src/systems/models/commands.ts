import {
  BASE_MODELS, CATEGORIES, COMPUTE_BUDGET_BPS, DOMAINS, effectiveProfile, emptyProfile,
  gainsForDomain, MAX_PORTFOLIO_MODELS, MODEL_BALANCE_VERSION,
} from './config'
import { applyModel, companyView, getModel, mergeCompany, modelFromLegacy, withModel } from './state'
import type { BaseModelId, CompanyActionResult, CompanyState, DataDomain, ModelId, QuantizationStep } from './types'
import { buyDataLot, startTraining } from '../training'
import { createInitialGame, buyLocation, unlockRegion } from '../simulation'
import { runBenchmark, togglePreparing } from '../benchmark'
import {
  acceptAcquisition, acquisitionConditionsMet, licensingAvailable, purchasesRestricted, techAvailable, unlockTech,
} from '../market'
import { acceptContract, declineContract } from '../contracts'
import { TRAINING_IQ_PER_VOLUME } from '../config'
import type { ActionResult, AnyLocationId, DataQuality, GameState, Personality, Rng, TechNodeId } from '../types'
import { orderEquipment, orderServerKit, mountChassisFromInventory, mountChipFromInventory } from '../procurement'
import { fireEmployee, hireEmployee, toggleOverwork } from '../team'
import { buyCityTower, buyOffice } from '../city'
import { sellServerById, setServerOverclock, deployReserveServer } from '../placement'

const denied = (error: string): CompanyActionResult => ({ ok: false, error })
function actionAllowed(state: CompanyState): string | null {
  if (state.company.ending) return 'Компания уже продана.'
  return null
}
export function allocateCompute(state: CompanyState, allocations: Readonly<Record<string, number>>): CompanyActionResult {
  const error = actionAllowed(state); if (error) return denied(error)
  if (state.strategy !== 'portfolio') return denied('В стратегии одного флагмана весь бюджет принадлежит одной модели.')
  const ids = state.models.map(model => model.id)
  if (Object.keys(allocations).length !== ids.length || Object.keys(allocations).some(id => !ids.includes(id as ModelId))) return denied('Нужно указать бюджет каждой модели, без неизвестных ID.')
  let total = 0
  for (const id of ids) {
    const share = allocations[id]
    if (!Number.isSafeInteger(share) || share < 0 || share > COMPUTE_BUDGET_BPS) return denied('Доля должна быть целым числом от 0 до 10000.')
    total += share
  }
  if (total > COMPUTE_BUDGET_BPS) return denied('Вычислительный бюджет превышен.')
  return { ok: true, state: { ...state, models: state.models.map(model => ({ ...model, allocationBps: allocations[model.id] })) } }
}
export function purchaseBaseModel(state: CompanyState, baseId: BaseModelId,
  replacement?: { modelId: ModelId; confirm: true }): CompanyActionResult {
  const error = actionAllowed(state); if (error) return denied(error)
  const spec = BASE_MODELS.find(model => model.id === baseId)
  if (!spec) return denied('Неизвестная базовая модель.')
  if (purchasesRestricted(companyView(state))) return denied('Совет директоров ограничил крупные траты.')
  if (state.purchasedBases.includes(baseId)) return denied('Лицензия на эту базу уже приобретена. Клонирование не поддерживается.')
  if (state.company.cash < spec.licensePrice) return denied('Недостаточно средств.')
  if (state.strategy === 'portfolio' && replacement) return denied('Замена моделей портфеля в этой версии не поддерживается.')
  if (state.strategy === 'portfolio' && state.models.length >= MAX_PORTFOLIO_MODELS) return denied('Достигнут лимит моделей.')
  if (state.strategy === 'flagship') {
    if (!replacement || replacement.confirm !== true || replacement.modelId !== state.models[0].id) return denied('Замена флагмана требует явного подтверждения ID модели.')
    const old = state.models[0]
    if (old.benchmark.last?.cheated && !old.benchmark.last.exposed) return denied('Нельзя заменить модель с неурегулированным накрученным бенчмарком.')
    if (old.state.run || old.state.queue.length || old.benchmark.testing || state.company.contracts.active) return denied('Сначала завершите обучение, очередь, тестирование и контракт.')
  }
  const id: ModelId = `model-${state.modelSeq + 1}`
  const blank = createInitialGame()
  // Company personality is not cloned along with the audience or learned competence.
  blank.model.personality = state.models[0].state.personality
  const added = { ...modelFromLegacy(blank, id), baseId,
    allocationBps: state.strategy === 'flagship' ? COMPUTE_BUDGET_BPS : 0 }
  return { ok: true, state: { ...state, modelSeq: state.modelSeq + 1,
    dataLiability: state.dataLiability || state.models.some(model => model.state.dirtyHistory),
    company: { ...state.company, cash: state.company.cash - spec.licensePrice, totalCapex: state.company.totalCapex + spec.licensePrice },
    models: state.strategy === 'flagship' ? [added] : [...state.models, added],
    purchasedBases: [...state.purchasedBases, baseId] } }
}
export function setQuantization(state: CompanyState, id: ModelId, step: QuantizationStep): CompanyActionResult {
  const error = actionAllowed(state); if (error) return denied(error)
  if (step !== 0 && step !== 1 && step !== 2) return denied('Ступень квантования: 0, 1 или 2.')
  const model = state.models.find(item => item.id === id)
  if (!model) return denied('Модель не найдена.')
  if (step === model.quantization) return { ok: true, state }
  if (model.state.run || model.benchmark.testing) return denied('Нельзя менять квантование во время обучения или теста.')
  // Full precision scores are kept. Repeated toggles cannot accumulate rounding loss or gains.
  return { ok: true, state: withModel(state, { ...model, quantization: step,
    benchmark: { ...model.benchmark, adBoostUntil: null } }) }
}
export function buyModelData(state: CompanyState, id: ModelId, quality: DataQuality, domain: DataDomain = 'general'): CompanyActionResult {
  if (!DOMAINS.includes(domain) || (quality !== 'official' && quality !== 'unofficial')) return denied('Некорректный домен или качество данных.')
  const result = applyModel(state, id, view => buyDataLot(view, quality))
  if (!result.ok) return result
  result.state = { ...result.state, company: { ...result.state.company,
    totalExpenses: state.company.totalExpenses + state.company.cash - result.state.company.cash } }
  const model = getModel(result.state, id)
  return { ok: true, state: withModel(result.state, { ...model, state: { ...model.state,
    queue: model.state.queue.map(lot => lot.id === result.state.company.dataLotSeq ? { ...lot, domain } : lot) } }) }
}
export function startModelTraining(state: CompanyState, id: ModelId): CompanyActionResult {
  const model = state.models.find(item => item.id === id)
  if (!model) return denied('Модель не найдена.')
  const gains = emptyProfile()
  for (const lot of model.state.queue) {
    const weights = gainsForDomain(lot.domain)
    for (const key of CATEGORIES) gains[key] += lot.volume * TRAINING_IQ_PER_VOLUME * weights[key]
  }
  const result = applyModel(state, id, startTraining)
  return result.ok ? { ok: true, state: withModel(result.state, { ...getModel(result.state, id), runGains: gains }) } : result
}
export function benchmarkModel(state: CompanyState, id: ModelId, rng: Rng = Math.random): CompanyActionResult {
  const model = state.models.find(item => item.id === id)
  if (!model) return denied('Модель не найдена.')
  const result = applyModel(state, id, view => runBenchmark(view, rng, effectiveProfile(model)))
  return result.ok ? { ok: true, state: withModel(result.state, { ...getModel(result.state, id), benchmarkQuantization: model.quantization }) } : result
}
export const toggleModelPreparing = (state: CompanyState, id: ModelId) => applyModel(state, id, togglePreparing)
export function setModelPersonality(state: CompanyState, id: ModelId, personality: Personality): CompanyActionResult {
  if (personality !== 'friendly' && personality !== 'raw') return denied('Неизвестная личность модели.')
  return applyModel(state, id, view => {
    if (view.ending || view.model.personality !== null) return { ok: false, error: 'Личность уже выбрана или партия завершена.' }
    return { ok: true, state: { ...view, model: { ...view.model, personality } } }
  })
}
export function unlockModelTech(state: CompanyState, id: ModelId, tech: TechNodeId): CompanyActionResult {
  return applyModel(state, id, view => {
    if (view.ending || !techAvailable(view, tech)) return { ok: false, error: 'Технология недоступна.' }
    const next = unlockTech(view, tech)
    if (next.cash < 0) return { ok: false, error: 'Недостаточно средств.' }
    return { ok: true, state: next }
  })
}
export function toggleModelLicensing(state: CompanyState, id: ModelId): CompanyActionResult {
  return applyModel(state, id, view => {
    if (view.ending || !licensingAvailable(view)) return { ok: false, error: 'Лицензирование недоступно.' }
    return { ok: true, state: { ...view, model: { ...view.model, licensed: !view.model.licensed } } }
  })
}
/** Shared operations run ONCE. Never invoke the legacy full simulator through this adapter. */
function shared(state: CompanyState, action: (view: GameState) => ActionResult): CompanyActionResult {
  const error = actionAllowed(state); if (error) return denied(error)
  const result = action(companyView(state))
  return result.ok ? { ok: true, state: mergeCompany(state, result.state) } : result
}
export function acceptCompanyContract(state: CompanyState, variant: Parameters<typeof acceptContract>[1], modelId?: ModelId): CompanyActionResult {
  if (!['official', 'grey', 'enterprise'].includes(variant)) return denied('Неизвестный вариант контракта.')
  if (variant === 'official' && (!modelId || !state.models.some(item => item.id === modelId))) return denied('Для обязательства по данным нужна конкретная модель.')
  // Do not let an in-flight, pre-contract training retroactively fulfill the next-training obligation.
  if (variant === 'official' && getModel(state, modelId!).state.run) return denied('Сначала завершите текущий запуск обучения выбранной модели.')
  const result = shared(state, view => acceptContract(view, variant))
  return result.ok ? { ok: true, state: { ...result.state, contractModelId: variant === 'official' ? modelId! : null } } : result
}
export const declineCompanyContract = (state: CompanyState) => shared(state, view => ({ ok: true, state: declineContract(view) }))
export function acceptCompanyAcquisition(state: CompanyState): CompanyActionResult {
  if (!state.company.acquisitionOffered || !acquisitionConditionsMet(companyView(state))) return denied('Предложение поглощения недоступно.')
  return shared(state, view => ({ ok: true, state: acceptAcquisition(view) }))
}
export const buyCompanyLocation = (s: CompanyState, id: AnyLocationId) => shared(s, view => buyLocation(view, id))
export const unlockCompanyRegion = (s: CompanyState, id: string) => shared(s, view => unlockRegion(view, id))
export const orderCompanyEquipment = (s: CompanyState, request: Parameters<typeof orderEquipment>[1]) => shared(s, view => orderEquipment(view, request))
export const orderCompanyServerKit = (s: CompanyState, request: Parameters<typeof orderServerKit>[1]) => shared(s, view => orderServerKit(view, request))
export const mountCompanyChassis = (s: CompanyState, ...args: Parameters<typeof mountChassisFromInventory> extends [GameState, ...infer T] ? T : never) => shared(s, view => mountChassisFromInventory(view, ...args))
export const mountCompanyChip = (s: CompanyState, ...args: Parameters<typeof mountChipFromInventory> extends [GameState, ...infer T] ? T : never) => shared(s, view => mountChipFromInventory(view, ...args))
export const hireCompanyEmployee = (s: CompanyState, role: Parameters<typeof hireEmployee>[1]) => shared(s, view => hireEmployee(view, role))
export const fireCompanyEmployee = (s: CompanyState, id: number) => shared(s, view => fireEmployee(view, id))
export const toggleCompanyOverwork = (s: CompanyState) => shared(s, toggleOverwork)
export const buyCompanyTower = (s: CompanyState, id: Parameters<typeof buyCityTower>[1]) => shared(s, view => buyCityTower(view, id))
export const buyCompanyOffice = (s: CompanyState) => shared(s, buyOffice)
export const sellCompanyServer = (s: CompanyState, ...args: Parameters<typeof sellServerById> extends [GameState, ...infer T] ? T : never) => shared(s, view => sellServerById(view, ...args))
export const overclockCompanyServer = (s: CompanyState, ...args: Parameters<typeof setServerOverclock> extends [GameState, ...infer T] ? T : never) => shared(s, view => setServerOverclock(view, ...args))
export const deployCompanyReserve = (s: CompanyState, ...args: Parameters<typeof deployReserveServer> extends [GameState, ...infer T] ? T : never) => shared(s, view => deployReserveServer(view, ...args))
// Revision exposed for future UI diagnostics; all numeric values live in config, not screens.
export const modelBalanceVersion = MODEL_BALANCE_VERSION
