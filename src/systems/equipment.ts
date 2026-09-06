import { BASE_CHIP_FAIL_CHANCE_DAILY, CHASSIS, CHIPS, EQUIPMENT_CLEANUP_RATIO } from './config'
import { pushNotice } from './market'
import type { AnyLocationId, GameState, Rng } from './types'

/**
 * Единая механика отказа оборудования: чип уничтожается, стойка остаётся в ячейке,
 * списывается утилизация. Ею пользуется и серый импорт (заводской брак), и разгон.
 */
export function failEquipment(state: GameState, locationId: AnyLocationId, serverId: string, reason: string): GameState {
  const key = state.locations.some((item) => item.id === locationId) ? 'locations' : 'regionLocations'
  let cleanup = 0
  let chipName = ''
  const locations = state[key].map((location) => {
    if (location.id !== locationId) return location
    const server = (location.installedServers ?? []).find((item) => item.id === serverId)
    if (!server) return location
    const chassis = server.chassis ?? 'rack-basic'
    cleanup = Math.round(EQUIPMENT_CLEANUP_RATIO * CHIPS[server.chip].price)
    chipName = CHIPS[server.chip].name
    return {
      ...location,
      installedServers: (location.installedServers ?? []).filter((item) => item.id !== serverId),
      rigs: [...(location.rigs ?? []), { id: `rig-${server.id}`, chassis, gridPosition: server.gridPosition! }].filter((rig) => rig.gridPosition !== null),
    }
  })
  if (cleanup === 0) return state
  const next: GameState = {
    ...state,
    [key]: locations,
    cash: state.cash - cleanup,
    totalExpenses: state.totalExpenses + cleanup,
  }
  return pushNotice(next, `${reason} Утилизация «${chipName}» — ${cleanup}. Стойка в ячейке осталась.`)
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
