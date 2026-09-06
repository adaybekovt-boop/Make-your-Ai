import { describe, expect, it } from 'vitest'
import { REPUTATION_MAX, REPUTATION_MIN } from './config'
import { createInitialGame } from './simulation'
import { adCostMultiplier, adEffectiveness, changeReputation, clampReputation } from './reputation'

describe('reputation scale', () => {
  it('clamps to 0..100', () => {
    expect(clampReputation(-10)).toBe(REPUTATION_MIN)
    expect(clampReputation(50)).toBe(50)
    expect(clampReputation(150)).toBe(REPUTATION_MAX)
  })

  it('events stack within the scale', () => {
    let game = { ...createInitialGame(), reputation: 20 }
    game = changeReputation(game, -30)
    expect(game.reputation).toBe(0)
    game = changeReputation(game, 15)
    expect(game.reputation).toBe(15)
  })
})

describe('reputation drives advertising', () => {
  it('effectiveness grows linearly: 0.5x at zero, 1.5x at 100', () => {
    const base = createInitialGame()
    expect(adEffectiveness({ ...base, reputation: 0 })).toBeCloseTo(0.5)
    expect(adEffectiveness({ ...base, reputation: 50 })).toBeCloseTo(1.0)
    expect(adEffectiveness({ ...base, reputation: 100 })).toBeCloseTo(1.5)
  })

  it('cost falls linearly: 2x at zero, 1x at 100', () => {
    const base = createInitialGame()
    expect(adCostMultiplier({ ...base, reputation: 0 })).toBeCloseTo(2.0)
    expect(adCostMultiplier({ ...base, reputation: 50 })).toBeCloseTo(1.5)
    expect(adCostMultiplier({ ...base, reputation: 100 })).toBeCloseTo(1.0)
  })
})
