import { describe, expect, it } from 'vitest'
import {
  CONTRACT_DIRTY_DAYS,
  CONTRACT_ENTERPRISE_PAYOUT,
  CONTRACT_GREY_MULTIPLIER,
  CONTRACT_NO_CHEAT_DAYS,
  CONTRACT_OFFICIAL_PAYOUT,
} from './config'
import { createInitialGame } from './simulation'
import { acceptContract, clearExpiredOffer, declineContract, maybeGenerateOffer } from './contracts'
import type { ActionResult, GameState, Rng } from './types'

const base = (): GameState => createInitialGame()

const always: Rng = () => 0.01

function acceptOk(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

function dueOffer(game: GameState): GameState {
  return { ...game, contracts: { ...game.contracts, nextOfferDay: 1 } }
}

describe('contract offers', () => {
  it('appear on the scheduled day and schedule the next one 3–7 days out', () => {
    let game = dueOffer(base())
    const before = game.contracts.nextOfferDay
    game = maybeGenerateOffer(game, always)
    expect(game.contracts.pending).not.toBeNull()
    const delta = game.contracts.nextOfferDay - before
    expect(delta).toBeGreaterThanOrEqual(3)
    expect(delta).toBeLessThanOrEqual(7)
  })

  it('do not appear early or stack on top of a pending offer', () => {
    let game = maybeGenerateOffer(base(), always)
    expect(game.contracts.pending).toBeNull()
    game = dueOffer(game)
    game = maybeGenerateOffer(game, always)
    const pending = game.contracts.pending
    game = maybeGenerateOffer(dueOffer(game), always)
    expect(game.contracts.pending).toBe(pending)
  })

  it('an offer carries both variants: grey pays 1.8x the official rate', () => {
    const game = maybeGenerateOffer(dueOffer(base()), always)
    expect(game.contracts.pending?.officialPayout).toBe(CONTRACT_OFFICIAL_PAYOUT)
    expect(game.contracts.pending?.greyPayout).toBe(Math.round(CONTRACT_OFFICIAL_PAYOUT * CONTRACT_GREY_MULTIPLIER))
  })

  it('the official variant closes for a low-reputation company', () => {
    let game = maybeGenerateOffer(dueOffer({ ...base(), reputation: 0 }), always)
    expect(acceptContract(game, 'official').ok).toBe(false)
    game = acceptOk(acceptContract(game, 'grey'))
    expect(game.contracts.active?.payout).toBe(Math.round(CONTRACT_OFFICIAL_PAYOUT * CONTRACT_GREY_MULTIPLIER))
  })

  it('enterprise contracts require the context technology', () => {
    let game = maybeGenerateOffer(dueOffer(base()), always)
    expect(acceptContract(game, 'enterprise').ok).toBe(false)

    game = maybeGenerateOffer(dueOffer({ ...base(), model: { ...base().model, tech: ['context'] } }), always)
    game = acceptOk(acceptContract(game, 'enterprise'))
    expect(game.contracts.active?.payout).toBe(CONTRACT_ENTERPRISE_PAYOUT)
  })

  it('expire without an answer', () => {
    let game = dueOffer(base())
    game = maybeGenerateOffer(game, always)
    game = { ...game, elapsedGameHours: (game.contracts.pending!.expiresDay) * 24 + 20 }
    game = clearExpiredOffer(game)
    expect(game.contracts.pending).toBeNull()
    expect(game.pendingNotices.some((notice) => notice.includes('истекло'))).toBe(true)
  })
})

describe('accepting contracts', () => {
  it('official contracts pay out, demand official data and block cheating for 10 days', () => {
    let game = maybeGenerateOffer(dueOffer({ ...base(), reputation: 80 }), always)
    const payout = game.contracts.pending!.officialPayout
    game = acceptOk(acceptContract(game, 'official'))
    expect(game.cash).toBe(12_000 + payout)
    expect(game.contracts.active?.requiresOfficialData).toBe(true)
    expect(game.contracts.active?.noCheatUntilDay).toBe(gameDayOf(game) + CONTRACT_NO_CHEAT_DAYS)
    expect(game.contracts.pending).toBeNull()
  })

  it('grey contracts raise the dirty-event pressure for 5 days', () => {
    let game = maybeGenerateOffer(dueOffer(base()), always)
    game = acceptOk(acceptContract(game, 'grey'))
    expect(game.contracts.active?.dirtyUntilDay).toBe(gameDayOf(game) + CONTRACT_DIRTY_DAYS)
    expect(game.market.dirtyRiskUntil).not.toBeNull()
  })

  it('can be declined cleanly', () => {
    let game = maybeGenerateOffer(dueOffer(base()), always)
    game = declineContract(game)
    expect(game.contracts.pending).toBeNull()
  })
})

function gameDayOf(game: GameState): number {
  return Math.floor((game.elapsedGameHours + 8) / 24) + 1
}
