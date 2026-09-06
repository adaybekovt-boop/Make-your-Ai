import { CHASSIS, CHIPS, getLocationDefinition, getRegionLocationDefinition } from './config'
import type { AnyLocationId, ChipId, GridPosition, GridSize, InstalledServer, LocationState } from './types'

export const GRID_SIZES: Record<AnyLocationId, GridSize> = {
  garage: { rows: 3, cols: 3 }, workshop: { rows: 4, cols: 4 },
  technopark: { rows: 5, cols: 5 }, 'server-hall': { rows: 6, cols: 6 },
  campus: { rows: 8, cols: 8 }, 'overseas-west': { rows: 6, cols: 6 }, 'overseas-east': { rows: 8, cols: 8 },
}
export const MIN_OVERCLOCK = .5
export const MAX_OVERCLOCK = 1.5

export function gridSizeFor(id: AnyLocationId): GridSize { return { ...GRID_SIZES[id] } }
export function locationDefinition(id: AnyLocationId) {
  return id === 'overseas-west' || id === 'overseas-east' ? getRegionLocationDefinition(id).location : getLocationDefinition(id)
}
export function sameCell(a: GridPosition | null, b: GridPosition | null) { return a !== null && b !== null && a.row === b.row && a.col === b.col }
export function isGridPosition(position: GridPosition, size: GridSize) {
  return Number.isInteger(position.row) && Number.isInteger(position.col) && position.row >= 0 && position.col >= 0 && position.row < size.rows && position.col < size.cols
}

export function normalizeLocation(location: LocationState): LocationState & { gridSize: GridSize; installedServers: InstalledServer[]; serverSeq: number } {
  const gridSize = gridSizeFor(location.id)
  if (location.installedServers) return { ...location, gridSize, installedServers: location.installedServers, serverSeq: location.serverSeq ?? location.installedServers.length }
  const chips: ChipId[] = [...Array<ChipId>(location.servers).fill('consumer-gpu'), ...(location.racks ?? []).flatMap((rack) => Array<ChipId>(rack.count).fill(rack.chip))]
  const capacity = gridSize.rows * gridSize.cols
  const installedServers = chips.map((chip, index): InstalledServer => ({
    id: `server-${index + 1}`, chip, chassis: 'rack-basic', overclock: 1,
    gridPosition: index < capacity ? { row: Math.floor(index / gridSize.cols), col: index % gridSize.cols } : null,
  }))
  return { ...location, gridSize, installedServers, serverSeq: chips.length }
}

export function withInstalledServers(location: LocationState, installedServers: InstalledServer[], serverSeq = normalizeLocation(location).serverSeq): LocationState {
  const racks = (['pro-gpu', 'accelerator'] as const).map((chip) => ({ chip, count: installedServers.filter((server) => server.chip === chip).length })).filter((rack) => rack.count > 0)
  return { ...location, gridSize: gridSizeFor(location.id), installedServers, serverSeq, servers: installedServers.filter((server) => server.chip === 'consumer-gpu').length, racks }
}

export function firstFreeCell(location: LocationState): GridPosition | null {
  const current = normalizeLocation(location)
  for (let row = 0; row < current.gridSize.rows; row++) for (let col = 0; col < current.gridSize.cols; col++) {
    const position = { row, col }
    if (!current.installedServers.some((server) => sameCell(server.gridPosition, position))) return position
  }
  return null
}

export function serverOutput(server: Pick<InstalledServer, 'chip' | 'overclock'> & { chassis?: InstalledServer['chassis'] }) {
  const chip = CHIPS[server.chip]
  const computeMult = server.chassis === 'rack-enterprise' ? CHASSIS['rack-enterprise'].computeMult : 1
  return { powerKw: chip.powerKw * server.overclock ** 2, compute: chip.compute * server.overclock * computeMult, maintenancePerHour: chip.maintenancePerHour }
}

export function locationEquipment(location: LocationState) {
  if (!location.installedServers) {
    const racks = [{ chip: 'consumer-gpu' as const, count: location.servers }, ...(location.racks ?? [])]
    return racks.reduce((sum, rack) => ({
      demandKw: sum.demandKw + rack.count * CHIPS[rack.chip].powerKw,
      compute: sum.compute + rack.count * CHIPS[rack.chip].compute,
      maintenancePerHour: sum.maintenancePerHour + rack.count * CHIPS[rack.chip].maintenancePerHour,
      activeCount: sum.activeCount + rack.count,
    }), { demandKw: 0, compute: 0, maintenancePerHour: 0, activeCount: 0 })
  }
  return location.installedServers.reduce((sum, server) => {
    if (!server.gridPosition) return sum
    const output = serverOutput(server)
    return { demandKw: sum.demandKw + output.powerKw, compute: sum.compute + output.compute, maintenancePerHour: sum.maintenancePerHour + output.maintenancePerHour, activeCount: sum.activeCount + 1 }
  }, { demandKw: 0, compute: 0, maintenancePerHour: 0, activeCount: 0 })
}

export function placementError(location: LocationState, chip: ChipId, position: GridPosition, overclock = 1): string | null {
  const current = normalizeLocation(location)
  if (!location.owned) return 'Сначала приобретите локацию.'
  if (!isGridPosition(position, current.gridSize)) return 'Эта ячейка находится за пределами помещения.'
  if (current.installedServers.filter((server) => server.gridPosition).length >= current.gridSize.rows * current.gridSize.cols) return 'Все ячейки заняты. В помещении нет свободного места.'
  if (current.installedServers.some((server) => sameCell(server.gridPosition, position))) return 'Эта ячейка уже занята сервером.'
  const demand = locationEquipment(current).demandKw + serverOutput({ chip, overclock }).powerKw
  if (demand > locationDefinition(location.id).powerLimitKw + 1e-8) return 'Недостаточно мощности энергосети. Снизьте разгон других серверов или выберите другую площадку.'
  return null
}
