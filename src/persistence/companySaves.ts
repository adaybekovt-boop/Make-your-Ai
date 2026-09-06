import { openDB } from 'idb'
import { BALANCE_VERSION, TRAINING_IQ_PER_VOLUME } from '../systems/config'
import { BASE_MODELS, CATEGORIES, COMPUTE_BUDGET_BPS, DOMAINS, MAX_PORTFOLIO_MODELS, MODEL_BALANCE_VERSION, MODEL_NAME_MAX } from '../systems/models/config'
import { ledgerOf, migrateSingleModel } from '../systems/models/state'
import type { BaseModelId, CompanyLedger, CompanyState, DataDomain, GmiProfile, ManagedModel, ModelId } from '../systems/models/types'
import { DATABASE_NAME, decodeSave, validateGameState } from './saves'

export const COMPANY_SAVE_VERSION = 3
export interface CompanySaveEnvelope {
  schemaVersion: typeof COMPANY_SAVE_VERSION
  balanceVersion: number
  modelBalanceVersion: typeof MODEL_BALANCE_VERSION
  savedAt: string
  game: CompanyState
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Повреждено поле ${name}.`)
  return value as Record<string, unknown>
}
function number(value: unknown, name: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) throw new Error(`Некорректное число ${name}.`)
  return value
}
function profile(value: unknown, name: string): GmiProfile {
  const source = object(value, name)
  if (Object.keys(source).length !== CATEGORIES.length) throw new Error(`Некорректный профиль ${name}.`)
  return Object.fromEntries(CATEGORIES.map(key => [key, number(source[key], `${name}.${key}`)])) as GmiProfile
}
function near(a: number, b: number): boolean { return Math.abs(a - b) <= 1e-8 * Math.max(1, a, b) }
function sum(p: GmiProfile): number { return CATEGORIES.reduce((total, key) => total + p[key], 0) }

/** V3 accepts no legacy single-model mirrors. Validation is non-mutating and fail-closed. */
export function validateCompanyState(value: unknown): CompanyState {
  const root = object(value, 'портфель')
  if (root.strategy !== 'flagship' && root.strategy !== 'portfolio') throw new Error('Некорректная стратегия.')
  const company = object(root.company, 'компания')
  if (typeof root.dataLiability !== 'boolean') throw new Error('Некорректная история ответственности за данные.')
  for (const key of ['model', 'users', 'benchmark']) if (Object.hasOwn(company, key) || Object.hasOwn(root, key)) throw new Error('Дублирующее состояние модели в сейве V3.')
  const modelSeq = number(root.modelSeq, 'modelSeq', true)
  if (!Array.isArray(root.models) || root.models.length < 1 || root.models.length > MAX_PORTFOLIO_MODELS || (root.strategy === 'flagship' && root.models.length !== 1)) throw new Error('Некорректное количество моделей.')
  if (!Array.isArray(root.purchasedBases) || root.purchasedBases.length > BASE_MODELS.length) throw new Error('Некорректные лицензии.')
  const purchasedBases = root.purchasedBases.map(value => {
    if (!BASE_MODELS.some(spec => spec.id === value)) throw new Error('Неизвестная лицензия.')
    return value as BaseModelId
  })
  if (new Set(purchasedBases).size !== purchasedBases.length) throw new Error('Повторная лицензия.')
  const ids = new Set<string>(), bases = new Set<string>(), lotIds = new Set<number>()
  let ledger: CompanyLedger | undefined
  const models: ManagedModel[] = root.models.map(raw => {
    const source = object(raw, 'модель портфеля')
    const id = source.id
    if (typeof id !== 'string' || !/^model-[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id.slice(6))) || Number(id.slice(6)) > modelSeq || ids.has(id)) throw new Error('Некорректный или повторный ID модели.')
    ids.add(id)
    const baseId = source.baseId
    if (baseId !== 'custom' && !purchasedBases.includes(baseId as BaseModelId)) throw new Error('Нет лицензии на базовую модель.')
    if (typeof baseId !== 'string' || bases.has(baseId)) throw new Error('Копии базовых моделей не поддерживаются.')
    bases.add(baseId)
    const allocationBps = number(source.allocationBps, 'compute allocation', true)
    if (allocationBps > COMPUTE_BUDGET_BPS || (root.strategy === 'flagship' && allocationBps !== COMPUTE_BUDGET_BPS)) throw new Error('Некорректный бюджет модели.')
    const quantization = source.quantization
    if (quantization !== 0 && quantization !== 1 && quantization !== 2) throw new Error('Некорректное квантование.')
    const rawModel = object(source.state, 'состояние модели')
    const validated = validateGameState({ ...company, model: rawModel, benchmark: source.benchmark, users: source.users })
    ledger ??= ledgerOf(validated)
    const queue = validated.model.queue.map((lot, index) => {
      const rawLot = object((rawModel.queue as unknown[])[index], 'партия')
      if (!DOMAINS.includes(rawLot.domain as DataDomain)) throw new Error('Некорректный домен данных.')
      if (!Number.isSafeInteger(lot.id) || lot.id < 1 || lot.id > validated.dataLotSeq || lotIds.has(lot.id) || lot.volume <= 0) throw new Error('Некорректный или повторный ID партии.')
      lotIds.add(lot.id)
      return { ...lot, domain: rawLot.domain as DataDomain }
    })
    const benchmarkQuantization = source.benchmarkQuantization
    if (benchmarkQuantization !== null && benchmarkQuantization !== 0 && benchmarkQuantization !== 1 && benchmarkQuantization !== 2) throw new Error('Некорректная версия бенчмарка.')
    if ((validated.benchmark.last === null) !== (benchmarkQuantization === null)) throw new Error('Результат бенчмарка не соответствует версии.')
    const trainingScores = profile(source.trainingScores, 'trainingScores')
    if (!near(sum(trainingScores), 3.8 * validated.model.iq) || CATEGORIES.some(key => trainingScores[key] < .6 * validated.model.iq - 1e-7 || trainingScores[key] > 2 * validated.model.iq + 1e-7)) throw new Error('Профиль не соответствует заработанному IQ.')
    const runGains = source.runGains === null ? null : profile(source.runGains, 'runGains')
    const run = validated.model.run
    if ((run === null) !== (runGains === null)) throw new Error('Запуск обучения не соответствует профилю партии.')
    if (run && (run.total <= 0 || run.remaining > run.total || !near(sum(runGains!), 3.8 * run.total * TRAINING_IQ_PER_VOLUME))) throw new Error('Повреждённый запуск обучения.')
    const rawReceipts = object(source.receipts, 'поступления')
    const receipts = { tokens: number(rawReceipts.tokens, 'token receipts'), subscriptions: number(rawReceipts.subscriptions, 'subscription receipts'), licensing: number(rawReceipts.licensing, 'licensing receipts') }
    let name: string | undefined
    if (source.name !== undefined) {
      if (typeof source.name !== 'string' || !source.name.trim() || source.name.trim().length > MODEL_NAME_MAX) throw new Error('Некорректное имя модели.')
      name = source.name.trim()
    }
    return { id: id as ModelId, baseId: baseId as ManagedModel['baseId'], allocationBps, quantization,
      state: { ...validated.model, queue }, users: validated.users, benchmark: validated.benchmark,
      trainingScores, runGains, receipts, benchmarkQuantization, ...(name ? { name } : {}) }
  })
  if (models.reduce((sum, model) => sum + model.allocationBps, 0) > COMPUTE_BUDGET_BPS) throw new Error('Превышен общий бюджет compute.')
  if (models.some(model => model.state.dirtyHistory) && !root.dataLiability) throw new Error('Потеряна история нелегальных данных.')
  const contractModelId = root.contractModelId
  const requiresData = ledger!.contracts.active?.requiresOfficialData ?? false
  if (requiresData ? typeof contractModelId !== 'string' || !ids.has(contractModelId) : contractModelId !== null) throw new Error('Неверная привязка контракта к модели.')
  const receipts = models.reduce((sum, model) => sum + model.receipts.tokens + model.receipts.subscriptions + model.receipts.licensing, 0)
  if (receipts > ledger!.totalRevenue && !near(receipts, ledger!.totalRevenue)) throw new Error('Поступления моделей превышают выручку компании.')
  return { strategy: root.strategy, company: ledger!, modelSeq, models: models.sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6))),
    purchasedBases, dataLiability: root.dataLiability, contractModelId: contractModelId as ModelId | null }
}
export function makeCompanySave(game: CompanyState, savedAt = new Date().toISOString()): CompanySaveEnvelope {
  if (!Number.isFinite(Date.parse(savedAt))) throw new Error('Некорректная дата сохранения.')
  return { schemaVersion: COMPANY_SAVE_VERSION, balanceVersion: BALANCE_VERSION, modelBalanceVersion: MODEL_BALANCE_VERSION, savedAt, game: validateCompanyState(game) }
}
export function decodeCompanySave(value: unknown): CompanySaveEnvelope {
  const envelope = object(value, 'сохранение')
  if (envelope.schemaVersion === 0 || envelope.schemaVersion === 1 || envelope.schemaVersion === 2) {
    const legacy = decodeSave(value)
    const result = makeCompanySave(migrateSingleModel(legacy.game), legacy.savedAt)
    return { ...result, balanceVersion: legacy.balanceVersion }
  }
  if (envelope.schemaVersion !== COMPANY_SAVE_VERSION || envelope.modelBalanceVersion !== MODEL_BALANCE_VERSION) throw new Error('Версия сохранения не поддерживается.')
  if (typeof envelope.savedAt !== 'string' || !Number.isFinite(Date.parse(envelope.savedAt))) throw new Error('Некорректная дата сохранения.')
  const balanceVersion = number(envelope.balanceVersion, 'balanceVersion', true)
  if (balanceVersion < 1) throw new Error('Некорректная версия баланса.')
  return { schemaVersion: COMPANY_SAVE_VERSION, balanceVersion, modelBalanceVersion: MODEL_BALANCE_VERSION,
    savedAt: envelope.savedAt, game: validateCompanyState(envelope.game) }
}
/** Separate key until the new UI/store owns V3; old UI cannot overwrite a portfolio. */
export async function saveCompanyGame(game: CompanyState): Promise<string> {
  const envelope = makeCompanySave(game)
  const db = await openDB(DATABASE_NAME, 1, { upgrade(db) { if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves') } })
  try { await db.put('saves', envelope, 'company-v3'); return envelope.savedAt } finally { db.close() }
}
export async function loadCompanyGame(): Promise<CompanySaveEnvelope | null> {
  const db = await openDB(DATABASE_NAME, 1, { upgrade(db) { if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves') } })
  try {
    const value = await db.get('saves', 'company-v3') ?? await db.get('saves', 'main')
    return value === undefined ? null : decodeCompanySave(value)
  } finally { db.close() }
}
