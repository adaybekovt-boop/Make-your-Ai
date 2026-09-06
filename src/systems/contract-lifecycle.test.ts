import { describe, expect, it } from 'vitest'
import { acceptContract, activeContractLabel, closeCompletedContract, maybeGenerateOffer } from './contracts'
import { CONTRACT_BREACH_REPUTATION, CONTRACT_FULFILLED_REPUTATION } from './config'
import { buyDataLot, startTraining, tickTraining } from './training'
import { togglePreparing } from './benchmark'
import { processDailySystems } from './daily'
import { createInitialGame, advanceSimulation } from './simulation'
import { decodeSave, makeSaveEnvelope } from '../persistence/saves'
import type { ActionResult, ContractKind, DataQuality, GameState } from './types'

const safe = () => .99
const unwrap = (action: ActionResult): GameState => {
  if (!action.ok) throw new Error(action.error)
  return action.state
}
const onDay = (state: GameState, day: number): GameState => ({ ...state, elapsedGameHours: (day - 1) * 24 - 8 })
function accepted(kind: ContractKind = 'official') {
  let state = createInitialGame()
  state.cash = 500_000 // Fixture for isolated lifecycle tests, NOT balance measurement.
  state.model.tech = ['context']
  state.contracts.nextOfferDay = 1
  state = maybeGenerateOffer(state, () => .01)
  return unwrap(acceptContract(state, kind))
}
function batch(state: GameState, quality: DataQuality = 'official') {
  return tickTraining(unwrap(startTraining(unwrap(buyDataLot(state, quality)))), 1, 50, safe)
}

// Sequential calls deliberately reuse the same active contract.
describe('issue #3: one-shot training obligation', () => {
  it.each(['official', 'unofficial'] as const)('does not re-award or re-evaluate a successful obligation after %s data', quality => {
    const state = accepted(), copy = structuredClone(state)
    const first = batch(state), second = batch(first, quality)
    expect(first.reputation).toBe(state.reputation + CONTRACT_FULFILLED_REPUTATION)
    expect(second.reputation).toBe(first.reputation)
    expect(second.contracts.active?.fulfilled).toBe(true)
    expect(second.totalRevenue).toBe(state.totalRevenue)
    expect(second.pendingNotices.filter(text => text.startsWith('Обязательство перед'))).toHaveLength(1)
    expect(state).toEqual(copy)
  })
  it.each(['official', 'unofficial'] as const)('does not undo or re-charge a failed obligation after %s data', quality => {
    const state = accepted(), first = batch(state, 'unofficial'), second = batch(first, quality)
    expect(first.reputation).toBe(state.reputation - CONTRACT_BREACH_REPUTATION)
    expect(second.reputation).toBe(first.reputation)
    expect(second.contracts.active?.fulfilled).toBe(false)
    expect(second.totalRevenue).toBe(state.totalRevenue)
    expect(second.pendingNotices.filter(text => text.includes('нарушен: обучение'))).toHaveLength(1)
  })
  it('preserves a saved completed result without a retroactive reputation/cash adjustment', () => {
    const state = batch(accepted())
    const restored = decodeSave(makeSaveEnvelope(state)).game
    expect(restored.reputation).toBe(state.reputation)
    expect(restored.cash).toBe(state.cash)
    expect(batch(restored).reputation).toBe(state.reputation)
  })
})

describe('issue #3: release the contract slot, not the time restrictions', () => {
  it.each(['official', 'unofficial'] as const)('keeps no-cheat restrictions through the last day after %s training', quality => {
    const state = batch(accepted(), quality)
    const lastDay = state.contracts.active!.noCheatUntilDay!
    const last = onDay(state, lastDay)
    expect(closeCompletedContract(last)).toBe(last)
    expect(togglePreparing(last).ok).toBe(false)
    expect(activeContractLabel(last)).toContain(`до конца дня ${lastDay}`)
    const nextDay = onDay(state, lastDay + 1)
    const closed = closeCompletedContract(nextDay)
    expect(closed.contracts.active).toBeNull()
    expect(togglePreparing(closed).ok).toBe(true)
    expect(closed.cash).toBe(nextDay.cash)
    expect(closed.totalRevenue).toBe(nextDay.totalRevenue)
    expect(closed.reputation).toBe(nextDay.reputation)
    expect(closeCompletedContract(closed)).toBe(closed)
  })
  it('does not erase an outstanding data obligation when the no-cheat timer ends', () => {
    const state = accepted()
    const late = onDay(state, state.contracts.active!.noCheatUntilDay! + 1)
    expect(closeCompletedContract(late)).toBe(late)
    const trained = batch(late)
    expect(closeCompletedContract(trained).contracts.active).toBeNull()
  })
  it('closes grey contracts after their inclusive calendar window without shortening the risk timer', () => {
    const state = accepted('grey'), lastDay = state.contracts.active!.dirtyUntilDay!
    const last = onDay(state, lastDay)
    expect(closeCompletedContract(last)).toBe(last)
    const late = onDay(state, lastDay + 1), closed = closeCompletedContract(late)
    expect(closed.contracts.active).toBeNull()
    expect(closed.market.dirtyRiskUntil).toBe(state.market.dirtyRiskUntil)
    const extended = { ...late, market: { ...late.market, dirtyRiskUntil: late.elapsedGameHours + 10 } }
    expect(closeCompletedContract(extended)).toBe(extended)
  })
  it('closes a no-obligation enterprise contract at the next daily hook, without a second payout', () => {
    const state = accepted('enterprise')
    const closed = processDailySystems(onDay(state, 2), safe)
    expect(closed.contracts.active).toBeNull()
    expect(closed.cash).toBe(state.cash)
    expect(closed.totalRevenue).toBe(state.totalRevenue)
    expect(closed.contracts.pending).toBeNull() // nextOfferDay has not arrived.
  })
  it('produces exactly one new scheduled offer after closure; accepting it pays once', () => {
    const state = batch(accepted())
    const late = onDay(state, state.contracts.active!.noCheatUntilDay! + 1)
    const offered = processDailySystems(late, safe)
    expect(offered.contracts.active).toBeNull()
    expect(offered.contracts.pending?.id).toBe(state.contracts.seq + 1)
    expect(maybeGenerateOffer(offered, safe)).toBe(offered)
    expect(offered.totalRevenue).toBe(state.totalRevenue)
    const payout = offered.contracts.pending!.officialPayout
    const next = unwrap(acceptContract(offered, 'official'))
    expect(next.totalRevenue).toBe(state.totalRevenue + payout)
    expect(acceptContract(next, 'official').ok).toBe(false)
    expect(batch(next).reputation).toBe(next.reputation + CONTRACT_FULFILLED_REPUTATION)
  })
  it('respects the existing offer schedule even when an old contract has already closed', () => {
    const state = accepted('enterprise')
    const closed = closeCompletedContract(state)
    expect(maybeGenerateOffer(closed, safe)).toBe(closed)
    const due = onDay(closed, closed.contracts.nextOfferDay)
    expect(maybeGenerateOffer(due, safe).contracts.pending).not.toBeNull()
  })
  it('has identical closure and notices across a large tick and hourly ticks, including restored saves', () => {
    const state = decodeSave(makeSaveEnvelope(batch(accepted()))).game
    const large = advanceSimulation(state, 400 * 60, safe)
    let small = state
    for (let hour = 0; hour < 400; hour++) small = advanceSimulation(small, 60, safe)
    expect(small.contracts).toEqual(large.contracts)
    expect(small.pendingNotices).toEqual(large.pendingNotices)
    expect(large.contracts.active).toBeNull()
    expect(large.pendingNotices.filter(text => text.includes('закрыт. Компания'))).toHaveLength(1)
  })
  it('does not overwrite an active obligation or pay for an expired offer', () => {
    const offered = maybeGenerateOffer({ ...createInitialGame(), contracts: { ...createInitialGame().contracts, nextOfferDay: 1 } }, safe)
    const active = accepted()
    const both = { ...active, contracts: { ...active.contracts, pending: offered.contracts.pending } }
    expect(acceptContract(both, 'official').ok).toBe(false)
    expect(acceptContract(onDay(offered, offered.contracts.pending!.expiresDay + 1), 'official').ok).toBe(false)
  })
})
