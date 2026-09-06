import { describe, expect, it } from 'vitest'
import { createInitialGame } from '../systems/simulation'
import { decodeSave, makeSaveEnvelope } from './saves'

/** A Phase 0 save: current schema version, but none of the newer systems inside. */
function legacyGame() {
  const game = createInitialGame() as unknown as Record<string, unknown>
  delete game.users
  delete game.reputation
  delete game.model
  delete game.benchmark
  delete game.contracts
  delete game.competitor
  delete game.team
  delete game.market
  delete game.investors
  delete game.regionLocations
  delete game.regions
  delete game.dataLotSeq
  delete game.ending
  delete game.acquisitionOffered
  delete game.acquisitionDeclined
  delete game.pendingNotices
  return game
}

describe('old saves keep loading', () => {
  it('backfills every new system with its initial value', () => {
    const envelope = makeSaveEnvelope(createInitialGame())
    const legacy = { ...envelope, game: legacyGame() }
    const decoded = decodeSave(legacy)
    const initial = createInitialGame()

    expect(decoded.game.users).toBe(0)
    expect(decoded.game.reputation).toBe(initial.reputation)
    expect(decoded.game.model).toEqual(initial.model)
    expect(decoded.game.benchmark).toEqual(initial.benchmark)
    expect(decoded.game.contracts).toEqual(initial.contracts)
    expect(decoded.game.competitor).toEqual(initial.competitor)
    expect(decoded.game.team).toEqual(initial.team)
    expect(decoded.game.market).toEqual(initial.market)
    expect(decoded.game.investors).toEqual(initial.investors)
    expect(decoded.game.regionLocations).toEqual([])
    expect(decoded.game.regions).toEqual([])
    expect(decoded.game.pendingNotices).toEqual([])
    expect(decoded.game.ending).toBeNull()
  })

  it('keeps legacy money and clock intact through the backfill', () => {
    const envelope = makeSaveEnvelope(createInitialGame())
    const legacy = { ...envelope, game: { ...legacyGame(), cash: 77_000, elapsedGameHours: 40, totalRevenue: 5_000 } }
    const decoded = decodeSave(legacy)
    expect(decoded.game.cash).toBe(77_000)
    expect(decoded.game.elapsedGameHours).toBe(40)
    expect(decoded.game.totalRevenue).toBe(5_000)
  })

  it('still rejects a corrupted locations list', () => {
    const envelope = makeSaveEnvelope(createInitialGame())
    const broken = { ...envelope, game: { ...legacyGame(), locations: 'oops' } }
    expect(() => decodeSave(broken)).toThrow()
  })
})
