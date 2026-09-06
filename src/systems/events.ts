import {
  COMPLAINT_DAILY_CHANCE,
  COMPLAINT_FINE,
  COMPLAINT_REPUTATION_HIT,
  COURT_DAILY_CHANCE,
  COURT_FINE,
  COURT_REPUTATION_HIT,
  DATA_LEAK_FINE,
  DATA_LEAK_REPUTATION_HIT,
  FIRE_COST,
  FIRE_REPUTATION_HIT,
  HALLUCINATION_REPUTATION_HIT,
  PROMPT_INJECTION_COST,
  PROMPT_INJECTION_DAILY_CHANCE,
  PROMPT_INJECTION_DOWNTIME_HOURS,
  PROMPT_INJECTION_REPUTATION_HIT,
  PROMPT_INJECTION_SAFETY_FACTOR,
  RANDOM_EVENT_DAILY_CHANCE,
  VIRAL_HOURS,
  rackCount,
  getRegion,
} from './config'
import { locationEquipment, withInstalledServers } from './serverGrid'
import { powerLimitFor } from './market'
import { changeReputation } from './reputation'
import { pushNotice, reduceFine } from './market'
import { loseRandomEmployee, safetyLevel } from './team'
import type { GameState, Rng } from './types'

/** Losing a court case over illegal data: strong reputation hit plus a fine. */
export function dailyCourtRoll(state: GameState, rng: Rng): GameState {
  if (!state.model.dirtyHistory) return state
  const regionRisk = state.regionLocations.some((location) => location.owned)
    ? getRegion('overseas').courtRiskMult
    : 1
  if (rng() >= COURT_DAILY_CHANCE * regionRisk) return state
  const fine = reduceFine(state, COURT_FINE)
  let next: GameState = {
    ...state,
    cash: state.cash - fine,
    totalExpenses: state.totalExpenses + fine,
  }
  next = changeReputation(next, -COURT_REPUTATION_HIT)
  return pushNotice(next, `Суд за нелегальные данные проигран: штраф ${Math.round(fine)} и удар по репутации.`)
}

/** Neighbours complain about overload; small fine, small reputation dent. */
export function dailyComplaintRoll(state: GameState, rng: Rng): GameState {
  const overloaded = [...state.locations, ...state.regionLocations].some((location) => {
    if (!location.owned) return false
    const demand = locationEquipment(location).demandKw
    if (demand <= 0) return false
    return demand > powerLimitFor(location.id)
  })
  if (!overloaded || rng() >= COMPLAINT_DAILY_CHANCE) return state
  const fine = reduceFine(state, COMPLAINT_FINE)
  let next: GameState = {
    ...state,
    cash: state.cash - fine,
    totalExpenses: state.totalExpenses + fine,
  }
  next = changeReputation(next, -COMPLAINT_REPUTATION_HIT)
  return pushNotice(next, `Соседи пожаловались на просевшее напряжение: штраф ${Math.round(fine)}.`)
}

/** Prompt injection is an ops risk: a safety role cuts the odds, data quality does not. */
export function dailyPromptInjectionRoll(state: GameState, rng: Rng): GameState {
  if (state.model.iq <= 0) return state
  const chance = PROMPT_INJECTION_DAILY_CHANCE * Math.pow(PROMPT_INJECTION_SAFETY_FACTOR, safetyLevel(state))
  if (rng() >= chance) return state
  const cost = reduceFine(state, PROMPT_INJECTION_COST)
  let next: GameState = {
    ...state,
    cash: state.cash - cost,
    totalExpenses: state.totalExpenses + cost,
    model: { ...state.model, offlineUntil: state.elapsedGameHours + PROMPT_INJECTION_DOWNTIME_HOURS },
  }
  next = changeReputation(next, -PROMPT_INJECTION_REPUTATION_HIT)
  return pushNotice(next, `Промпт-инъекция у пользователя: модель остановлена на ${PROMPT_INJECTION_DOWNTIME_HOURS} ч, разбор — ${Math.round(cost)}.`)
}

const EVENT_POOL = ['fire', 'viral', 'hallucination', 'raid', 'leak'] as const

/** One random event per day at most, drawn from the fixed pool. */
export function dailyRandomEvent(state: GameState, rng: Rng): GameState {
  if (rng() >= RANDOM_EVENT_DAILY_CHANCE) return state
  const event = EVENT_POOL[Math.floor(rng() * EVENT_POOL.length)]
  switch (event) {
    case 'fire': return fireEvent(state, rng)
    case 'viral': return viralEvent(state)
    case 'hallucination': return hallucinationEvent(state)
    case 'raid': return raidEvent(state, rng)
    case 'leak': return leakEvent(state)
  }
}

function fireEvent(state: GameState, rng: Rng): GameState {
  const candidates = [...state.locations, ...state.regionLocations].filter((location) => {
    if (!location.owned) return false
    return location.servers > 0 || rackCount(location.racks) > 0
  })
  if (candidates.length === 0) return state
  const victim = candidates[Math.floor(rng() * candidates.length)]
  const racks = victim.racks ? victim.racks.map((rack) => ({ ...rack })) : []
  let servers = victim.servers
  if (servers > 0) {
    servers -= 1
  } else {
    for (let i = racks.length - 1; i >= 0; i -= 1) {
      if (racks[i].count > 0) {
        racks[i] = { ...racks[i], count: racks[i].count - 1 }
        break
      }
    }
  }
  const cost = reduceFine(state, FIRE_COST)
  const updated = victim.installedServers
    ? withInstalledServers(victim, victim.installedServers.slice(1))
    : { ...victim, servers, racks }
  let next: GameState = {
    ...state,
    cash: state.cash - cost,
    totalExpenses: state.totalExpenses + cost,
    locations: state.locations.map((location) => location.id === victim.id ? updated : location),
    regionLocations: state.regionLocations.map((location) => location.id === victim.id ? updated : location),
  }
  next = changeReputation(next, -FIRE_REPUTATION_HIT)
  return pushNotice(next, `Пожар на сервере: одна машина сгорела, ликвидация обошлась в ${Math.round(cost)}.`)
}

function viralEvent(state: GameState): GameState {
  const next: GameState = {
    ...state,
    market: { ...state.market, viralUntil: state.elapsedGameHours + VIRAL_HOURS },
  }
  return pushNotice(next, 'Вирусный ролик про вашу модель: приток пользователей на день-два.')
}

function hallucinationEvent(state: GameState): GameState {
  let next = changeReputation(state, -HALLUCINATION_REPUTATION_HIT)
  next = pushNotice(next, 'Модель выдала публичную «галлюцинацию»: репутация просела, деньги целы.')
  return next
}

function raidEvent(state: GameState, rng: Rng): GameState {
  if (state.team.employees.length === 0) return hallucinationEvent(state)
  return loseRandomEmployee(state, rng, 'Рейд конкурента на команду: сотрудник перешёл к сопернику.')
}

function leakEvent(state: GameState): GameState {
  if (!state.model.dirtyHistory) return hallucinationEvent(state)
  const fine = reduceFine(state, DATA_LEAK_FINE)
  let next: GameState = {
    ...state,
    cash: state.cash - fine,
    totalExpenses: state.totalExpenses + fine,
  }
  next = changeReputation(next, -DATA_LEAK_REPUTATION_HIT)
  return pushNotice(next, `Утечка данных: регулятор выписал штраф ${Math.round(fine)}.`)
}
