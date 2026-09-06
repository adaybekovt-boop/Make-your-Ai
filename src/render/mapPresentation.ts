import type { LocationId } from '../systems/types'
import type { CityObjectId } from '../systems/city'
export type MapObjectId = LocationId | CityObjectId

export interface ScreenPoint { x: number; y: number }
export interface ScreenRect extends ScreenPoint { width: number; height: number }
export interface BuildingProjection {
  id: MapObjectId
  roof: ScreenPoint
  label: ScreenPoint
  warning: ScreenPoint
  bounds: ScreenRect
  visible: boolean
}
export interface MapProjection {
  width: number
  height: number
  buildings: BuildingProjection[]
}
export interface MapSelection {
  id: MapObjectId
  kind: 'building' | 'server' | 'power'
  serverIndex?: number
}

export function placeCard(anchor: ScreenPoint, size: { width: number; height: number }, viewport: { width: number; height: number }, obstacles: ScreenRect[] = []): ScreenPoint {
  const pad = 12
  const gap = 98
  const clamp = (value: number, max: number) => Math.max(pad, Math.min(value, Math.max(pad, max)))
  const candidates = [
    { x: anchor.x + gap, y: anchor.y - size.height / 2 },
    { x: anchor.x - gap - size.width, y: anchor.y - size.height / 2 },
    { x: anchor.x - size.width / 2, y: anchor.y + gap },
    { x: anchor.x - size.width / 2, y: anchor.y - gap - size.height },
  ].map((point) => ({ x: clamp(point.x, viewport.width - size.width - pad), y: clamp(point.y, viewport.height - size.height - pad) }))
  const occupied = [{ x: anchor.x - 64, y: anchor.y - 62, width: 128, height: 140 }, ...obstacles]
  const score = (point: ScreenPoint) => occupied.reduce((sum, rect) => {
    const overlapX = Math.max(0, Math.min(point.x + size.width, rect.x + rect.width) - Math.max(point.x, rect.x))
    const overlapY = Math.max(0, Math.min(point.y + size.height, rect.y + rect.height) - Math.max(point.y, rect.y))
    return sum + overlapX * overlapY
  }, 0) + Math.hypot(point.x + size.width / 2 - anchor.x, point.y + size.height / 2 - anchor.y) * 0.05
  return candidates.reduce((best, point) => score(point) < score(best) ? point : best)
}

export const SLOTS_PER_PAGE = 6

export function visibleSlots(serverCount: number, limit: number, page: number) {
  const total = Math.min(limit, serverCount + 1)
  const pages = Math.ceil(total / SLOTS_PER_PAGE)
  const safePage = Math.min(Math.max(0, Math.floor(page)), pages - 1)
  const start = safePage * SLOTS_PER_PAGE
  return {
    page: safePage,
    pages,
    slots: Array.from({ length: Math.min(SLOTS_PER_PAGE, total - start) }, (_, index) => ({ index: start + index, occupied: start + index < serverCount })),
  }
}
