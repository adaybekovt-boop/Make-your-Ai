import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, decodeSave, makeSaveEnvelope } from './saves'
import { decodeCompanySave, loadCompanyGame, makeCompanySave, saveCompanyGame, validateCompanyState } from './companySaves'
import { createInitialGame } from '../systems/simulation'
import { createCompanyGame, purchaseBaseModel, buyModelData, startModelTraining, advanceCompanySimulation, allocateCompute, setQuantization, benchmarkModel } from '../systems/models'
import type { CompanyActionResult, CompanyState } from '../systems/models'

function ok(result: CompanyActionResult) { if (!result.ok) throw new Error(result.error); return result.state }
const date = '2026-09-07T00:00:00.000Z'
function populated(): CompanyState {
  let game = createCompanyGame('portfolio')
  game.company.cash = 1_000_000
  game = ok(purchaseBaseModel(game, 'titan-c7'))
  game = ok(purchaseBaseModel(game, 'helios-m13'))
  game = ok(allocateCompute(game, { 'model-1': 2500, 'model-2': 2500, 'model-3': 5000 }))
  game = ok(setQuantization(game, 'model-3', 1))
  game = ok(buyModelData(game, 'model-2', 'official', 'coding'))
  game = ok(startModelTraining(game, 'model-2'))
  game = ok(buyModelData(game, 'model-3', 'unofficial', 'multimodal'))
  return game
}
beforeEach(async () => {
  const db = await openDB(DATABASE_NAME, 1, { upgrade(db) { db.createObjectStore('saves') } })
  await db.clear('saves'); db.close()
})

describe('canonical model save V3', () => {
  it('round-trips full portfolio, queues, domains, run gains, allocations and quantization without aliases', () => {
    const state = populated(), envelope = makeCompanySave(state, date)
    const restored = decodeCompanySave(JSON.parse(JSON.stringify(envelope)))
    expect(restored).toEqual(envelope); expect(restored.game).toEqual(state)
    expect(restored.game.company).not.toHaveProperty('users'); expect(restored.game.company).not.toHaveProperty('model')
    expect(restored.game.models[1].runGains!.coding).toBe(12)
    expect(restored.game.models[2].state.queue[0].domain).toBe('multimodal')
    expect(restored.game.models[2].quantization).toBe(1)
  })
  it('does not mutate state during validate or serialize', () => {
    const state = populated(), copy = structuredClone(state)
    makeCompanySave(state, date); validateCompanyState(state)
    expect(state).toEqual(copy)
  })
  it.each([0, 1, 2])('migrates legacy schema %s once, preserving company, active run and user ownership', schemaVersion => {
    const legacy = createInitialGame()
    legacy.cash = 55_555; legacy.users = 123; legacy.model.iq = 12; legacy.officeOwned = true
    legacy.cityProperties = ['meridian']; legacy.rareCarUntil = 28
    legacy.model.queue = [{ id: 1, quality: 'official', volume: 100 }]; legacy.dataLotSeq = 1
    legacy.model.run = { total: 100, remaining: 50, poisonedChance: .02, usedUnofficial: false }
    const old = { ...makeSaveEnvelope(legacy), schemaVersion, savedAt: date }
    const modern = decodeCompanySave(old)
    expect(modern.schemaVersion).toBe(3); expect(modern.game.strategy).toBe('flagship')
    expect(modern.game.models).toHaveLength(1); expect(modern.game.models[0].users).toBe(123)
    expect(modern.game.company.cash).toBe(55_555); expect(modern.game.company.officeOwned).toBe(true)
    expect(modern.game.company.cityProperties).toEqual(['meridian']); expect(modern.game.company.rareCarUntil).toBe(28)
    expect(modern.game.models[0].state.run!.remaining).toBe(50)
    expect(modern.game.models[0].state.queue[0].domain).toBe('general')
    expect(modern.game.models[0].runGains!.coding).toBeCloseTo(6.6)
    expect(decodeCompanySave(modern)).toEqual(modern)
  })
  it('migrates the old five-location save and binds the existing official contract to its original model', () => {
    const legacy = createInitialGame()
    legacy.contracts.active = { kind: 'official', clientName: 'Аврора', payout: 60_000, requiresOfficialData: true, noCheatUntilDay: 10, dirtyUntilDay: null, fulfilled: null }
    const old = makeSaveEnvelope(legacy); old.game.locations = old.game.locations.slice(0, 5)
    const modern = decodeCompanySave(old)
    expect(modern.game.company.locations).toHaveLength(7)
    expect(modern.game.contractModelId).toBe('model-1')
    expect(modern.game.company.contracts.active).toEqual(legacy.contracts.active)
  })
  it.each([
    ['negative audience', (s: any) => { s.models[0].users = -1 }],
    ['nonfinite audience', (s: any) => { s.models[0].users = Infinity }],
    ['duplicate ID', (s: any) => { s.models[1].id = s.models[0].id }],
    ['unknown base', (s: any) => { s.models[1].baseId = 'not-a-base' }],
    ['duplicated base', (s: any) => { s.models[1].baseId = 'custom' }],
    ['missing license', (s: any) => { s.purchasedBases = [] }],
    ['duplicate license', (s: any) => { s.purchasedBases.push(s.purchasedBases[0]) }],
    ['overallocated compute', (s: any) => { s.models[0].allocationBps = 10_000 }],
    ['fractional compute', (s: any) => { s.models[0].allocationBps = .5 }],
    ['unknown quantization', (s: any) => { s.models[0].quantization = 3 }],
    ['score budget mismatch', (s: any) => { s.models[0].trainingScores.coding = 100 }],
    ['unknown domain', (s: any) => { s.models[2].state.queue[0].domain = 'unknown' }],
    ['missing run gains', (s: any) => { s.models[1].runGains = null }],
    ['corrupt run gains', (s: any) => { s.models[1].runGains.coding = 10_000 }],
    ['invalid remaining work', (s: any) => { s.models[1].state.run.remaining = 1000 }],
    ['fabricated receipts', (s: any) => { s.models[0].receipts.tokens = 1000 }],
    ['single-model mirror', (s: any) => { s.company.users = 100 }],
    ['root model mirror', (s: any) => { s.model = s.models[0] }],
    ['lost dirty-data history', (s: any) => { s.models[0].state.dirtyHistory = true }],
    ['invalid contract binding', (s: any) => { s.contractModelId = 'model-2' }],
    ['strategy field missing', (s: any) => { delete s.strategy }],
    ['illegal flagship array', (s: any) => { s.strategy = 'flagship' }],
    ['sequence behind IDs', (s: any) => { s.modelSeq = 1 }],
  ])('rejects %s without silently repairing corruption', (_, damage) => {
    const state = populated(); damage(state)
    expect(() => validateCompanyState(state)).toThrow()
  })
  it('rejects unsupported schema/balance formats without resetting the company', () => {
    const envelope = makeCompanySave(populated(), date)
    expect(() => decodeCompanySave({ ...envelope, schemaVersion: 99 })).toThrow('Версия')
    expect(() => decodeCompanySave({ ...envelope, modelBalanceVersion: 99 })).toThrow('Версия')
    expect(() => decodeCompanySave({ ...envelope, savedAt: 'bad-date' })).toThrow()
    expect(() => decodeSave(envelope)).toThrow('Версия')
  })
  it('resumes an in-flight run identically after serializing and restoring', () => {
    const state = populated(); state.company.locations[0] = { id: 'garage', owned: true, servers: 1 }
    const restored = decodeCompanySave(makeCompanySave(state, date)).game
    const a = advanceCompanySimulation(state, 24 * 10 * 60, () => .99)
    const b = advanceCompanySimulation(restored, 24 * 10 * 60, () => .99)
    expect(a).toEqual(b)
    expect(a.models[1].state.iq).toBe(0) // 25% compute / training-cost 2 needs 400 hours.
  })
  it('persists stale benchmark provenance across quantization without removing fraud evidence', () => {
    let s = createCompanyGame('portfolio'); s.company.cash = 1_000_000
    s = ok(purchaseBaseModel(s, 'terra-s3'))
    s = ok(benchmarkModel(s, 'model-2', () => .5))
    s.company.elapsedGameHours = 10; s.models[1].benchmark.testing = false
    s = ok(setQuantization(s, 'model-2', 2))
    const restored = decodeCompanySave(makeCompanySave(s, date)).game
    expect(restored.models[1].benchmark.last).toEqual(s.models[1].benchmark.last)
    expect(restored.models[1].benchmarkQuantization).toBe(0)
  })
})

describe('storage activation boundary', () => {
  it('reads a legacy save without rewriting it, and keeps V3 separate from the old UI key', async () => {
    const db = await openDB(DATABASE_NAME, 1)
    const old = makeSaveEnvelope(createInitialGame())
    await db.put('saves', old, 'main')
    expect((await loadCompanyGame())!.game.strategy).toBe('flagship')
    expect(await db.get('saves', 'company-v3')).toBeUndefined()
    expect(await db.get('saves', 'main')).toEqual(old)
    const state = populated(); await saveCompanyGame(state)
    expect((await loadCompanyGame())!.game).toEqual(state)
    expect(await db.get('saves', 'main')).toEqual(old)
    db.close()
  })
})
