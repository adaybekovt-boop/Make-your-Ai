import { deliveredServer } from './testSupport'
import { setServerOverclock } from './placement'
import { describe, expect, it } from 'vitest'
import {
  COMPLAINT_DAILY_CHANCE,
  COMPLAINT_FINE,
  COURT_FINE,
  COURT_REPUTATION_HIT,
  DATA_LEAK_FINE,
  HALLUCINATION_REPUTATION_HIT,
  MALWARE_DOWNTIME_HOURS,
  PROMPT_INJECTION_COST,
  PROMPT_INJECTION_DAILY_CHANCE,
  PROMPT_INJECTION_DOWNTIME_HOURS,
  PROMPT_INJECTION_SAFETY_FACTOR,
  VIRAL_HOURS,
} from './config'
import { createInitialGame, buyLocation } from './simulation'
import {
  dailyComplaintRoll,
  dailyCourtRoll,
  dailyPromptInjectionRoll,
  dailyRandomEvent,
} from './events'
import type { ActionResult, GameState, Rng } from './types'

const rich = (): GameState => ({ ...createInitialGame(), cash: 1_000_000, reputation: 50 })

function result(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

const always: Rng = () => 0.01
const never: Rng = () => 0.99

/** First call passes the event gate (0.1 < 30%), the second picks the pool index. */
function gateThen(pick: number): Rng {
  let first = true
  return () => {
    if (first) {
      first = false
      return 0.1
    }
    return pick
  }
}

describe('courts over illegal data', () => {
  it('only threaten a company that ever trained on dirty data', () => {
    const clean = dailyCourtRoll(rich(), always)
    expect(clean.cash).toBe(1_000_000)
    expect(clean.reputation).toBe(50)

    const dirty: GameState = { ...rich(), model: { ...rich().model, dirtyHistory: true } }
    const sued = dailyCourtRoll(dirty, always)
    expect(sued.cash).toBe(1_000_000 - COURT_FINE)
    expect(sued.reputation).toBe(50 - COURT_REPUTATION_HIT)
  })

  it('respect the daily chance', () => {
    const dirty: GameState = { ...rich(), model: { ...rich().model, dirtyHistory: true } }
    expect(dailyCourtRoll(dirty, never).cash).toBe(1_000_000)
  })
})

describe('neighbour complaints', () => {
  it('fire on an overloaded network, stay silent otherwise', () => {
    let game = result(deliveredServer(result(buyLocation(rich(), 'garage')), 'garage'))
    game = result(setServerOverclock(game, 'garage', 'server-1', 1.5))
    const complained = dailyComplaintRoll(game, always)
    expect(complained.cash).toBe(game.cash - COMPLAINT_FINE)

    const quiet = result(deliveredServer(result(buyLocation(rich(), 'garage')), 'garage'))
    expect(dailyComplaintRoll(quiet, always).cash).toBe(quiet.cash)
  })

  it('respect the daily chance', () => {
    const game = createInitialGame()
    void COMPLAINT_DAILY_CHANCE
    expect(dailyComplaintRoll(game, never).cash).toBe(game.cash)
  })
})

describe('prompt injection', () => {
  it('stops the model for a few hours and bills the cleanup', () => {
    const game: GameState = { ...rich(), model: { ...rich().model, iq: 40 } }
    const hit = dailyPromptInjectionRoll(game, always)
    expect(hit.model.offlineUntil).toBe(hit.elapsedGameHours + PROMPT_INJECTION_DOWNTIME_HOURS)
    expect(hit.cash).toBe(1_000_000 - PROMPT_INJECTION_COST)
    expect(hit.reputation).toBe(50 - 6)
  })

  it('each safety engineer cuts the odds', () => {
    const bare = dailyPromptInjectionRoll({ ...rich(), model: { ...rich().model, iq: 40 } }, () => 0.029)
    expect(bare.model.offlineUntil).not.toBeNull()

    const guardedState: GameState = {
      ...rich(),
      model: { ...rich().model, iq: 40 },
      team: { ...rich().team, employees: [{ id: 1, role: 'safety', salaryPerHour: 120, hiredDay: 1 }] },
    }
    // 0.03 * 0.6 = 0.018: a 0.029 roll fires without safety and misses with one.
    const guarded = dailyPromptInjectionRoll(guardedState, () => 0.029)
    expect(guarded.model.offlineUntil).toBeNull()
    expect(guarded.cash).toBe(1_000_000)
  })

  it('never fires before the model exists', () => {
    expect(dailyPromptInjectionRoll(rich(), always).model.offlineUntil).toBeNull()
  })

  it('uses the documented safety factor', () => {
    expect(PROMPT_INJECTION_SAFETY_FACTOR).toBe(0.6)
    void PROMPT_INJECTION_DAILY_CHANCE
  })
})

describe('the random event pool', () => {
  it('fire destroys one server and bills the cleanup', () => {
    let game = result(deliveredServer(result(buyLocation(rich(), 'garage')), 'garage'))
    const before = game.cash
    const after = dailyRandomEvent(game, gateThen(0.02)) // pool index 0 = fire
    expect(after.locations[0].servers).toBe(0)
    expect(after.cash).toBeLessThan(before)
  })

  it('viral traffic surges for a day or two', () => {
    const after = dailyRandomEvent(rich(), gateThen(0.25)) // index 1 = viral
    expect(after.market.viralUntil).toBe(after.elapsedGameHours + VIRAL_HOURS)
  })

  it('a hallucination scandal dents reputation but not cash', () => {
    const after = dailyRandomEvent(rich(), gateThen(0.5)) // index 2
    expect(after.reputation).toBe(50 - HALLUCINATION_REPUTATION_HIT)
    expect(after.cash).toBe(1_000_000)
  })

  it('a team raid takes one employee', () => {
    const withTeam: GameState = {
      ...rich(),
      team: { ...rich().team, employees: [{ id: 1, role: 'engineer', salaryPerHour: 90, hiredDay: 1 }] },
    }
    const after = dailyRandomEvent(withTeam, gateThen(0.7)) // index 3 = raid
    expect(after.team.employees).toHaveLength(0)
  })

  it('a data leak reuses the fine machinery and needs a dirty history', () => {
    const clean = dailyRandomEvent(rich(), gateThen(0.9)) // index 4 = leak -> falls back to scandal
    expect(clean.cash).toBe(1_000_000)

    const dirty: GameState = { ...rich(), model: { ...rich().model, dirtyHistory: true } }
    const leaked = dailyRandomEvent(dirty, gateThen(0.9))
    expect(leaked.cash).toBe(1_000_000 - DATA_LEAK_FINE)
  })

  it('most days nothing happens', () => {
    const game = dailyRandomEvent(rich(), never)
    expect(game.cash).toBe(1_000_000)
    expect(game.reputation).toBe(50)
  })
})

describe('infected model incidents are separate from injection', () => {
  it('malware downtime differs from prompt injection downtime', () => {
    expect(MALWARE_DOWNTIME_HOURS).not.toBe(PROMPT_INJECTION_DOWNTIME_HOURS)
  })
})
