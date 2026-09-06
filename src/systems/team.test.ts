import { describe, expect, it } from 'vitest'
import {
  HIRE_COST,
  MAX_EMPLOYEES,
  OVERWORK_MORALE_DRAIN_PER_DAY,
  MORALE_RECOVER_PER_DAY,
  SALARY_PER_HOUR,
} from './config'
import { createInitialGame } from './simulation'
import {
  dailyMoraleStep,
  fireEmployee,
  hireEmployee,
  loseRandomEmployee,
  salariesPerHour,
  safetyLevel,
  toggleOverwork,
} from './team'
import type { ActionResult, GameState, Rng } from './types'

const rich = (): GameState => ({ ...createInitialGame(), cash: 1_000_000 })

function result(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

const always: Rng = () => 0.01
const never: Rng = () => 0.99

function hireMany(game: GameState, role: 'safety' | 'engineer', count: number): GameState {
  let next = game
  for (let i = 0; i < count; i += 1) next = result(hireEmployee(next, role))
  return next
}

describe('hiring', () => {
  it('charges the role price and accrues the salary', () => {
    let game = result(hireEmployee(rich(), 'safety'))
    expect(game.cash).toBe(1_000_000 - HIRE_COST.safety)
    expect(game.team.employees).toHaveLength(1)
    expect(salariesPerHour(game)).toBe(SALARY_PER_HOUR.safety)

    game = result(hireEmployee(game, 'engineer'))
    expect(salariesPerHour(game)).toBe(SALARY_PER_HOUR.safety + SALARY_PER_HOUR.engineer)
  })

  it('respects the headcount cap and firing', () => {
    let game = hireMany(rich(), 'engineer', MAX_EMPLOYEES)
    expect(hireEmployee(game, 'engineer').ok).toBe(false)
    const first = game.team.employees[0]
    game = result(fireEmployee(game, first.id))
    expect(game.team.employees.some((employee) => employee.id === first.id)).toBe(false)
  })

  it('counts safety engineers for the safety level', () => {
    const game = hireMany(hireMany(rich(), 'safety', 2), 'engineer', 3)
    expect(safetyLevel(game)).toBe(2)
  })
})

describe('overtime and morale', () => {
  it('refuses overtime with an empty office', () => {
    expect(toggleOverwork(createInitialGame()).ok).toBe(false)
  })

  it('recovers on a normal schedule and drains under overtime', () => {
    let game = hireMany(rich(), 'engineer', 1)
    game = { ...game, team: { ...game.team, morale: 50 } }
    expect(dailyMoraleStep(game, never).team.morale).toBe(50 + MORALE_RECOVER_PER_DAY)
    const overtime = result(toggleOverwork(game))
    expect(dailyMoraleStep(overtime, never).team.morale).toBe(50 - OVERWORK_MORALE_DRAIN_PER_DAY)
  })

  it('clamps morale at the bounds', () => {
    let game = hireMany(rich(), 'engineer', 1)
    game = { ...game, team: { ...game.team, morale: 2, overwork: true } }
    game = dailyMoraleStep(game, never)
    expect(game.team.morale).toBe(0)
  })

  it('exhausted staff quits with the daily chance', () => {
    let game = hireMany(rich(), 'engineer', 2)
    game = { ...game, team: { ...game.team, morale: 20, overwork: true } }
    const after = dailyMoraleStep(game, always)
    expect(after.team.employees.length).toBe(1)
  })

  it('a raid takes one employee, not the whole team', () => {
    const game = hireMany(rich(), 'engineer', 3)
    const after = loseRandomEmployee(game, always, 'Рейд конкурента на команду.')
    expect(after.team.employees.length).toBe(2)
  })
})
