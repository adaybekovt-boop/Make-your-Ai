import { CHIPS } from './config'
import { purchasesRestricted } from './market'
import { locationDefinition, locationEquipment, MAX_OVERCLOCK, MIN_OVERCLOCK, normalizeLocation, placementError, sameCell, withInstalledServers } from './serverGrid'
import type { ActionResult, AnyLocationId, GameState, GridPosition, LocationState } from './types'

function find(state: GameState, id: AnyLocationId) { return [...state.locations, ...state.regionLocations].find((location) => location.id === id) }
function update(state: GameState, location: LocationState): GameState {
  const key = state.locations.some((item) => item.id === location.id) ? 'locations' : 'regionLocations'
  return { ...state, [key]: state[key].map((item) => item.id === location.id ? location : item) }
}
function blocked(state: GameState) {
  if (state.ending) return 'Компания уже продана.'
  if (purchasesRestricted(state)) return 'Совет директоров ограничил крупные траты. Дождитесь окончания срока.'
  return null
}

export function sellServerById(state: GameState, id: AnyLocationId, serverId: string): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  const found = find(state, id)
  if (!found?.owned) return { ok: false, error: 'Локация не принадлежит компании.' }
  const location = normalizeLocation(found)
  const server = location.installedServers.find((item) => item.id === serverId)
  if (!server) return { ok: false, error: 'Сервер уже отсутствует в помещении.' }
  const chip = CHIPS[server.chip]
  const refund = Math.round(chip.price * chip.resaleRatio)
  const keptRigs = (location.rigs ?? []).filter((item) => !sameCell(item.gridPosition, server.gridPosition))
  const rig = server.gridPosition ? [{ id: `rig-${server.id}`, chassis: server.chassis ?? 'rack-basic', gridPosition: { ...server.gridPosition } }] : []
  const nextLocation = { ...withInstalledServers(location, location.installedServers.filter((item) => item.id !== serverId)), rigs: [...keptRigs, ...rig] }
  return { ok: true, state: { ...update(state, nextLocation), cash: state.cash + refund, totalCapex: state.totalCapex - refund } }
}

export function setServerOverclock(state: GameState, id: AnyLocationId, serverId: string, value: number): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (!Number.isFinite(value) || value < MIN_OVERCLOCK || value > MAX_OVERCLOCK) return { ok: false, error: 'Мощность можно задать от 50 до 150%.' }
  const found = find(state, id)
  if (!found?.owned) return { ok: false, error: 'Локация не принадлежит компании.' }
  const location = normalizeLocation(found)
  if (!location.installedServers.some((server) => server.id === serverId)) return { ok: false, error: 'Сервер не найден.' }
  const overclock = Math.round(value * 100) / 100
  const next = withInstalledServers(location, location.installedServers.map((server) => server.id === serverId ? { ...server, overclock } : server))
  const demand = locationEquipment(next).demandKw
  return { ok: true, state: { ...update(state, next), milestones: { ...state.milestones, experiencedThrottle: state.milestones.experiencedThrottle || demand > locationDefinition(id).powerLimitKw } } }
}

export function deployReserveServer(state: GameState, id: AnyLocationId, serverId: string, position: GridPosition): ActionResult {
  const restriction = blocked(state)
  if (restriction) return { ok: false, error: restriction }
  const found = find(state, id)
  if (!found) return { ok: false, error: 'Неизвестная локация.' }
  const location = normalizeLocation(found)
  const server = location.installedServers.find((item) => item.id === serverId && item.gridPosition === null)
  if (!server) return { ok: false, error: 'Этот сервер отсутствует в резерве.' }
  const error = placementError(location, server.chip, position, server.overclock)
  if (error) return { ok: false, error }
  return { ok: true, state: update(state, withInstalledServers(location, location.installedServers.map((item) => item.id === serverId ? { ...item, gridPosition: { ...position } } : item))) }
}
