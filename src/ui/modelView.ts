import { CHIPS, TRAINING_IQ_PER_VOLUME } from '../systems/config'
import {
  BASE_MODELS,
  CATEGORIES,
  COMPUTE_BUDGET_BPS,
  baseDefinition,
  effectiveProfile,
  emptyProfile,
  gainsForDomain,
  modelIsOnline,
  modelWeightSizeGb,
  quantizationQuality,
  quantizationThroughput,
  scaleProfile,
} from '../systems/models'
import type {
  BaseModelId,
  CompanyState,
  DataDomain,
  GmiCategory,
  GmiProfile,
  ManagedModel,
  QuantizationStep,
} from '../systems/models'

export const CATEGORY_LABELS: Record<GmiCategory, string> = {
  reasoning: 'Reasoning',
  coding: 'Coding',
  safety: 'Safety',
  multimodal: 'Multimodal',
}

export const DOMAIN_LABELS: Record<DataDomain, string> = {
  general: 'Общие',
  reasoning: 'Логика',
  coding: 'Код',
  safety: 'Безопасность',
  multimodal: 'Мультимодальность',
}

export const QUANTIZATION_LABELS: Record<QuantizationStep, string> = {
  0: 'FP16',
  1: 'INT8',
  2: 'INT4',
}

export function modelDisplayName(model: ManagedModel): string {
  const custom = model.name?.trim()
  return custom || baseDefinition(model.baseId).name
}

export function catalogWeightGb(id: BaseModelId): number {
  return modelWeightSizeGb({
    id: 'model-1',
    baseId: id,
    allocationBps: 0,
    quantization: 0,
    state: {
      iq: 0, queue: [], run: null, infected: false, offlineUntil: null, personality: null,
      openSource: false, openSourceChosen: false, tech: [], licensed: false, dirtyHistory: false,
    },
    users: 0,
    benchmark: { preparing: false, testing: false, last: null, adBoostUntil: null },
    benchmarkQuantization: null,
    trainingScores: emptyProfile(),
    runGains: null,
    receipts: { tokens: 0, subscriptions: 0, licensing: 0 },
  })
}

/** Forecast uses the systems-layer domain coefficients; UI does not own the 2 / 0.6 table. */
export function domainGainPreview(domain: DataDomain, volume: number): GmiProfile {
  return scaleProfile(gainsForDomain(domain), volume * TRAINING_IQ_PER_VOLUME)
}

export function domainIqPreview(volume: number): number {
  return volume * TRAINING_IQ_PER_VOLUME
}

export function quantizationPreview(model: ManagedModel, step: QuantizationStep) {
  return {
    gmi: effectiveProfile({ ...model, quantization: step }),
    currentGmi: effectiveProfile(model),
    learnedIq: model.state.iq * quantizationQuality(step),
    currentLearnedIq: model.state.iq * quantizationQuality(model.quantization),
    quality: quantizationQuality(step),
    currentQuality: quantizationQuality(model.quantization),
    throughput: quantizationThroughput(step),
    currentThroughput: quantizationThroughput(model.quantization),
  }
}

export function allocationPercent(bps: number): number {
  return bps / (COMPUTE_BUDGET_BPS / 100)
}

export function percentToBps(percent: number): number {
  return Math.round(percent * (COMPUTE_BUDGET_BPS / 100))
}

export function remainingAllocationBps(state: CompanyState, except?: ManagedModel['id']): number {
  return COMPUTE_BUDGET_BPS - state.models.reduce((sum, model) => sum + (model.id === except ? 0 : model.allocationBps), 0)
}

export function flagshipReplaceBlockers(state: CompanyState): string[] {
  if (state.strategy !== 'flagship') return []
  const reasons: string[] = []
  if (state.company.ending) reasons.push('Компания уже продана.')
  const old = state.models[0]
  if (!old) return reasons
  if (old.state.run) reasons.push('Сначала дождитесь окончания обучения.')
  if (old.state.queue.length) reasons.push('Сначала загрузите или очистите очередь данных.')
  if (old.benchmark.testing) reasons.push('Сначала дождитесь окончания теста GMI.')
  if (state.company.contracts.active) reasons.push('Сначала завершите активный контракт.')
  if (old.benchmark.last?.cheated && !old.benchmark.last.exposed) {
    reasons.push('Нельзя заменить модель с неурегулированным накрученным бенчмарком.')
  }
  return reasons
}

export function modelIdleStatus(state: CompanyState, model: ManagedModel): { idle: boolean; label: string } {
  if (model.benchmark.testing) return { idle: true, label: 'На тесте · отключена от пользователей' }
  if (model.state.run) return { idle: false, label: 'Обучается' }
  if (!modelIsOnline(state, model)) {
    return { idle: true, label: 'Простой: ремонт или офлайн' }
  }
  if (model.state.infected) return { idle: false, label: 'Заражена: ждите инцидента' }
  if (state.strategy === 'portfolio' && model.allocationBps === 0) {
    return { idle: true, label: 'Простой: нет квоты мощности' }
  }
  return { idle: false, label: 'В работе' }
}

export function chipDisplayNames(): string[] {
  return Object.values(CHIPS).map((chip) => chip.name)
}

export function catalogDisplayNames(): string[] {
  return BASE_MODELS.map((item) => item.name)
}

export function startingGmi(model: ManagedModel): GmiProfile {
  return baseDefinition(model.baseId).gmi
}

export function earnedIq(model: ManagedModel): number {
  return model.state.iq
}

export { CATEGORIES, BASE_MODELS, COMPUTE_BUDGET_BPS }
