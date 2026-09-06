import { CHASSIS, CHIPS } from '../systems/config'
import { gridSizeFor, isGridPosition, normalizeLocation, withInstalledServers } from '../systems/serverGrid'
import type { ChassisId, InstalledServer, LocationState } from '../systems/types'

export function validateGridData(source: Record<string, unknown>, location: LocationState): LocationState {
  if (source.installedServers === undefined) return location
  if (!Array.isArray(source.installedServers) || source.installedServers.length > 400) throw new Error('Некорректный список установленных серверов.')
  const size = gridSizeFor(location.id)
  if (source.gridSize !== undefined) {
    const grid = source.gridSize as Record<string, unknown> | null
    if (!grid || grid.rows !== size.rows || grid.cols !== size.cols) throw new Error('Размер сетки не соответствует локации.')
  }
  const ids = new Set<string>(), cells = new Set<string>()
  const installedServers: InstalledServer[] = source.installedServers.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Некорректный сервер.')
    const server = value as Record<string, unknown>
    if (typeof server.id !== 'string' || !/^server-[1-9]\d*$/.test(server.id) || ids.has(server.id)) throw new Error('Повторяющийся или некорректный номер сервера.')
    ids.add(server.id)
    if (typeof server.chip !== 'string' || !Object.hasOwn(CHIPS, server.chip)) throw new Error('Неизвестный чип сервера.')
    if (typeof server.overclock !== 'number' || !Number.isFinite(server.overclock) || server.overclock < .5 || server.overclock > 1.5) throw new Error('Некорректная частота сервера.')
    let gridPosition: InstalledServer['gridPosition'] = null
    if (server.gridPosition !== null) {
      const point = server.gridPosition as { row: number; col: number } | undefined
      if (!point || !isGridPosition(point, size)) throw new Error('Сервер расположен за пределами сетки.')
      const key = `${point.row}:${point.col}`
      if (cells.has(key)) throw new Error('Два сервера занимают одну ячейку.')
      cells.add(key)
      gridPosition = { row: point.row, col: point.col }
    }
    const chassis = server.chassis === undefined ? 'rack-basic' : server.chassis
    if (typeof chassis !== 'string' || !Object.hasOwn(CHASSIS, chassis)) throw new Error('Неизвестный тип стойки.')
    return { id: server.id, chip: server.chip as InstalledServer['chip'], chassis: chassis as ChassisId, overclock: server.overclock, gridPosition }
  })
  if (!location.owned && installedServers.length) throw new Error('Серверы находятся в неприобретённой локации.')
  const sequence = source.serverSeq
  const maximumId = Math.max(0, ...installedServers.map((server) => Number(server.id.slice(7))))
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < maximumId) throw new Error('Некорректный счётчик серверов.')
  let rigs: LocationState['rigs']
  if (source.rigs !== undefined) {
    if (!Array.isArray(source.rigs) || source.rigs.length > 400) throw new Error('Некорректный список стоек.')
    const rigCells = new Set<string>()
    rigs = source.rigs.map((value: unknown) => {
      const rig = value as Record<string, unknown>
      if (typeof rig.id !== 'string' || !rig.id) throw new Error('Некорректная стойка.')
      if (typeof rig.chassis !== 'string' || !Object.hasOwn(CHASSIS, rig.chassis)) throw new Error('Неизвестный тип стойки.')
      const point = rig.gridPosition as { row: number; col: number } | undefined
      if (!point || !isGridPosition(point, size)) throw new Error('Стойка за пределами сетки.')
      const key = `${point.row}:${point.col}`
      if (rigCells.has(key) || cells.has(key)) throw new Error('Два оборудования в одной ячейке.')
      rigCells.add(key)
      return { id: rig.id as string, chassis: rig.chassis as ChassisId, gridPosition: { row: point.row, col: point.col } }
    })
  }
  let inventory: LocationState['inventory']
  if (source.inventory !== undefined) {
    const raw = source.inventory as Record<string, unknown>
    const readCounts = (value: unknown, keys: string[]): Record<string, number> => {
      if (value === undefined || value === null) return {}
      if (typeof value !== 'object') throw new Error('Некорректный склад.')
      const result: Record<string, number> = {}
      for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
        if (!keys.includes(key) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 400) throw new Error('Некорректный склад.')
        result[key] = count
      }
      return result
    }
    inventory = {
      chips: readCounts(raw.chips, Object.keys(CHIPS)),
      chassis: readCounts(raw.chassis, Object.keys(CHASSIS)),
    }
  }
  const synced = withInstalledServers(location, installedServers, sequence)
  if (synced.servers !== location.servers) throw new Error('Счётчик серверов не совпадает с сеткой.')
  for (const chip of Object.keys(CHIPS)) {
    const oldCount = (location.racks ?? []).filter((rack) => rack.chip === chip).reduce((sum, rack) => sum + rack.count, 0)
    const newCount = (synced.racks ?? []).filter((rack) => rack.chip === chip).reduce((sum, rack) => sum + rack.count, 0)
    if (oldCount !== newCount) throw new Error('Стойки не совпадают с размещёнными серверами.')
  }
  return { ...synced, ...(rigs ? { rigs } : {}), ...(inventory ? { inventory } : {}) }
}

export function migrateGridLocations(locations: LocationState[]) {
  return locations.map((location) => withInstalledServers(normalizeLocation(location), normalizeLocation(location).installedServers))
}
