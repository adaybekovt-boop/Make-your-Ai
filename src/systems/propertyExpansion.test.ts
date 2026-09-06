import { describe, expect, it } from 'vitest'
import { buyOffice, OFFICE_PRICE } from './city'
import { buyLocation, createInitialGame } from './simulation'
import { deliveredServer } from './testSupport'
import { decodeSave, makeSaveEnvelope } from '../persistence/saves'

function richGame() { return { ...createInitialGame(), cash: 1_000_000 } }
describe('purchasable outskirts and headquarters', () => {
  it.each(['dc-north', 'dc-south'] as const)('buys, equips and restores %s independently', id => {
    const initial = richGame(), purchase = buyLocation(initial, id)
    expect(purchase.ok).toBe(true)
    if (!purchase.ok) return
    const mounted = deliveredServer(purchase.state, id, 'consumer-gpu', { row: 0, col: 0 })
    expect(mounted.ok).toBe(true)
    if (!mounted.ok) return
    const restored = decodeSave(makeSaveEnvelope(mounted.state)).game
    expect(restored.locations.find(l => l.id === id)?.installedServers).toHaveLength(1)
    expect(restored.locations.find(l => l.id === 'garage')?.owned).toBe(false)
    expect(initial.locations.every(l => !l.owned)).toBe(true)
    expect(buyLocation(restored, id).ok).toBe(false)
  })
  it('does not give away HQ and preserves ownership across saves', () => {
    expect(createInitialGame().officeOwned).not.toBe(true)
    expect(buyOffice(createInitialGame()).ok).toBe(false)
    const initial = richGame(), bought = buyOffice(initial)
    expect(bought.ok).toBe(true)
    if (!bought.ok) return
    expect(bought.state.cash).toBe(initial.cash - OFFICE_PRICE)
    expect(bought.state.totalCapex).toBe(OFFICE_PRICE)
    expect(decodeSave(makeSaveEnvelope(bought.state)).game.officeOwned).toBe(true)
    expect(buyOffice(bought.state).ok).toBe(false)
    expect(initial.officeOwned).not.toBe(true)
  })
  it('adds only the new unowned data centers when reading a complete legacy save', () => {
    const original = richGame()
    const legacy = { ...makeSaveEnvelope(original), game: { ...original, locations: original.locations.slice(0, 5) } }
    const restored = decodeSave(legacy).game
    expect(restored.locations).toHaveLength(7)
    expect(restored.locations.slice(0, 5)).toEqual(legacy.game.locations)
    expect(restored.locations.slice(5).every(l => !l.owned)).toBe(true)
    expect(restored.cash).toBe(original.cash)
    expect(() => decodeSave({ ...legacy, game: { ...legacy.game, locations: legacy.game.locations.slice(1) } })).toThrow()
  })
  it('blocks an office purchase during spending restrictions', () => {
    const game = richGame()
    expect(buyOffice({ ...game, investors: { ...game.investors, restrictedUntil: 10 } }).ok).toBe(false)
  })
})
