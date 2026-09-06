import {
  AMBIENT_EFFECT_HOURS,
  AMBIENT_GMI_MAX_INTERVAL_DAYS,
  AMBIENT_GMI_MIN_INTERVAL_DAYS,
  AMBIENT_LOSS_REPUTATION,
  AMBIENT_WIN_REPUTATION,
  COMPETITOR_ADS_PRESSURE,
  COMPETITOR_BASE_GROWTH,
  COMPETITOR_COMPOUND,
  COMPETITOR_GMI_DRAG,
  COMPETITOR_GMI_DRAG_THRESHOLD,
  COMPETITOR_LOW_PRICE_PRESSURE,
  COMPETITOR_REPUTATION_DRAG,
  COMPETITOR_REPUTATION_DRAG_THRESHOLD,
  COMPETITOR_SAMPLES_MAX,
  COMPETITOR_START,
  ESPIONAGE_COST,
  ESPIONAGE_FAIL_REPUTATION,
  ESPIONAGE_REVEAL_HOURS,
  ESPIONAGE_SUCCESS_CHANCE,
  TOKEN_PRICE_LOW_THRESHOLD,
} from './config'
import { changeReputation } from './reputation'
import { gameDay, pushNotice } from './market'
import type { ActionResult, GameState, Rng } from './types'

/** Daily drift of the rival curve; pressure from price/ads, drag from GMI and reputation. */
export function competitorGrowth(state: GameState, rng: Rng): number {
  const score = state.competitor.score
  let growth = COMPETITOR_BASE_GROWTH + score * COMPETITOR_COMPOUND
  growth *= 0.8 + rng() * 0.4
  if (state.market.tokenPrice < TOKEN_PRICE_LOW_THRESHOLD) growth *= 1 + COMPETITOR_LOW_PRICE_PRESSURE
  if (state.market.advertising) growth *= 1 + COMPETITOR_ADS_PRESSURE
  const gmi = state.benchmark.last?.total ?? 0
  if (gmi >= COMPETITOR_GMI_DRAG_THRESHOLD) growth *= 1 - COMPETITOR_GMI_DRAG
  if (state.reputation >= COMPETITOR_REPUTATION_DRAG_THRESHOLD) growth *= 1 - COMPETITOR_REPUTATION_DRAG
  return growth
}

export function dailyCompetitorStep(state: GameState, rng: Rng): GameState {
  const score = state.competitor.score + competitorGrowth(state, rng)
  const samples = [...state.competitor.samples, score].slice(-COMPETITOR_SAMPLES_MAX)
  return { ...state, competitor: { ...state.competitor, score, samples } }
}

/** Free ambient comparison of GMI against the rival, every 4–8 days. */
export function dailyAmbientGmi(state: GameState, rng: Rng): GameState {
  const span = AMBIENT_GMI_MAX_INTERVAL_DAYS - AMBIENT_GMI_MIN_INTERVAL_DAYS
  const scheduleNext = (base: GameState): GameState => ({
    ...base,
    competitor: {
      ...base.competitor,
      nextAmbientDay: gameDay(base) + AMBIENT_GMI_MIN_INTERVAL_DAYS + Math.floor(rng() * (span + 1)),
    },
  })

  if (gameDay(state) < state.competitor.nextAmbientDay) return state
  const playerScore = state.benchmark.last?.total ?? state.model.iq * 0.8
  const rivalScore = state.competitor.score

  if (playerScore > rivalScore) {
    let next: GameState = {
      ...state,
      market: { ...state.market, ambientBoostUntil: state.elapsedGameHours + AMBIENT_EFFECT_HOURS },
    }
    next = changeReputation(next, AMBIENT_WIN_REPUTATION)
    next = scheduleNext(next)
    return pushNotice(next, `Сводка GMI: ваша модель (${Math.round(playerScore)}) впереди соперника (${Math.round(rivalScore)}). Пользователи идут к вам.`)
  }
  let next: GameState = {
    ...state,
    market: { ...state.market, ambientPenaltyUntil: state.elapsedGameHours + AMBIENT_EFFECT_HOURS },
  }
  next = changeReputation(next, AMBIENT_LOSS_REPUTATION)
  next = scheduleNext(next)
  return pushNotice(next, `Сводка GMI: соперник (${Math.round(rivalScore)}) обходит вашу модель (${Math.round(playerScore)}). Часть аудитории уходит.`)
}


/** Paid one-shot espionage: reveals the rival curve or fails loudly. */
export function attemptEspionage(state: GameState, rng: Rng): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (state.cash < ESPIONAGE_COST) return { ok: false, error: 'Недостаточно средств.' }
  if (state.competitor.revealedUntil !== null && state.elapsedGameHours < state.competitor.revealedUntil) {
    return { ok: false, error: 'Данные конкурента уже раскрыты.' }
  }

  if (rng() < ESPIONAGE_SUCCESS_CHANCE) {
    const next = pushNotice(
      {
        ...state,
        cash: state.cash - ESPIONAGE_COST,
        totalExpenses: state.totalExpenses + ESPIONAGE_COST,
        competitor: { ...state.competitor, revealedUntil: state.elapsedGameHours + ESPIONAGE_REVEAL_HOURS },
      },
      `Разведка удалась: цифры конкурента открыты на ${ESPIONAGE_REVEAL_HOURS} ч.`,
    )
    return { ok: true, state: next }
  }
  let next: GameState = {
    ...state,
    cash: state.cash - ESPIONAGE_COST,
    totalExpenses: state.totalExpenses + ESPIONAGE_COST,
  }
  next = changeReputation(next, -ESPIONAGE_FAIL_REPUTATION)
  next = pushNotice(next, 'Разведка провалилась: вас вычислили. Репутация пострадала сильнее, чем если бы вы не пытались.')
  return { ok: true, state: next }
}

export function competitorRevealed(state: GameState): boolean {
  return state.competitor.revealedUntil !== null && state.elapsedGameHours < state.competitor.revealedUntil
}

export function createCompetitorState() {
  return { score: COMPETITOR_START, samples: [COMPETITOR_START], revealedUntil: null, nextAmbientDay: AMBIENT_GMI_MIN_INTERVAL_DAYS + 2 }
}
