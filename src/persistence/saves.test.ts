import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_NAME, decodeSave, loadGame, makeSaveEnvelope, parseSaveText, saveGame, validateGameState } from './saves'
import { createInitialGame } from '../systems/simulation'
import { BALANCE_VERSION } from '../systems/config'

beforeEach(async () => {
  const db = await openDB(DATABASE_NAME, 1, { upgrade(db) { db.createObjectStore('saves') } })
  await db.clear('saves')
  db.close()
})

describe('versioned save schema', () => {
  it('roundtrips a typed envelope without derived balance rates', () => {
    const game = createInitialGame()
    expect(decodeSave(JSON.parse(JSON.stringify(makeSaveEnvelope(game)))).game).toEqual(game)
    expect(makeSaveEnvelope(game)).toMatchObject({ schemaVersion: 2, balanceVersion: BALANCE_VERSION })
    expect(makeSaveEnvelope(game).game).not.toBe(game)
  })

  it('migrates a v0 draft with missing milestones and investment tracking', () => {
    const { milestones: _milestones, totalCapex: _capex, ...legacy } = createInitialGame()
    const decoded = decodeSave({ schemaVersion: 0, savedAt: new Date().toISOString(), game: legacy })
    expect(decoded.schemaVersion).toBe(2)
    expect(decoded.game.totalCapex).toBe(0)
    expect(decoded.game.milestones).toEqual(createInitialGame().milestones)
  })

  it('allows a balance-version change without discarding progress', () => {
    const saved = makeSaveEnvelope(createInitialGame())
    saved.balanceVersion = 42
    expect(decodeSave(saved).balanceVersion).toBe(42)
  })

  it('rejects unsupported future saves and malformed metadata', () => {
    const saved = makeSaveEnvelope(createInitialGame())
    expect(() => decodeSave({ ...saved, schemaVersion: 99 })).toThrow('Версия')
    expect(() => decodeSave({ ...saved, savedAt: 'not-a-date' })).toThrow('дата')
    expect(() => decodeSave({ ...saved, balanceVersion: 1.5 })).toThrow('версия')
    expect(() => parseSaveText('{ broken')).toThrow('JSON')
    expect(() => decodeSave(null)).toThrow()
    expect(() => decodeSave([])).toThrow()
  })

  it.each([NaN, Infinity, -Infinity, '12000', 1e100])('rejects invalid cash %s', (cash) => {
    expect(() => validateGameState({ ...createInitialGame(), cash })).toThrow()
  })

  it('permits finite operating debt', () => {
    expect(validateGameState({ ...createInitialGame(), cash: -100 }).cash).toBe(-100)
  })

  it.each(['elapsedGameHours', 'totalRevenue', 'totalExpenses', 'totalCapex'])('rejects negative %s', (key) => {
    expect(() => validateGameState({ ...createInitialGame(), [key]: -1 })).toThrow()
  })

  it('rejects fractional, negative, excessive or unowned servers', () => {
    for (const servers of [-1, 0.5, 101, NaN, Infinity]) {
      const game = createInitialGame()
      game.locations[0] = { id: 'garage', owned: true, servers }
      expect(() => validateGameState(game)).toThrow()
    }
    const game = createInitialGame()
    game.locations[0].servers = 1
    expect(() => validateGameState(game)).toThrow()
  })

  it('rejects missing, duplicate, unknown and malformed locations', () => {
    const game = createInitialGame()
    expect(() => validateGameState({ ...game, locations: game.locations.slice(1) })).toThrow()
    expect(() => validateGameState({ ...game, locations: game.locations.map(() => game.locations[0]) })).toThrow()
    expect(() => validateGameState({ ...game, locations: [{ ...game.locations[0], id: 'unknown' }, ...game.locations.slice(1)] })).toThrow()
    expect(() => validateGameState({ ...game, locations: [null, ...game.locations.slice(1)] })).toThrow()
  })

  it('rejects invalid speed, pause state and milestone values', () => {
    expect(() => validateGameState({ ...createInitialGame(), speed: 2 })).toThrow()
    expect(() => validateGameState({ ...createInitialGame(), paused: 'false' })).toThrow()
    expect(() => validateGameState({ ...createInitialGame(), milestones: {} })).toThrow()
  })
})

describe('IndexedDB persistence', () => {
  it('returns null when there is no save', async () => {
    expect(await loadGame()).toBeNull()
  })

  it('writes and restores the real IndexedDB slot with snapshot semantics', async () => {
    const game = createInitialGame()
    const savedAt = await saveGame(game)
    game.cash = 123
    const loaded = await loadGame()
    expect(loaded?.game.cash).toBe(12000)
    expect(loaded?.savedAt).toBe(savedAt)
  })

  it('a rejected write preserves the last valid save', async () => {
    await saveGame(createInitialGame())
    await expect(saveGame({ ...createInitialGame(), cash: NaN })).rejects.toThrow()
    expect((await loadGame())?.game.cash).toBe(12000)
  })

  it('loading a corrupt or future save throws without deleting it', async () => {
    const db = await openDB(DATABASE_NAME, 1)
    const future = { ...makeSaveEnvelope(createInitialGame()), schemaVersion: 99 }
    await db.put('saves', future, 'main')
    await expect(loadGame()).rejects.toThrow('Версия')
    expect(await db.get('saves', 'main')).toEqual(future)
    db.close()
  })
})
