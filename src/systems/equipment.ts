import { BASE_CHIP_FAIL_CHANCE_DAILY, CHASSIS, CHIPS, EQUIPMENT_CLEANUP_RATIO } from './config'
import { sameCell, withInstalledServers } from './serverGrid'
import { pushNotice } from './market'
import type { AnyLocationId, GameState, Rng } from './types'

/**
 * Единая механика отказа оборудования: чип уничтожается, стойка остаётся в ячейке,
 * списывается утилизация. Ею пользуется и серый импорт (заводской брак), и разгон.
 */
export function chargeEquipmentFailure(state: GameState, product: { price: number; name: string }, reason: string): GameState {
  const cleanup = Math.round(EQUIPMENT_CLEANUP_RATIO * product.price)
  return pushNotice({ ...state, cash: state.cash - cleanup, totalExpenses: state.totalExpenses + cleanup }, `${reason} Утилизация «${product.name}» — ${cleanup}.`)
}

export function failEquipment(state: GameState, locationId: AnyLocationId, serverId: string, reason: string): GameState {
  const key = state.locations.some((item) => item.id === locationId) ? 'locations' : 'regionLocations'
  const location = state[key].find((item) => item.id === locationId)
  const server = location?.installedServers?.find((item) => item.id === serverId)
  if (!location || !server) return state
  const chassis = server.chassis ?? 'rack-basic'
  const rigs = (location.rigs ?? []).filter((rig) => !sameCell(rig.gridPosition, server.gridPosition))
  if (server.gridPosition) rigs.push({ id: `rig-${server.id}`, chassis, gridPosition: { ...server.gridPosition } })
  const updated = withInstalledServers({ ...location, rigs }, location.installedServers!.filter((item) => item.id !== serverId))
  return chargeEquipmentFailure({ ...state, [key]: state[key].map((item) => item.id === locationId ? updated : item) }, CHIPS[server.chip], `${reason} Стойка сохранена.`)
}

/** Ежедневный риск отказа установленного чипа: база × множитель стойки × перегрев разгона. */
export function dailyEquipmentFailures(state: GameState, rng: Rng): GameState {
  let next = state
  const pairs: Array<{ key: 'locations' | 'regionLocations'; locationId: AnyLocationId; serverId: string }> = []
  for (const location of [...state.locations, ...state.regionLocations]) {
    if (!location.owned) continue
    for (const server of location.installedServers ?? []) {
      const chassis = CHASSIS[server.chassis ?? 'rack-basic']
      const heat = 1 + Math.max(0, server.overclock - 1) * 2
      if (rng() < BASE_CHIP_FAIL_CHANCE_DAILY * chassis.failRiskMult * heat) {
        pairs.push({ key: state.locations.some((item) => item.id === location.id) ? 'locations' : 'regionLocations', locationId: location.id, serverId: server.id })
      }
    }
  }
  for (const pair of pairs) {
    next = failEquipment(next, pair.locationId, pair.serverId, 'Оборудование отказало: чип перегорел.')
  }
  return next
}
