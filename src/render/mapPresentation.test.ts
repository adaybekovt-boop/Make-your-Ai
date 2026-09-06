import { describe, expect, it } from 'vitest'
import { placeCard, visibleSlots } from './mapPresentation'

describe('object-anchored card layout', () => {
  it('keeps the card near the building, not a fixed screen column', () => {
    const viewport = { width: 1440, height: 828 }
    const size = { width: 272, height: 310 }
    const first = placeCard({ x: 200, y: 350 }, size, viewport)
    const second = placeCard({ x: 600, y: 350 }, size, viewport)
    expect(second.x - first.x).toBe(400)
    expect(second.y).toBe(first.y)
  })

  it('flips and clamps the card at viewport edges', () => {
    const viewport = { width: 390, height: 748 }
    const size = { width: 244, height: 320 }
    for (const x of [5, 195, 385]) for (const y of [5, 350, 740]) {
      const result = placeCard({ x, y }, size, viewport)
      expect(result.x).toBeGreaterThanOrEqual(12)
      expect(result.y).toBeGreaterThanOrEqual(12)
      expect(result.x + size.width).toBeLessThanOrEqual(viewport.width - 12)
      expect(result.y + size.height).toBeLessThanOrEqual(viewport.height - 12)
    }
  })

  it('prefers the side without another building', () => {
    const point = placeCard({ x: 500, y: 400 }, { width: 272, height: 300 }, { width: 1200, height: 800 }, [{ x: 570, y: 240, width: 310, height: 340 }])
    expect(point.x).toBeLessThan(500)
  })
})

describe('roof slot presentation without changing company data', () => {
  it('shows the next empty slot at the index a count-based store will install', () => {
    expect(visibleSlots(0, 100, 0).slots).toEqual([{ index: 0, occupied: false }])
    expect(visibleSlots(2, 100, 0).slots).toEqual([
      { index: 0, occupied: true }, { index: 1, occupied: true }, { index: 2, occupied: false },
    ])
  })
  it('paginates existing large saves and still allows reaching the next slot', () => {
    const result = visibleSlots(99, 100, 16)
    expect(result.pages).toBe(17)
    expect(result.slots).toHaveLength(4)
    expect(result.slots[3]).toEqual({ index: 99, occupied: false })
  })
  it('never offers extra capacity beyond the existing technical limit', () => {
    expect(visibleSlots(100, 100, 16).slots.every((slot) => slot.occupied)).toBe(true)
  })
  it('clamps a page after sale or loading a smaller company', () => {
    expect(visibleSlots(1, 100, 16).page).toBe(0)
  })
})
