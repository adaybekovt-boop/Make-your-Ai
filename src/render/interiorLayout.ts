import * as THREE from 'three'
import type { GridPosition, GridSize } from '../systems/types'
export const COLUMN_SPACING = 1.3
export const ROW_SPACING = 2.25
export const ELEVATION = 22 * Math.PI / 180
export function cellWorld(grid: GridSize, cell: GridPosition, y = 0) {
  return new THREE.Vector3((cell.col - (grid.cols - 1) / 2) * COLUMN_SPACING, y, (cell.row - (grid.rows - 1) / 2) * ROW_SPACING)
}
export function floorCell(grid: GridSize, point: THREE.Vector3): GridPosition | null {
  const col = Math.round(point.x / COLUMN_SPACING + (grid.cols - 1) / 2)
  const row = Math.round(point.z / ROW_SPACING + (grid.rows - 1) / 2)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
  const center = cellWorld(grid, { row, col })
  return Math.abs(point.x - center.x) <= .56 && Math.abs(point.z - center.z) <= .54 ? { row: row || 0, col: col || 0 } : null
}
