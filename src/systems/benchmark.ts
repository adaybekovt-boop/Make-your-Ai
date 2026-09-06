import {
  BENCHMARK_COST,
  BENCHMARK_OFFLINE_HOURS,
  CHEAT_EXPOSURE_DAILY_CHANCE,
  CHEAT_EXPOSURE_REPUTATION_HIT,
  CHEAT_GMI_BONUS,
  GMI_AD_BOOST_HOURS,
  GMI_BOOST_THRESHOLD,
  GMI_CATEGORIES,
  GMI_NOISE,
} from './config'
import { changeReputation } from './reputation'
import { gameDay, pushNotice } from './market'
import type { ActionResult, GmiResult, GameState, Rng } from './types'

export interface GmiScores {
  reasoning: number
  coding: number
  safety: number
  multimodal: number
  total: number
}

/** Subcategory score: Model IQ times category weight, ±10% noise, optional cheat bonus. */
export function gmiScores(iq: number, rng: Rng, bonusMult = 1): GmiScores {
  const scores: Record<string, number> = {}
  let sum = 0
  for (const category of GMI_CATEGORIES) {
    const noise = 1 + (rng() * 2 - 1) * GMI_NOISE
    const score = Math.max(0, iq * category.weight * noise * bonusMult)
    scores[category.id] = score
    sum += score
  }
  return {
    reasoning: scores.reasoning,
    coding: scores.coding,
    safety: scores.safety,
    multimodal: scores.multimodal,
    total: sum / GMI_CATEGORIES.length,
  }
}

function cheatBlockedByContract(state: GameState): boolean {
  const contract = state.contracts.active
  return contract?.noCheatUntilDay !== null && contract?.noCheatUntilDay !== undefined && gameDay(state) <= contract.noCheatUntilDay
}

export function togglePreparing(state: GameState): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (cheatBlockedByContract(state)) {
    return { ok: false, error: 'Действует обязательство перед клиентом: без манипуляций с бенчмарками.' }
  }
  return {
    ok: true,
    state: { ...state, benchmark: { ...state.benchmark, preparing: !state.benchmark.preparing } },
  }
}

export function runBenchmark(state: GameState, rng: Rng): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (state.model.iq <= 0) return { ok: false, error: 'Сначала обучите модель: Model IQ равен нулю.' }
  if (state.benchmark.testing) return { ok: false, error: 'Тестирование уже идёт.' }
  if (state.model.offlineUntil !== null) return { ok: false, error: 'Модель остановлена: тестирование недоступно.' }
  if (cheatBlockedByContract(state) && state.benchmark.preparing) {
    return { ok: false, error: 'Действует обязательство перед клиентом: без манипуляций с бенчмарками.' }
  }
  if (state.cash < BENCHMARK_COST) return { ok: false, error: 'Недостаточно средств.' }

  const cheated = state.benchmark.preparing
  const bonusMult = cheated ? 1 + CHEAT_GMI_BONUS : 1
  const scores = gmiScores(state.model.iq, rng, bonusMult)
  const last: GmiResult = { ...scores, cheated, exposed: false, day: gameDay(state) }
  const adBoostUntil = !cheated && scores.total >= GMI_BOOST_THRESHOLD
    ? state.elapsedGameHours + GMI_AD_BOOST_HOURS
    : state.benchmark.adBoostUntil

  let next: GameState = {
    ...state,
    cash: state.cash - BENCHMARK_COST,
    totalExpenses: state.totalExpenses + BENCHMARK_COST,
    model: { ...state.model, offlineUntil: state.elapsedGameHours + BENCHMARK_OFFLINE_HOURS },
    benchmark: { ...state.benchmark, testing: true, last, adBoostUntil },
  }
  next = pushNotice(next, cheated
    ? `GMI ${Math.round(scores.total)}: результат завышен подготовкой. Рынок доверяет, но следы остались.`
    : `Тестирование завершено: GMI ${Math.round(scores.total)}. Модель была отключена от пользователей на ${BENCHMARK_OFFLINE_HOURS} ч.`)
  return { ok: true, state: next }
}

/** Daily chance that benchmark manipulation from the last test comes to light. */
export function dailyExposureRoll(state: GameState, rng: Rng): GameState {
  const last = state.benchmark.last
  if (!last || !last.cheated || last.exposed) return state
  if (rng() >= CHEAT_EXPOSURE_DAILY_CHANCE) return state
  let next = changeReputation(state, -CHEAT_EXPOSURE_REPUTATION_HIT)
  next = {
    ...next,
    benchmark: { ...next.benchmark, last: { ...last, exposed: true }, adBoostUntil: null },
  }
  return pushNotice(next, 'Жульничество с бенчмарками вскрылось. Скандал ударил по репутации сильнее, чем дал результат.')
}
