import { deliverOrders, mountChassisFromInventory, mountChipFromInventory, orderServerKit } from './procurement'
import { firstFreeCell } from './serverGrid'
import type { ActionResult, AnyLocationId, ChipId, GameState, GridPosition } from './types'

export function unwrap(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

/** Test setup through the real order, delivery and manual mounting actions. */
export function deliveredServer(state: GameState, id: AnyLocationId, chip: ChipId = 'consumer-gpu', position?: GridPosition): ActionResult {
  const location = [...state.locations, ...state.regionLocations].find((item) => item.id === id)
  const target = position ?? (location ? firstFreeCell(location) : null)
  if (!target) return { ok: false, error: 'Все ячейки заняты.' }
  const chassis = chip === 'flagship' ? 'rack-enterprise' : chip === 'accelerator' ? 'rack-cooled' : 'rack-basic'
  const ordered = orderServerKit(state, { locationId: id, chassis, chip, channel: 'official', qty: 1, targetCell: target })
  if (!ordered.ok) return ordered
  const delivered = deliverOrders({ ...ordered.state, elapsedGameHours: Math.max(...ordered.state.orders.map((order) => order.arriveAt)) })
  const mounted = mountChassisFromInventory(delivered, id, target, chassis)
  return mounted.ok ? mountChipFromInventory(mounted.state, id, target, chip) : mounted
}
