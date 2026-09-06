import {
  BULK_DISCOUNT_MAX,
  BULK_DISCOUNT_STEP,
  CHASSIS,
  CHIPS,
  CHIP_DELIVERY_HOURS,
  CHANNEL_MULT,
  EQUIPMENT_CLEANUP_RATIO,
  GREY_DEFECT_CHANCE,
  MAX_ORDER_QTY,
} from './config'
import { purchasesRestricted, pushNotice } from './market'
import { firstFreeCell, gridSizeFor, isGridPosition, locationDefinition, normalizeLocation, serverOutput } from './serverGrid'
import type {
  ActionResult,
  AnyLocationId,
  Channel,
  ChassisId,
  ChipId,
  EquipmentOrder,
  GameState,
  GridPosition,
  InstalledServer,
  LocationState,
  Rng,
} from './types'

type Working = LocationState & { gridSize: ReturnType<typeof gridSizeFor>; installedServers: InstalledServer[]; serverSeq: number }

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
  return { ...state, [key]: state[key].map((item) => item.id === location.id ? location : item) }
}

function inventoryOf(location: LocationState): NonNullable<LocationState['inventory']> {
  return location.inventory ?? { chips: {}, chassis: {} }
}

function addToInventory(location: LocationState, kind: 'chip' | 'chassis', item: ChipId | ChassisId, qty: number): LocationState {
  const inventory = inventoryOf(location)
  if (kind === 'chip') {
    const chips = { ...inventory.chips }
    chips[item as ChipId] = (chips[item as ChipId] ?? 0) + qty
    return { ...location, inventory: { chips, chassis: inventory.chassis } }
  }
  const chassis = { ...inventory.chassis }
  chassis[item as ChassisId] = (chassis[item as ChassisId] ?? 0) + qty
  return { ...location, inventory: { chips: inventory.chips, chassis } }
}

function cellBusy(location: LocationState, cell: GridPosition): boolean {
  return location.installedServers.some((server) => server.gridPosition?.row === cell.row && server.gridPosition?.col === cell.col) ||
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

// ---------- Доставка ----------
function deliverOne(state: GameState, order: EquipmentOrder, rng: Rng): { state: GameState; notices: string[] } {
  const found = find(state, order.locationId)
  if (!found) return { state, notices: [] }
  let location = normalizeLocation(found) as Working
  const notices: string[] = []
  let remaining = order.qty
  let failed = 0
  const label = order.kind === 'chip' ? CHIPS[order.item as ChipId].name : CHASSIS[order.item as ChassisId].name

  while (remaining > 0) {
    remaining -= 1
    // Серый импорт: шанс заводского брака проверяется на каждой единице при монтаже.
    if (order.channel === 'grey' && rng() < GREY_DEFECT_CHANCE) {
      failed += 1
      continue
    }
    if (order.kind === 'chassis') {
      let placed = false
      const rigId = `rig-${order.id}-${order.qty - remaining}`
      if (order.targetCell && !cellBusy(location, order.targetCell)) {
        location = { ...location, rigs: [...(location.rigs ?? []), { id: rigId, chassis: order.item as ChassisId, gridPosition: { ...order.targetCell } }] }
        placed = true
      }
      if (!placed) {
        const free = firstFreeCell({ ...location, rigs: location.rigs ?? [], installedServers: location.installedServers })
        if (free && !cellBusy(location, free)) {
          location = { ...location, rigs: [...(location.rigs ?? []), { id: rigId, chassis: order.item as ChassisId, gridPosition: { ...free } }] }
          placed = true
        }
      }
      if (!placed) location = addToInventory(location, 'chassis', order.item as ChassisId, 1)
      continue
    }
    const chip = order.item as ChipId
    if (order.targetServerId) {
      const server = location.installedServers.find((item) => item.id === order.targetServerId)
      if (server) {
        const chassis = server.chassis ?? 'rack-basic'
        if (chassisSupports(chassis, chip) && CHIPS[chip].compute > CHIPS[server.chip].compute) {
          location = {
            ...location,
            inventory: addToInventory({ ...location, inventory: inventoryOf(location) }, 'chip', server.chip, 1).inventory,
            installedServers: location.installedServers.map((item) => item.id === server.id ? { ...item, chip, chassis, overclock: 1 } : item),
          }
          continue
        }
      }
    }
    let mounted = false
    if (order.targetCell) {
      const rig = (location.rigs ?? []).find((item) => item.gridPosition.row === order.targetCell!.row && item.gridPosition.col === order.targetCell!.col)
      const busy = location.installedServers.some((server) => server.gridPosition?.row === order.targetCell!.row && server.gridPosition?.col === order.targetCell!.col)
      if (rig && !busy && chassisSupports(rig.chassis, chip)) {
        const sequence = location.serverSeq + 1
        location = {
          ...location,
          serverSeq: sequence,
          installedServers: [...location.installedServers, { id: `server-${sequence}`, chip, chassis: rig.chassis, overclock: 1, gridPosition: { ...rig.gridPosition } }],
        }
        mounted = true
      }
    }
    if (!mounted) location = addToInventory(location, 'chip', chip, 1)
  }

  let next = update(state, location)
  if (failed > 0) {
    const cleanup = Math.round(EQUIPMENT_CLEANUP_RATIO * (order.kind === 'chip' ? CHIPS[order.item as ChipId].price : CHASSIS[order.item as ChassisId].price) * failed)
    next = { ...next, cash: next.cash - cleanup, totalExpenses: next.totalExpenses + cleanup }
    notices.push(`Брак серого импорта: ${failed} из ${order.qty} ед. «${label}» не прошли монтаж. Утилизация — ${cleanup}.`)
  }
  notices.push(`Доставка: «${label}» ×${order.qty - failed} поступило в локацию.`)
  return { state: next, notices }
}

/** Часовая проверка доставки: оплата уже сделана при заказе, здесь только приход. */
export function deliverOrders(state: GameState, rng: Rng): GameState {
  const due = state.orders.filter((order) => order.arriveAt <= state.elapsedGameHours)
  if (due.length === 0) return state
  let next = state
  const notices: string[] = []
  for (const order of due) {
    const result = deliverOne(next, order, rng)
    next = result.state
    notices.push(...result.notices)
  }
  return {
    ...next,
    orders: next.orders.filter((order) => order.arriveAt > state.elapsedGameHours),
    pendingNotices: [...next.pendingNotices, ...notices],
  }
}

// ---------- Монтаж со склада ----------
export function mountChipFromInventory(state: GameState, locationId: AnyLocationId, position: GridPosition, chip: ChipId): ActionResult {
  const found = find(state, locationId)
  if (!found?.owned) return { ok: false, error: 'Локация не принадлежит компании.' }
  const location = normalizeLocation(found)
  const rig = (location.rigs ?? []).find((item) => item.gridPosition.row === position.row && item.gridPosition.col === position.col)
  if (!rig) return { ok: false, error: 'В этой ячейке нет стойки.' }
  if (location.installedServers.some((server) => server.gridPosition?.row === position.row && server.gridPosition?.col === position.col)) {
    return { ok: false, error: 'В стойке уже стоит чип.' }
  }
  if (!chassisSupports(rig.chassis, chip)) return { ok: false, error: `Стойка «${CHASSIS[rig.chassis].name}» не поддерживает этот класс чипа.` }
  const inventory = inventoryOf(location)
  if ((inventory.chips[chip] ?? 0) < 1) return { ok: false, error: 'Такого чипа нет на складе локации.' }
  const demand = location.installedServers.reduce((sum, server) => sum + (server.gridPosition ? serverOutput(server).powerKw : 0), 0) +
    serverOutput({ chip, overclock: 1, chassis: rig.chassis }).powerKw
  if (demand > locationDefinition(location.id).powerLimitKw + 1e-8) return { ok: false, error: 'Недостаточно мощности энергосети для этого чипа.' }
  const chips = { ...inventory.chips }
  chips[chip] = (chips[chip] ?? 0) - 1
  if (chips[chip] === 0) delete chips[chip]
  const sequence = location.serverSeq + 1
  const next = {
    ...location,
    serverSeq: sequence,
    inventory: { chips, chassis: inventory.chassis },
    installedServers: [...location.installedServers, { id: `server-${sequence}`, chip, chassis: rig.chassis, overclock: 1, gridPosition: { ...position } }],
  }
  return { ok: true, state: update(state, next) }
}

export function mountChassisFromInventory(state: GameState, locationId: AnyLocationId, position?: GridPosition): ActionResult {
  const found = find(state, locationId)
  if (!found?.owned) return { ok: false, error: 'Локация не принадлежит компании.' }
  const location = normalizeLocation(found)
  const available = Object.entries(inventoryOf(location).chassis).find(([, count]) => (count ?? 0) > 0)
  if (!available) return { ok: false, error: 'Шасси нет на складе локации.' }
  const chassis = available[0] as ChassisId
  const target = position ?? firstFreeCell({ ...location, rigs: location.rigs ?? [], installedServers: location.installedServers })
  if (!target) return { ok: false, error: 'Все ячейки заняты. В помещении нет свободного места.' }
  if (!isGridPosition(target, location.gridSize)) return { ok: false, error: 'Ячейка за пределами помещения.' }
  if (cellBusy(location, target)) return { ok: false, error: 'В выбранной ячейке уже есть стойка.' }
  const inventory = inventoryOf(location)
  const chassisStock = { ...inventory.chassis }
  chassisStock[chassis] = (chassisStock[chassis] ?? 0) - 1
  if (chassisStock[chassis] === 0) delete chassisStock[chassis]
  const next = {
    ...location,
    inventory: { chips: inventory.chips, chassis: chassisStock },
    rigs: [...(location.rigs ?? []), { id: `rig-${location.serverSeq + 1}-${target.row}-${target.col}`, chassis, gridPosition: { ...target } }],
  }
  return { ok: true, state: update(state, next) }
}

export function pushDeliveryNotice(state: GameState, message: string): GameState {
  return pushNotice(state, message)
}
