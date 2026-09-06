import type { BenchmarkState, DataLot, GameState, ModelState } from '../types'

export type Strategy = 'flagship' | 'portfolio'
export type BaseModelId = 'terra-s3' | 'titan-c7' | 'helios-m13'
export type ModelId = `model-${number}`
export type GmiCategory = 'reasoning' | 'coding' | 'safety' | 'multimodal'
export type GmiProfile = Record<GmiCategory, number>
export type DataDomain = 'general' | GmiCategory
export type QuantizationStep = 0 | 1 | 2
export interface DomainDataLot extends DataLot { domain: DataDomain }

/** Canonical model state. Purchased competence and earned IQ are different quantities. */
export interface ManagedModel {
  id: ModelId
  baseId: BaseModelId | 'custom'
  allocationBps: number
  quantization: QuantizationStep
  state: Omit<ModelState, 'queue'> & { queue: DomainDataLot[] }
  users: number
  benchmark: BenchmarkState
  benchmarkQuantization: QuantizationStep | null
  trainingScores: GmiProfile
  runGains: GmiProfile | null
  receipts: { tokens: number; subscriptions: number; licensing: number }
}

/** No model, users or benchmark mirrors in this company ledger. */
export type CompanyLedger = Omit<GameState, 'model' | 'users' | 'benchmark'>
export interface CompanyState {
  strategy: Strategy
  company: CompanyLedger
  models: ManagedModel[]
  modelSeq: number
  purchasedBases: BaseModelId[]
  contractModelId: ModelId | null
  dataLiability: boolean
}
export type CompanyActionResult = { ok: true; state: CompanyState } | { ok: false; error: string }

export interface BaseModelDefinition {
  id: BaseModelId
  name: string
  parametersB: number
  licensePrice: number
  inferenceCost: number
  trainingCost: number
  gmi: GmiProfile
}
