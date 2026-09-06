import { describe, expect, it } from 'vitest'
import {
  COMPETITOR_ADS_PRESSURE,
  COMPETITOR_BASE_GROWTH,
  COMPETITOR_COMPOUND,
  COMPETITOR_GMI_DRAG,
  COMPETITOR_LOW_PRICE_PRESSURE,
  COMPETITOR_REPUTATION_DRAG,
  ESPIONAGE_COST,
} from './config'
import { createInitialGame } from './simulation'
import {
  attemptEspionage,
  competitorGrowth,
  dailyAmbientGmi,
  dailyCompetitorStep,
  competitorRevealed,
} from './competitor'
import type { ActionResult, GameState, Rng } from './types'

const rich = (): GameState => ({ ...createInitialGame(), cash: 1_000_000 })

function result(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

const flat: Rng = () => 0.5

describe('the rival curve', () => {
  it('grows by base plus its own compound interest', () => {
    const game = createInitialGame()
    const growth = competitorGrowth(game, flat)
    expect(growth).toBeCloseTo((COMPETITOR_BASE_GROWTH + game.competitor.score * COMPETITOR_COMPOUND) * (0.8 + 0.5 * 0.4))
  })

  it('speeds up when the player dumps the token price', () => {
    const game: GameState = { ...createInitialGame(), market: { ...createInitialGame().market, tokenPrice: 50 } }
    const cheap = competitorGrowth(game, flat)
    const normal = competitorGrowth(createInitialGame(), flat)
    expect(cheap).toBeCloseTo(normal * (1 + COMPETITOR_LOW_PRICE_PRESSURE))
  })

  it('speeds up while the player advertises, drags back on a high GMI and reputation', () => {
    const advertising: GameState = { ...createInitialGame(), market: { ...createInitialGame().market, advertising: true } }
    expect(competitorGrowth(advertising, flat)).toBeCloseTo(
      competitorGrowth(createInitialGame(), flat) * (1 + COMPETITOR_ADS_PRESSURE),
    )

    const praised: GameState = {
      ...createInitialGame(),
      reputation: 80,
      benchmark: { ...createInitialGame().benchmark, last: { reasoning: 90, coding: 90, safety: 90, multimodal: 90, total: 90, cheated: false, exposed: false, day: 1 } },
    }
    const dragged = competitorGrowth(praised, flat)
    const plain = competitorGrowth(createInitialGame(), flat)
    expect(dragged).toBeCloseTo(plain * (1 - COMPETITOR_GMI_DRAG) * (1 - COMPETITOR_REPUTATION_DRAG))
  })

  it('appends a sample per day and keeps the buffer bounded', () => {
    let game = createInitialGame()
    for (let i = 0; i < 70; i += 1) game = dailyCompetitorStep(game, flat)
    expect(game.competitor.samples.length).toBeLessThanOrEqual(60)
    expect(game.competitor.score).toBeGreaterThan(10)
  })
})

describe('espionage', () => {
  it('a success reveals the rival numbers for 48 hours', () => {
    const game = result(attemptEspionage({ ...rich(), reputation: 50 }, () => 0.1))
    expect(game.cash).toBe(1_000_000 - ESPIONAGE_COST)
    expect(competitorRevealed(game)).toBe(true)
    expect(game.reputation).toBe(50)
  })

  it('a failure costs reputation harder than staying home', () => {
    const game = result(attemptEspionage({ ...rich(), reputation: 50 }, () => 0.9))
    expect(competitorRevealed(game)).toBe(false)
    expect(game.reputation).toBe(50 - 6)
  })

  it('refuses to work without funds', () => {
    expect(attemptEspionage(createInitialGame(), flat).ok).toBe(false)
  })
})

describe('ambient GMI summaries', () => {
  it('wait for the scheduled day', () => {
    const game = dailyAmbientGmi(createInitialGame(), flat)
    expect(game.competitor.samples.length).toBe(1)
  })

  it('a leading player gains the audience boost, a losing one loses it', () => {
    const ahead: GameState = {
      ...createInitialGame(),
      benchmark: { ...createInitialGame().benchmark, last: { reasoning: 90, coding: 90, safety: 90, multimodal: 90, total: 90, cheated: false, exposed: false, day: 1 } },
      competitor: { ...createInitialGame().competitor, nextAmbientDay: 1, score: 5 },
    }
    const win = dailyAmbientGmi(ahead, flat)
    expect(win.market.ambientBoostUntil).not.toBeNull()
    expect(win.reputation).toBe(52)

    const behind: GameState = {
      ...createInitialGame(),
      competitor: { ...createInitialGame().competitor, nextAmbientDay: 1, score: 500 },
    }
    const loss = dailyAmbientGmi(behind, flat)
    expect(loss.market.ambientPenaltyUntil).not.toBeNull()
    expect(loss.reputation).toBe(48)
  })
})
