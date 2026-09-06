import { describe, expect, it } from 'vitest'
import { buyLocation, createInitialGame } from './simulation'
import { installServerAt, sellServerById, setServerOverclock } from './placement'
import { gridSizeFor, locationEquipment, normalizeLocation, withInstalledServers } from './serverGrid'
import { decodeSave, makeSaveEnvelope } from '../persistence/saves'
import type { ActionResult, InstalledServer } from './types'
const ok = (result: ActionResult) => { if (!result.ok) throw new Error(result.error); return result.state }

describe('interior grid placement', () => {
  it('matches all five requested room sizes', () => {
    expect(['garage','workshop','technopark','server-hall','campus'].map((id) => gridSizeFor(id as 'garage').rows)).toEqual([3,4,5,6,8])
  })
  it('rejects a full grid even when there is spare power', () => {
    let game = ok(buyLocation({ ...createInitialGame(), cash: 500000 }, 'campus'))
    const servers: InstalledServer[] = Array.from({ length: 64 }, (_, i) => ({ id: `server-${i+1}`, chip: 'consumer-gpu', overclock: .5, gridPosition: { row: Math.floor(i/8), col: i%8 } }))
    game = { ...game, locations: game.locations.map((location) => location.id === 'campus' ? withInstalledServers(location, servers, 64) : location) }
    expect(locationEquipment(game.locations[4]).demandKw).toBe(32)
    const action = installServerAt(game, 'campus', 'consumer-gpu', { row: 0, col: 0 })
    expect(action.ok).toBe(false)
    if (!action.ok) expect(action.error).toContain('Все ячейки заняты')
  })
  it('preserves coordinates, rejects occupied/outside cells and frees only the sold cell', () => {
    let game = ok(buyLocation(createInitialGame(), 'garage'))
    game = ok(installServerAt(game, 'garage', 'consumer-gpu', { row: 2, col: 1 }))
    expect(installServerAt(game, 'garage', 'consumer-gpu', { row: 2, col: 1 }).ok).toBe(false)
    expect(installServerAt(game, 'garage', 'consumer-gpu', { row: 3, col: 1 }).ok).toBe(false)
    expect(decodeSave(makeSaveEnvelope(game)).game.locations[0].installedServers?.[0].gridPosition).toEqual({ row: 2, col: 1 })
    game = ok(sellServerById(game, 'garage', 'server-1'))
    expect(game.locations[0].installedServers).toEqual([])
  })
  it('requires energy for installation and applies quadratic overclock power', () => {
    let game = ok(buyLocation(createInitialGame(), 'garage'))
    game = ok(installServerAt(game, 'garage', 'consumer-gpu', { row: 0, col: 0 }))
    expect(installServerAt(game, 'garage', 'consumer-gpu', { row: 0, col: 1 }).ok).toBe(false)
    game = ok(setServerOverclock(game, 'garage', 'server-1', .5))
    expect(locationEquipment(game.locations[0]).demandKw).toBe(.5)
    game = ok(installServerAt(game, 'garage', 'consumer-gpu', { row: 0, col: 1 }))
    expect(game.locations[0].installedServers).toHaveLength(2)
  })
  it('migrates crowded legacy saves without losing overflow equipment', () => {
    const location = normalizeLocation({ id: 'garage', owned: true, servers: 12 })
    expect(location.installedServers.filter((server) => server.gridPosition)).toHaveLength(9)
    expect(location.installedServers.filter((server) => !server.gridPosition)).toHaveLength(3)
    const old = makeSaveEnvelope(createInitialGame())
    old.game.locations[0] = { id: 'garage', owned: true, servers: 12 }
    expect(decodeSave({ ...old, schemaVersion: 1 }).game.locations[0].installedServers).toHaveLength(12)
  })
})
