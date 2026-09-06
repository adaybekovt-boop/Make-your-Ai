import { expect, it, vi } from 'vitest'
import { rareCarArrival } from './rareTraffic'
import { advanceSimulation, createInitialGame } from './simulation'
import { decodeSave, makeSaveEnvelope } from '../persistence/saves'
it('persists a successful arrival without rerolling after reload and obeys pause and speed', () => {
  const initial = { ...createInitialGame(), elapsedGameHours: 5.99 }
  expect(advanceSimulation({ ...initial, paused: true }, 60, () => 0).rareCarUntil).toBeUndefined()
  const arrived = advanceSimulation({ ...initial, speed: 3 as const }, 1, () => 0)
  expect(arrived.rareCarUntil).toBe(7)
  const restored = decodeSave(makeSaveEnvelope(arrived)).game
  expect(restored.rareCarUntil).toBe(7)
  expect(advanceSimulation(restored, 1, () => .99).rareCarUntil).toBe(7)
  expect(decodeSave(makeSaveEnvelope(createInitialGame())).game.rareCarUntil).toBeUndefined()
})
it('rolls only on six game-hour boundaries with a strict ten percent threshold', () => {
  const random = vi.fn(() => .099)
  expect(rareCarArrival(0, 5.99, random)).toBeUndefined()
  expect(random).not.toHaveBeenCalled()
  expect(rareCarArrival(5.99, 6, random)).toBe(7)
  expect(random).toHaveBeenCalledTimes(1)
  expect(rareCarArrival(6, 6.1, random)).toBeUndefined()
  expect(rareCarArrival(6, 12, () => .1)).toBeUndefined()
})
it('checks every crossed boundary and expires earlier appearances', () => {
  const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(.5).mockReturnValueOnce(0)
  expect(rareCarArrival(0, 18.5, random)).toBe(19)
  expect(random).toHaveBeenCalledTimes(3)
  expect(rareCarArrival(0, 9, () => 0)).toBeLessThan(9)
})
