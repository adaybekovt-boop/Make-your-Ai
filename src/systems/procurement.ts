import {
  BULK_DISCOUNT_MAX,
  BULK_DISCOUNT_STEP,
  CHASSIS,
  CHIPS,
  CHIP_DELIVERY_HOURS,
  CHANNEL_MULT,
  GREY_DEFECT_CHANCE,
  MAX_ORDER_QTY,
} from './config'
import { purchasesRestricted } from './market'
import { chargeEquipmentFailure, failEquipment } from './equipment'
import { firstFreeCell, isGridPosition, locationDefinition, normalizeLocation, sameCell, serverOutput, withInstalledServers } from './serverGrid'
import type {
  ActionResult,
  AnyLocationId,
  Channel,
  ChassisId,
  ChipId,
  EquipmentOrder,
  GameState,
  GridPosition,
  LocationState,
  Rng,
} from './types'


// ---------- Цены: канал закупки и опт ----------
export function unitPrice(basePrice: number, channel: Channel): number {
  return Math.round(basePrice * CHANNEL_MULT[channel])
}

/** −5% за каждую единицу свыше первой, максимум −20%. */
export function bulkDiscount(qty: number): number {
  if (!Number.isInteger(qty) || qty < 1) return 0
  return Math.min(BULK_DISCOUNT_MAX, (qty - 1) * BULK_DISCOUNT_STEP)
}

export function orderPrice(basePrice: number, channel: Channel, qty: number): number {
  return Math.round(unitPrice(basePrice, channel) * qty * (1 - bulkDiscount(qty)))
}

export function deliveryHours(kind: 'chip' | 'chassis', item: ChipId | ChassisId, channel: Channel): number {
  return kind === 'chip' ? CHIP_DELIVERY_HOURS[item as ChipId][channel] : CHASSIS[item as ChassisId].delivery[channel]
}

export function chassisSupports(chassis: ChassisId, chip: ChipId): boolean {
  return CHASSIS[chassis].chips.includes(chip)
}

function find(state: GameState, id: AnyLocationId): LocationState | undefined {
  return [...state.locations, ...state.regionLocations].find((location) => location.id === id)
}

function update(state: GameState, location: LocationState): GameState {
  const key = state.locations.some((item) => item.id === location.id) ? 'locations' : 'regionLocations'
  const synced = location.installedServers ? withInstalledServers(location, location.installedServers) : location
  return { ...state, [key]: state[key].map((item) => item.id === location.id ? synced : item) }
}

function inventoryOf(location: LocationState): NonNullable<LocationState['inventory']> {
  return location.inventory ?? { chips: {}, chassis: {} }
}

function addToInventory(location: LocationState, kind: 'chip' | 'chassis', item: ChipId | ChassisId, qty: number, channel: Channel = 'official'): LocationState {
  const inventory = inventoryOf(location)
  const key = kind === 'chip' ? 'chips' : 'chassis'
  const greyKey = kind === 'chip' ? 'greyChips' : 'greyChassis'
  const counts = inventory[key] as Record<string, number>
  const grey = inventory[greyKey] as Record<string, number> | undefined
  return { ...location, inventory: { ...inventory, [key]: { ...counts, [item]: (counts[item] ?? 0) + qty },
    ...(channel === 'grey' ? { [greyKey]: { ...grey, [item]: (grey?.[item] ?? 0) + qty } } : {}) } }
}

/** Use verified/official stock first; retain the provenance of remaining units. */
function takeStock(location: LocationState, kind: 'chip' | 'chassis', item: ChipId | ChassisId) {
  const inventory = inventoryOf(location)
  const key = kind === 'chip' ? 'chips' : 'chassis'
  const greyKey = kind === 'chip' ? 'greyChips' : 'greyChassis'
  const counts = { ...inventory[key] } as Record<string, number>
  const grey = { ...inventory[greyKey] } as Record<string, number>
  const isGrey = (counts[item] ?? 0) === (grey[item] ?? 0)
  counts[item] -= 1
  if (counts[item] === 0) delete counts[item]
  if (isGrey) { grey[item] -= 1; if (grey[item] === 0) delete grey[item] }
  return { location: { ...location, inventory: { ...inventory, [key]: counts, ...(inventory[greyKey] ? { [greyKey]: grey } : {}) } }, isGrey }
}

function cellBusy(location: LocationState, cell: GridPosition): boolean {
  return (location.installedServers ?? []).some((server) => server.gridPosition?.row === cell.row && server.gridPosition?.col === cell.col) ||
    (location.rigs ?? []).some((rig) => rig.gridPosition.row === cell.row && rig.gridPosition.col === cell.col)
}

// ---------- Оформление заказа ----------
export interface OrderRequest {
  locationId: AnyLocationId
  kind: 'chip' | 'chassis'
  item: ChipId | ChassisId
  channel: Channel
  qty: number
  targetCell?: GridPosition | null
  targetServerId?: string | null
}

export function orderEquipment(state: GameState, request: OrderRequest): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (purchasesRestricted(state)) return { ok: false, error: 'Совет директоров ограничил крупные траты. Дождитесь окончания срока.' }
  const found = find(state, request.locationId)
  if (!found?.owned) return { ok: false, error: 'Сначала приобретите локацию.' }
  const { kind, item, channel } = request
  if (channel !== 'official' && channel !== 'grey') return { ok: false, error: 'Неизвестный канал закупки.' }
  if (kind !== 'chip' && kind !== 'chassis') return { ok: false, error: 'Неизвестный тип оборудования.' }
  if (state.orders.length >= 198) return { ok: false, error: 'Слишком много заказов в пути.' }
  const qty = request.qty
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_ORDER_QTY) return { ok: false, error: `Заказ: от 1 до ${MAX_ORDER_QTY} единиц за раз.` }
  let basePrice: number
  if (kind === 'chassis') {
    if (!CHASSIS[item as ChassisId]) return { ok: false, error: 'Неизвестный тип шасси.' }
    basePrice = CHASSIS[item as ChassisId].price
  } else {
    if (!CHIPS[item as ChipId]) return { ok: false, error: 'Неизвестный класс чипа.' }
    basePrice = CHIPS[item as ChipId].price
  }
  const price = orderPrice(basePrice, channel, qty)
  if (state.cash < price) return { ok: false, error: 'Недостаточно средств для заказа.' }

  const location = normalizeLocation(found)
  let targetCell: GridPosition | null = null
  let targetServerId: string | null = null
  if (kind === 'chassis') {
    if (request.targetCell) {
      if (!isGridPosition(request.targetCell, location.gridSize)) return { ok: false, error: 'Ячейка за пределами помещения.' }
      if (cellBusy(location, request.targetCell)) return { ok: false, error: 'В выбранной ячейке уже есть стойка.' }
      targetCell = { ...request.targetCell }
    }
  } else if (request.targetServerId) {
    const server = location.installedServers.find((item2) => item2.id === request.targetServerId)
    if (!server) return { ok: false, error: 'Установленный сервер не найден.' }
    const chassis = server.chassis ?? 'rack-basic'
    if (!chassisSupports(chassis, item as ChipId)) return { ok: false, error: `Стойка «${CHASSIS[chassis].name}» не поддерживает этот класс чипа.` }
    if (CHIPS[item as ChipId].compute <= CHIPS[server.chip].compute) return { ok: false, error: 'Выберите более мощный класс чипа.' }
    targetServerId = server.id
  } else if (request.targetCell) {
    if (!isGridPosition(request.targetCell, location.gridSize)) return { ok: false, error: 'Ячейка за пределами помещения.' }
    const rig = (location.rigs ?? []).find((item2) => item2.gridPosition.row === request.targetCell!.row && item2.gridPosition.col === request.targetCell!.col)
    if (!rig) return { ok: false, error: 'В этой ячейке нет стойки: сначала закупите шасси.' }
    if (!chassisSupports(rig.chassis, item as ChipId)) return { ok: false, error: `Стойка «${CHASSIS[rig.chassis].name}» не поддерживает этот класс чипа.` }
    if (location.installedServers.some((server) => server.gridPosition?.row === rig.gridPosition.row && server.gridPosition?.col === rig.gridPosition.col)) {
      return { ok: false, error: 'В стойке уже стоит чип: оформите апгрейд по серверу.' }
    }
    targetCell = { ...rig.gridPosition }
  }

  const order: EquipmentOrder = {
    id: state.orderSeq + 1,
    locationId: request.locationId,
    kind,
    item,
    channel,
    qty,
    paid: price,
    arriveAt: state.elapsedGameHours + deliveryHours(kind, item, channel),
    targetCell,
    targetServerId,
  }
  return {
    ok: true,
    state: {
      ...update(state, location),
      cash: state.cash - price,
      totalCapex: state.totalCapex + price,
      orderSeq: order.id,
      orders: [...state.orders, order],
    },
  }
}

/** Order a matching rack and chip together; either both are paid for or neither. */
export function orderServerKit(state: GameState, request: { locationId: AnyLocationId; chassis: ChassisId; chip: ChipId; channel: Channel; qty: number; targetCell: GridPosition }): ActionResult {
  if (!CHASSIS[request.chassis] || !CHIPS[request.chip] || !chassisSupports(request.chassis, request.chip)) return { ok: false, error: 'Чип не поддерживается стойкой.' }
  const rack = orderEquipment(state, { ...request, kind: 'chassis', item: request.chassis })
  if (!rack.ok) return rack
  return orderEquipment(rack.state, { locationId: request.locationId, kind: 'chip', item: request.chip, channel: request.channel, qty: request.qty })
}

/** Delivery only adds stock. No installation, defect roll or second payment. */
export function deliverOrders(state: GameState, _rng: Rng = Math.random): GameState {
  const due = state.orders.filter((order) => order.arriveAt <= state.elapsedGameHours)
  if (!due.length) return state
  let next = state
  for (const order of due) {
    const location = find(next, order.locationId)
    if (!location) continue
    next = update(next, addToInventory(normalizeLocation(location), order.kind, order.item, order.qty, order.channel))
    const label = order.kind === 'chip' ? CHIPS[order.item as ChipId].name : CHASSIS[order.item as ChassisId].name
    next = { ...next, pendingNotices: [...next.pendingNotices, `Доставлено на склад: ${label} ×${order.qty}. Откройте ячейку для монтажа.`] }
  }
  return { ...next, orders: next.orders.filter((order) => order.arriveAt > state.elapsedGameHours) }
}

function mountBlocked(state: GameState): string | null {
  return state.ending ? 'Компания уже продана.' : null
}

export function mountChassisFromInventory(state: GameState, locationId: AnyLocationId, position?: GridPosition, selectedChassis?: ChassisId, rng: Rng = Math.random): ActionResult {
  const restriction = mountBlocked(state)
  if (restriction) return { ok: false, error: restriction }
  const found = find(state, locationId)
  if (!found?.owned) return { ok: false, error: 'Локация не принадлежит компании.' }
  const location = normalizeLocation(found)
  const chassis = selectedChassis ?? Object.keys(inventoryOf(location).chassis).find((key) => (inventoryOf(location).chassis[key as ChassisId] ?? 0) > 0) as ChassisId | undefined
  if (!chassis || !CHASSIS[chassis] || (inventoryOf(location).chassis[chassis] ?? 0) < 1) return { ok: false, error: 'Такого шасси нет на складе локации.' }
  const target = position ?? firstFreeCell(location)
  if (!target) return { ok: false, error: 'Все ячейки заняты.' }
  if (!isGridPosition(target, location.gridSize)) return { ok: false, error: 'Ячейка за пределами помещения.' }
  if (cellBusy(location, target)) return { ok: false, error: 'В выбранной ячейке уже есть стойка.' }
  const stock = takeStock(location, 'chassis', chassis)
  if (stock.isGrey && rng() < GREY_DEFECT_CHANCE) return { ok: true, state: chargeEquipmentFailure(update(state, stock.location), CHASSIS[chassis], 'Брак серого импорта при монтаже шасси.') }
  return { ok: true, state: update(state, { ...stock.location, rigs: [...(location.rigs ?? []), { id: `rig-${target.row}-${target.col}`, chassis, gridPosition: { ...target } }] }) }
}

/** Mount a new chip or replace an installed chip; the existing rack is retained. */
export function mountChipFromInventory(state: GameState, locationId: AnyLocationId, position: GridPosition, chip: ChipId, rng: Rng = Math.random): ActionResult {
  const restriction = mountBlocked(state)
  if (restriction) return { ok: false, error: restriction }
  const found = find(state, locationId)
  if (!found?.owned) return { ok: false, error: 'Локация не принадлежит компании.' }
  const location = normalizeLocation(found)
  if (!isGridPosition(position, location.gridSize)) return { ok: false, error: 'Ячейка за пределами помещения.' }
  if (!CHIPS[chip]) return { ok: false, error: 'Неизвестный чип.' }
  const previous = location.installedServers.find((server) => sameCell(server.gridPosition, position))
  const rig = (location.rigs ?? []).find((item) => sameCell(item.gridPosition, position))
  const chassis = previous?.chassis ?? rig?.chassis
  if (!chassis) return { ok: false, error: 'В этой ячейке нет стойки.' }
  if (!chassisSupports(chassis, chip)) return { ok: false, error: 'Стойка не поддерживает этот класс чипа.' }
  if (previous && CHIPS[chip].compute <= CHIPS[previous.chip].compute) return { ok: false, error: 'Выберите более мощный чип.' }
  if ((inventoryOf(location).chips[chip] ?? 0) < 1) return { ok: false, error: 'Такого чипа нет на складе локации.' }
  const demand = location.installedServers.reduce((sum, server) => sum + (server.gridPosition && server.id !== previous?.id ? serverOutput(server).powerKw : 0), 0) + serverOutput({ chip, chassis, overclock: 1 }).powerKw
  if (demand > locationDefinition(location.id).powerLimitKw + 1e-8) return { ok: false, error: 'Недостаточно мощности энергосети для этого чипа.' }
  const stock = takeStock(location, 'chip', chip)
  let nextLocation: LocationState = stock.location
  if (previous) nextLocation = addToInventory(nextLocation, 'chip', previous.chip, 1)
  const sequence = previous ? location.serverSeq : location.serverSeq + 1
  const serverId = previous?.id ?? `server-${sequence}`
  nextLocation = withInstalledServers({ ...nextLocation, rigs: (location.rigs ?? []).filter((item) => !sameCell(item.gridPosition, position)) },
    [...location.installedServers.filter((item) => item.id !== previous?.id), { id: serverId, chip, chassis, overclock: 1, gridPosition: { ...position } }], sequence)
  let next = update(state, nextLocation)
  if (stock.isGrey && rng() < GREY_DEFECT_CHANCE) next = failEquipment(next, locationId, serverId, 'Брак серого импорта при монтаже.')
  else next = { ...next, milestones: { ...next.milestones, installedServer: true } }
  return { ok: true, state: next }
}
