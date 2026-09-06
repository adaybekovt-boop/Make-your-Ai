import type { BaseModelDefinition, DataDomain, GmiCategory, GmiProfile, ManagedModel } from './types'

export const MODEL_BALANCE_VERSION = 1
export const MAX_PORTFOLIO_MODELS = 4
export const COMPUTE_BUDGET_BPS = 10_000
export const CATEGORIES: readonly GmiCategory[] = ['reasoning', 'coding', 'safety', 'multimodal']
export const DOMAINS: readonly DataDomain[] = ['general', ...CATEGORIES]
export const GENERAL_GAINS: Readonly<GmiProfile> = { reasoning: 1, coding: 1.1, safety: .9, multimodal: .8 }
/** Fixed v1 design values. See docs/MODEL_ARCHITECTURE.md; not measurements of real hardware. */
export const MODEL_NAME_MAX = 48
export const BASE_MODELS: readonly BaseModelDefinition[] = [
  { id: 'terra-s3', name: 'Aurora S3', parametersB: 3, licensePrice: 18_000, inferenceCost: 1, trainingCost: 1,
    gmi: { reasoning: 18, coding: 20, safety: 16, multimodal: 14 } },
  { id: 'titan-c7', name: 'Vertex C7', parametersB: 7, licensePrice: 60_000, inferenceCost: 1.5, trainingCost: 2,
    gmi: { reasoning: 32, coding: 48, safety: 28, multimodal: 24 } },
  { id: 'helios-m13', name: 'Meridian M13', parametersB: 13, licensePrice: 120_000, inferenceCost: 2, trainingCost: 4,
    gmi: { reasoning: 52, coding: 48, safety: 46, multimodal: 58 } },
]
export const emptyProfile = (): GmiProfile => ({ reasoning: 0, coding: 0, safety: 0, multimodal: 0 })
export const meanProfile = (profile: GmiProfile): number => CATEGORIES.reduce((sum, key) => sum + profile[key], 0) / CATEGORIES.length
export const scaleProfile = (profile: Readonly<GmiProfile>, factor: number): GmiProfile => Object.fromEntries(CATEGORIES.map(key => [key, profile[key] * factor])) as GmiProfile
export const addProfile = (a: GmiProfile, b: GmiProfile): GmiProfile => Object.fromEntries(CATEGORIES.map(key => [key, a[key] + b[key]])) as GmiProfile
export function baseDefinition(id: ManagedModel['baseId']) {
  if (id === 'custom') return { name: 'Terra Zero', parametersB: 3, inferenceCost: 1, trainingCost: 1, gmi: emptyProfile() }
  const definition = BASE_MODELS.find(item => item.id === id)
  if (!definition) throw new RangeError('Неизвестная базовая модель.')
  return definition
}
export function gainsForDomain(domain: DataDomain): Readonly<GmiProfile> {
  if (!DOMAINS.includes(domain)) throw new RangeError('Неизвестный домен данных.')
  // Conserves the old total gain 1 + 1.1 + .9 + .8 = 3.8 per earned IQ.
  return domain === 'general' ? GENERAL_GAINS : Object.fromEntries(CATEGORIES.map(key => [key, key === domain ? 2 : .6])) as GmiProfile
}
export const quantizationQuality = (step: number): number => .96 ** step
export const quantizationThroughput = (step: number): number => 1.25 ** step
export const modelWeightSizeGb = (model: ManagedModel): number => baseDefinition(model.baseId).parametersB * 2 / 2 ** model.quantization
export const effectiveProfile = (model: ManagedModel): GmiProfile => scaleProfile(addProfile(baseDefinition(model.baseId).gmi, model.trainingScores), quantizationQuality(model.quantization))
