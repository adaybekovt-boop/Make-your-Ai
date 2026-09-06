import {
  HIRE_COST,
  LOW_MORALE_QUIT_CHANCE,
  LOW_MORALE_THRESHOLD,
  MAX_EMPLOYEES,
  MORALE_RECOVER_PER_DAY,
  OVERWORK_MORALE_DRAIN_PER_DAY,
  SALARY_PER_HOUR,
} from './config'
import { pushNotice } from './market'
import type { ActionResult, Employee, EmployeeRole, GameState, Rng } from './types'

export function hireEmployee(state: GameState, role: EmployeeRole): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (state.team.employees.length >= MAX_EMPLOYEES) return { ok: false, error: 'Офис не резиновый: достигнут лимит найма.' }
  const cost = HIRE_COST[role]
  if (state.cash < cost) return { ok: false, error: 'Недостаточно средств.' }
  const employee: Employee = {
    id: state.team.seq + 1,
    role,
    salaryPerHour: SALARY_PER_HOUR[role],
    hiredDay: Math.floor(state.elapsedGameHours / 24) + 1,
  }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - cost,
      team: {
        ...state.team,
        seq: employee.id,
        employees: [...state.team.employees, employee],
      },
    },
  }
}

export function fireEmployee(state: GameState, id: number): ActionResult {
  const employee = state.team.employees.find((item) => item.id === id)
  if (!employee) return { ok: false, error: 'Такого сотрудника нет в штате.' }
  return {
    ok: true,
    state: {
      ...state,
      team: { ...state.team, employees: state.team.employees.filter((item) => item.id !== id) },
    },
  }
}

export function salariesPerHour(state: GameState): number {
  return state.team.employees.reduce((sum, employee) => sum + employee.salaryPerHour, 0)
}

export function toggleOverwork(state: GameState): ActionResult {
  if (state.team.employees.length === 0) {
    return { ok: false, error: 'Переработки некому назначить: сначала наймите команду.' }
  }
  return {
    ok: true,
    state: { ...state, team: { ...state.team, overwork: !state.team.overwork } },
  }
}

export function safetyLevel(state: GameState): number {
  return state.team.employees.filter((employee) => employee.role === 'safety').length
}

/** Morale recovers on a normal schedule, drains under overtime; exhausted people quit. */
export function dailyMoraleStep(state: GameState, rng: Rng): GameState {
  const { morale, overwork, employees } = state.team
  if (employees.length === 0) return state
  const shifted = Math.min(100, Math.max(0, morale + (overwork ? -OVERWORK_MORALE_DRAIN_PER_DAY : MORALE_RECOVER_PER_DAY)))
  let next: GameState = { ...state, team: { ...state.team, morale: shifted } }
  if (shifted < LOW_MORALE_THRESHOLD && rng() < LOW_MORALE_QUIT_CHANCE) {
    next = loseRandomEmployee(next, rng, 'Выгорание доконало сотрудника — он ушёл без объяснений.')
  }
  return next
}

export function loseRandomEmployee(state: GameState, rng: Rng, reason: string): GameState {
  const { employees } = state.team
  if (employees.length === 0) return state
  const victim = employees[Math.floor(rng() * employees.length)]
  return pushNotice(
    { ...state, team: { ...state.team, employees: employees.filter((item) => item.id !== victim.id) } },
    reason,
  )
}
