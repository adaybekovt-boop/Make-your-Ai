import { describe, expect, it } from 'vitest'
import { CHIPS } from '../systems/config'
import { BASE_MODELS, createCompanyGame, gainsForDomain, purchaseBaseModel, renameModel, scaleProfile } from '../systems/models'
import { TRAINING_IQ_PER_VOLUME } from '../systems/config'
import {
  baseCatalogLabel,
  catalogDisplayNames,
  catalogWeightGb,
  chipDisplayNames,
  domainGainPreview,
  domainIqPreview,
  flagshipReplaceBlockers,
  modelDisplayName,
  percentToBps,
  remainingAllocationBps,
} from './modelView'

describe('catalog display names', () => {
  it('renames only visible titles and keeps internal ids', () => {
    expect(BASE_MODELS.map((item) => [item.id, item.name])).toEqual([
      ['terra-s3', 'Aurora S3'],
      ['titan-c7', 'Vertex C7'],
      ['helios-m13', 'Meridian M13'],
    ])
    expect(catalogDisplayNames()).toEqual(['Aurora S3', 'Vertex C7', 'Meridian M13'])
    expect(chipDisplayNames()).toEqual(['Terra T1', 'Titan X9', 'Helios HC', 'Zenith Z1'])
    for (const name of catalogDisplayNames()) {
      expect(chipDisplayNames()).not.toContain(name)
      expect(name).not.toMatch(/Terra|Titan|Helios/)
    }
  })

  it('reads catalog size from the systems weight helper, not hardcoded gigabytes', () => {
    expect(catalogWeightGb('terra-s3')).toBe(6)
    expect(catalogWeightGb('titan-c7')).toBe(14)
    expect(catalogWeightGb('helios-m13')).toBe(26)
  })
})

describe('player-facing model names', () => {
  it('falls back to the catalog title and stores a custom name without touching ids', () => {
    const started = createCompanyGame('flagship')
    expect(modelDisplayName(started.models[0])).toBe('Terra Zero')
    expect(baseCatalogLabel(started.models[0])).toBe('Стартовая база')
    const named = renameModel(started, 'model-1', 'Аврора')
    expect(named.ok).toBe(true)
    if (named.ok) {
      expect(named.state.models[0].id).toBe('model-1')
      expect(modelDisplayName(named.state.models[0])).toBe('Аврора')
      expect(baseCatalogLabel(named.state.models[0])).toBe('Стартовая база')
    }
    const portfolio = createCompanyGame('portfolio')
    const bought = purchaseBaseModel({ ...portfolio, company: { ...portfolio.company, cash: 1_000_000 } }, 'terra-s3', undefined, 'Норд')
    expect(bought.ok).toBe(true)
    if (bought.ok) {
      expect(baseCatalogLabel(bought.state.models[1])).toBe('Aurora S3')
    }
  })
})

describe('UI forecasts call the systems layer', () => {
  it('uses gainsForDomain for every category instead of a local coefficient table', () => {
    const volume = 100
    expect(domainIqPreview(volume)).toBe(volume * TRAINING_IQ_PER_VOLUME)
    expect(domainGainPreview('coding', volume)).toEqual(scaleProfile(gainsForDomain('coding'), volume * TRAINING_IQ_PER_VOLUME))
    expect(domainGainPreview('general', volume)).toEqual(scaleProfile(gainsForDomain('general'), volume * TRAINING_IQ_PER_VOLUME))
  })

  it('converts percents to basis points the allocator understands', () => {
    expect(percentToBps(100)).toBe(10_000)
    expect(percentToBps(25)).toBe(2_500)
  })

  it('clamps leftover quota so two models cannot exceed 100%', () => {
    const started = createCompanyGame('portfolio')
    const state = { ...started, company: { ...started.company, cash: 1_000_000 } }
    expect(remainingAllocationBps(state, state.models[0].id)).toBe(10_000)
    state.models[0].allocationBps = 7_500
    const second = purchaseBaseModel(state, 'terra-s3', undefined, 'Норд')
    expect(second.ok).toBe(true)
    if (second.ok) {
      expect(remainingAllocationBps(second.state, second.state.models[1].id)).toBe(2_500)
      expect(remainingAllocationBps(second.state, second.state.models[0].id)).toBe(10_000)
    }
  })
})

describe('flagship replacement gate copy', () => {
  it('explains why purchase is locked while training, queue, test or a contract is active', () => {
    const state = createCompanyGame('flagship')
    state.models[0].state.run = { total: 100, remaining: 40, poisonedChance: 0, usedUnofficial: false }
    expect(flagshipReplaceBlockers(state)).toContain('Сначала дождитесь окончания обучения.')
    const queued = createCompanyGame('flagship')
    queued.models[0].state.queue = [{ id: 1, quality: 'official', volume: 100, domain: 'general' }]
    expect(flagshipReplaceBlockers(queued).join(' ')).toMatch(/очередь/)
    const testing = createCompanyGame('flagship')
    testing.models[0].benchmark.testing = true
    expect(flagshipReplaceBlockers(testing).join(' ')).toMatch(/теста/)
    const contracted = createCompanyGame('flagship')
    contracted.company.contracts.active = {
      kind: 'official', clientName: 'Аврора', payout: 1, requiresOfficialData: true,
      noCheatUntilDay: 10, dirtyUntilDay: null, fulfilled: null,
    }
    expect(flagshipReplaceBlockers(contracted).join(' ')).toMatch(/контракт/)
  })

  it('keeps purchaseBaseModel as the authority: UI reasons do not replace the command', () => {
    const state = { ...createCompanyGame('flagship'), company: { ...createCompanyGame().company, cash: 1_000_000 } }
    state.models[0].state.run = { total: 10, remaining: 10, poisonedChance: 0, usedUnofficial: false }
    expect(purchaseBaseModel(state, 'terra-s3', { modelId: 'model-1', confirm: true }).ok).toBe(false)
    expect(CHIPS['consumer-gpu'].name).toBe('Terra T1')
  })
})
