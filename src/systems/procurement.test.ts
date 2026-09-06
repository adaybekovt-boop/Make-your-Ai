import { describe, expect, it, vi } from 'vitest'
import { CHASSIS, CHIPS, EQUIPMENT_CLEANUP_RATIO } from './config'
import { buyLocation, createInitialGame } from './simulation'
import { bulkDiscount, chassisSupports, deliverOrders, deliveryHours, mountChassisFromInventory, mountChipFromInventory, orderEquipment, orderPrice, orderServerKit } from './procurement'
import { dailyEquipmentFailures, failEquipment } from './equipment'
import { deliveredServer, unwrap } from './testSupport'
import { firstFreeCell, serverOutput } from './serverGrid'
import { decodeSave, makeSaveEnvelope, validateGameState } from '../persistence/saves'
import type { Channel, ChassisId, ChipId, GameState } from './types'

const cell = { row: 0, col: 0 }
const owned = () => unwrap(buyLocation({ ...createInitialGame(), cash: 1000000 }, 'campus'))
const room = (game: GameState) => game.locations[4]
function stock(channel: Channel = 'official', chassis: ChassisId = 'rack-basic', chip: ChipId = 'consumer-gpu', qty = 1) {
  const ordered = unwrap(orderServerKit(owned(), { locationId: 'campus', chassis, chip, channel, qty, targetCell: cell }))
  return deliverOrders({ ...ordered, elapsedGameHours: 12 })
}

describe('procurement prices', () => {
  it.each([['official', 1, 3200], ['grey', 1, 2200], ['official', 2, 6080], ['grey', 2, 4180], ['official', 5, 12800], ['grey', 24, 42240]] as const)('%s ×%i costs %i', (channel, qty, expected) => {
    expect(orderPrice(2000, channel, qty)).toBe(expected)
  })
  it('caps the discount at twenty percent', () => {
    expect([1,2,3,4,5,6,24].map(bulkDiscount)).toEqual([0,.05,.1,.15000000000000002,.2,.2,.2])
    expect(orderPrice(5000, 'grey', 3)).toBe(14850)
    expect(orderPrice(20000, 'official', 5)).toBe(128000)
  })
  it.each([['consumer-gpu',6,2],['pro-gpu',8,2],['accelerator',10,3],['flagship',12,4]] as const)('delivers %s at the specified times', (chip, official, grey) => {
    expect(deliveryHours('chip', chip, 'official')).toBe(official)
    expect(deliveryHours('chip', chip, 'grey')).toBe(grey)
  })
  it('enforces the chassis chip classes', () => {
    expect(chassisSupports('rack-basic', 'pro-gpu')).toBe(true)
    expect(chassisSupports('rack-basic', 'accelerator')).toBe(false)
    expect(chassisSupports('rack-cooled', 'accelerator')).toBe(true)
    expect(chassisSupports('rack-cooled', 'flagship')).toBe(false)
    expect(chassisSupports('rack-enterprise', 'flagship')).toBe(true)
  })
})

describe('orders and delivery', () => {
  it('charges both items atomically, applies bulk discount and delivers exactly once', () => {
    const game = owned(), before = structuredClone(game)
    const ordered = unwrap(orderServerKit(game, { locationId: 'campus', chassis: 'rack-basic', chip: 'consumer-gpu', channel: 'grey', qty: 3, targetCell: cell }))
    expect(game).toEqual(before)
    expect(ordered.cash).toBe(game.cash - 8910)
    expect(ordered.totalCapex).toBe(game.totalCapex + 8910)
    expect(room(ordered).inventory).toBeUndefined()
    expect(deliverOrders({ ...ordered, elapsedGameHours: 1.99 }).orders).toHaveLength(2)
    const rng = vi.fn(() => 0)
    const arrived = deliverOrders({ ...ordered, elapsedGameHours: 2 }, rng)
    expect(rng).not.toHaveBeenCalled()
    expect(arrived.cash).toBe(ordered.cash)
    expect(arrived.totalExpenses).toBe(ordered.totalExpenses)
    expect(room(arrived).inventory).toMatchObject({ chips: { 'consumer-gpu': 3 }, chassis: { 'rack-basic': 3 }, greyChips: { 'consumer-gpu': 3 }, greyChassis: { 'rack-basic': 3 } })
    expect(room(arrived).installedServers).toEqual([])
    expect(deliverOrders(arrived)).toBe(arrived)
    const poor = { ...game, cash: 2000 }
    expect(orderServerKit(poor, { locationId: 'campus', chassis: 'rack-basic', chip: 'consumer-gpu', channel: 'official', qty: 1, targetCell: cell }).ok).toBe(false)
    expect(poor.cash).toBe(2000)
    expect(poor.orders).toEqual([])
  })
  it.each([0,-1,1.5,25,NaN,Infinity])('rejects invalid quantity %s without spending', (qty) => {
    const game = owned()
    expect(orderEquipment(game, { locationId: 'campus', kind: 'chip', item: 'consumer-gpu', channel: 'official', qty }).ok).toBe(false)
    expect(game.orders).toEqual([])
  })
  it('rejects unknown channels, unsupported kits and restricted orders', () => {
    const game = owned()
    expect(orderEquipment(game, { locationId: 'campus', kind: 'chip', item: 'consumer-gpu', channel: 'bad' as Channel, qty: 1 }).ok).toBe(false)
    expect(orderServerKit(game, { locationId: 'campus', chassis: 'rack-basic', chip: 'flagship', channel: 'official', qty: 1, targetCell: cell }).ok).toBe(false)
    expect(orderEquipment({ ...game, ending: 'acquired' }, { locationId: 'campus', kind: 'chip', item: 'consumer-gpu', channel: 'official', qty: 1 }).ok).toBe(false)
  })
  it('never allows mounting equipment still in transit', () => {
    const game = unwrap(orderServerKit(owned(), { locationId: 'campus', chassis: 'rack-basic', chip: 'consumer-gpu', channel: 'official', qty: 1, targetCell: cell }))
    expect(mountChassisFromInventory(game, 'campus', cell, 'rack-basic').ok).toBe(false)
    expect(mountChipFromInventory(game, 'campus', cell, 'consumer-gpu').ok).toBe(false)
  })
})

describe('manual installation, upgrading and failures', () => {
  it('mounts from stock without payment and keeps grid and legacy counters consistent', () => {
    const delivered = stock()
    const rack = unwrap(mountChassisFromInventory(delivered, 'campus', cell, 'rack-basic'))
    expect(firstFreeCell(room(rack))).toEqual({ row: 0, col: 1 })
    expect(mountChassisFromInventory(rack, 'campus', cell, 'rack-basic').ok).toBe(false)
    const installed = unwrap(mountChipFromInventory(rack, 'campus', cell, 'consumer-gpu'))
    expect(installed.cash).toBe(delivered.cash)
    expect(room(installed).rigs).toEqual([])
    expect(room(installed).servers).toBe(1)
    expect(room(installed).installedServers).toHaveLength(1)
    expect(validateGameState(installed)).toEqual(installed)
  })
  it('charges only for the upgrade chip, retains chassis and puts old chip on stock', () => {
    const installed = unwrap(deliveredServer(owned(), 'campus'))
    const ordered = unwrap(orderEquipment(installed, { locationId: 'campus', kind: 'chip', item: 'pro-gpu', channel: 'official', qty: 1, targetServerId: 'server-1' }))
    expect(ordered.cash).toBe(installed.cash - 9600)
    const arrived = deliverOrders({ ...ordered, elapsedGameHours: 20 })
    expect(room(arrived).installedServers?.[0].chip).toBe('consumer-gpu')
    const upgraded = unwrap(mountChipFromInventory(arrived, 'campus', cell, 'pro-gpu'))
    expect(upgraded.cash).toBe(arrived.cash)
    expect(room(upgraded).installedServers?.[0]).toMatchObject({ chassis: 'rack-basic', chip: 'pro-gpu', id: 'server-1' })
    expect(room(upgraded).inventory?.chips['consumer-gpu']).toBe(1)
    expect(room(upgraded).racks).toEqual([{ chip: 'pro-gpu', count: 1 }])
    expect(decodeSave(makeSaveEnvelope(upgraded)).game).toEqual(upgraded)
  })
  it.each([[.079999, true], [.08, false], [.99, false]] as const)('grey defect boundary %f fails=%s and uses overclock failure consequences', (roll, fails) => {
    const rack = unwrap(mountChassisFromInventory(stock('grey'), 'campus', cell, 'rack-basic', () => .99))
    const before = structuredClone(rack)
    const mounted = unwrap(mountChipFromInventory(rack, 'campus', cell, 'consumer-gpu', () => roll))
    expect(rack).toEqual(before)
    if (fails) {
      const success = unwrap(mountChipFromInventory(rack, 'campus', cell, 'consumer-gpu', () => .99))
      const failedByOverclock = failEquipment(success, 'campus', 'server-1', 'Перегрев')
      expect(mounted.locations).toEqual(failedByOverclock.locations)
      expect(mounted.cash).toBe(failedByOverclock.cash)
      expect(mounted.totalExpenses).toBe(failedByOverclock.totalExpenses)
      expect(room(mounted).servers).toBe(0)
      expect(room(mounted).rigs).toHaveLength(1)
    } else expect(room(mounted).servers).toBe(1)
    expect(validateGameState(mounted)).toEqual(mounted)
  })
  it('official stock has no factory defect roll and grey provenance survives reload', () => {
    const rng = vi.fn(() => 0)
    const official = unwrap(mountChassisFromInventory(stock(), 'campus', cell, 'rack-basic', rng))
    expect(unwrap(mountChipFromInventory(official, 'campus', cell, 'consumer-gpu', rng)).locations[4].servers).toBe(1)
    expect(rng).not.toHaveBeenCalled()
    const restored = decodeSave(makeSaveEnvelope(stock('grey'))).game
    const failed = unwrap(mountChassisFromInventory(restored, 'campus', cell, 'rack-basic', () => 0))
    expect(room(failed).rigs ?? []).toHaveLength(0)
    expect(failed.cash).toBe(restored.cash - CHASSIS['rack-basic'].price * EQUIPMENT_CLEANUP_RATIO)
    expect(room(failed).inventory?.chassis['rack-basic'] ?? 0).toBe(0)
  })
  it('retains a working old chip even when the upgrade is defective', () => {
    const installed = unwrap(deliveredServer(owned(), 'campus'))
    const ordered = unwrap(orderEquipment(installed, { locationId: 'campus', kind: 'chip', item: 'pro-gpu', channel: 'grey', qty: 1, targetServerId: 'server-1' }))
    const delivered = deliverOrders({ ...ordered, elapsedGameHours: 20 })
    const failed = unwrap(mountChipFromInventory(delivered, 'campus', cell, 'pro-gpu', () => 0))
    expect(room(failed).rigs).toHaveLength(1)
    expect(room(failed).inventory?.chips['consumer-gpu']).toBe(1)
    expect(room(failed).servers).toBe(0)
  })
  it('uses official stock first without forgetting grey units', () => {
    const grey = stock('grey')
    const ordered = unwrap(orderEquipment(grey, { locationId: 'campus', kind: 'chip', item: 'consumer-gpu', channel: 'official', qty: 1 }))
    const delivered = deliverOrders({ ...ordered, elapsedGameHours: 20 })
    const rack = unwrap(mountChassisFromInventory(delivered, 'campus', cell, 'rack-basic', () => .99))
    const rng = vi.fn(() => 0)
    const mounted = unwrap(mountChipFromInventory(rack, 'campus', cell, 'consumer-gpu', rng))
    expect(rng).not.toHaveBeenCalled()
    expect(room(mounted).inventory).toMatchObject({ chips: { 'consumer-gpu': 1 }, greyChips: { 'consumer-gpu': 1 } })
  })
  it('applies enterprise compute and cooling risk modifiers', () => {
    expect(serverOutput({ chip: 'flagship', overclock: 1, chassis: 'rack-enterprise' }).compute).toBeCloseTo(CHIPS.flagship.compute * 1.1)
    const cooled = unwrap(deliveredServer(owned(), 'campus', 'accelerator'))
    expect(dailyEquipmentFailures(cooled, () => .0018)).toBe(cooled)
    expect(room(dailyEquipmentFailures(cooled, () => .0016)).installedServers).toHaveLength(0)
  })
  it('roundtrips pending orders and rejects corrupt provenance', () => {
    const ordered = unwrap(orderServerKit(owned(), { locationId: 'campus', chassis: 'rack-enterprise', chip: 'flagship', channel: 'grey', qty: 2, targetCell: cell }))
    expect(decodeSave(makeSaveEnvelope(ordered)).game).toEqual(ordered)
    const corrupt = stock('grey')
    room(corrupt).inventory!.greyChips = { 'consumer-gpu': 2 }
    expect(() => validateGameState(corrupt)).toThrow()
  })
})

it('rejects a chip with insufficient power without consuming stock', () => {
  const installed = unwrap(deliveredServer(unwrap(buyLocation(createInitialGame(), 'garage')), 'garage'))
  const request = { locationId: 'garage' as const, chassis: 'rack-basic' as const, chip: 'consumer-gpu' as const, channel: 'grey' as const, qty: 1, targetCell: { row: 0, col: 1 } }
  const ordered = unwrap(orderServerKit(installed, request))
  const arrived = deliverOrders({ ...ordered, elapsedGameHours: 12 })
  const mounted = unwrap(mountChassisFromInventory(arrived, 'garage', request.targetCell, 'rack-basic', () => .99))
  const copy = structuredClone(mounted), rng = vi.fn(() => 0)
  expect(mountChipFromInventory(mounted, 'garage', request.targetCell, 'consumer-gpu', rng).ok).toBe(false)
  expect(mounted).toEqual(copy)
  expect(rng).not.toHaveBeenCalled()
})

it('roundtrips a mounted flagship and refuses incompatible mounting', () => {
  const stockroom = stock('official', 'rack-enterprise', 'flagship')
  const rack = unwrap(mountChassisFromInventory(stockroom, 'campus', cell, 'rack-enterprise'))
  const installed = unwrap(mountChipFromInventory(rack, 'campus', cell, 'flagship'))
  expect(room(installed).racks).toEqual([{ chip: 'flagship', count: 1 }])
  expect(decodeSave(makeSaveEnvelope(installed)).game).toEqual(installed)
  const basic = unwrap(mountChassisFromInventory(stock(), 'campus', cell, 'rack-basic'))
  const order = unwrap(orderEquipment(basic, { locationId: 'campus', kind: 'chip', item: 'flagship', channel: 'official', qty: 1 }))
  const delivered = deliverOrders({ ...order, elapsedGameHours: 24 })
  expect(mountChipFromInventory(delivered, 'campus', cell, 'flagship').ok).toBe(false)
  expect(room(delivered).inventory?.chips.flagship).toBe(1)
})

it('rejects corrupt order destinations, identifiers and sequence rather than losing shipments', () => {
  const game = unwrap(orderServerKit(owned(), { locationId: 'campus', chassis: 'rack-basic', chip: 'consumer-gpu', channel: 'grey', qty: 1, targetCell: cell }))
  for (const patch of [{ locationId: 'unknown' }, { locationId: 'garage' }, { id: 0 }, { id: 1.5 }, { targetCell: { row: 8, col: 0 } }]) {
    expect(() => decodeSave({ ...makeSaveEnvelope(game), game: { ...game, orders: [{ ...game.orders[0], ...patch }] } })).toThrow()
  }
  expect(() => decodeSave({ ...makeSaveEnvelope(game), game: { ...game, orders: 'broken' } })).toThrow()
  expect(() => validateGameState({ ...game, orders: [game.orders[0], game.orders[0]] })).toThrow()
  expect(() => validateGameState({ ...game, orderSeq: 0 })).toThrow()
})
