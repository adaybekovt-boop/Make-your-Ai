import {
  CONTRACT_DIRTY_DAYS,
  CONTRACT_ENTERPRISE_PAYOUT,
  CONTRACT_EXPIRY_DAYS,
  CONTRACT_GREY_MULTIPLIER,
  CONTRACT_INTERVAL_MAX_DAYS,
  CONTRACT_INTERVAL_MIN_DAYS,
  CONTRACT_NO_CHEAT_DAYS,
  CONTRACT_OFFICIAL_PAYOUT,
  CONTRACT_OFFICIAL_REPUTATION_MIN,
} from './config'
import { gameDay, pushNotice } from './market'
import type { ActionResult, ContractKind, ContractOffer, GameState, Rng } from './types'

const FICTIONAL_CLIENTS = [
  'Аврора Логистика',
  'Городская библиотека №4',
  'Пекарня «Тесто»',
  'Метеослужба «Ветер»',
  'Таксопарк «Вольт»',
  'Ателье «Стежка»',
  'Депо «Северные ворота»',
  'Студия «Тихий кадр»',
]

function intervalDays(rng: Rng): number {
  const span = CONTRACT_INTERVAL_MAX_DAYS - CONTRACT_INTERVAL_MIN_DAYS
  return CONTRACT_INTERVAL_MIN_DAYS + Math.floor(rng() * (span + 1))
}

export function nextOfferDay(state: GameState, rng: Rng): number {
  return gameDay(state) + intervalDays(rng)
}

/**
 * Release the slot only after the data obligation is settled AND all time windows end.
 * Calendar deadlines are inclusive, matching benchmark.cheatBlockedByContract.
 * No payout/refund/reputation change occurs here. Untrained official contracts keep
 * waiting: the existing design specifies the next training, not a training deadline.
 */
export function closeCompletedContract(state: GameState): GameState {
  const active = state.contracts.active
  if (!active || state.ending) return state
  if (active.requiresOfficialData && active.fulfilled === null) return state
  const day = gameDay(state)
  if (active.noCheatUntilDay !== null && day <= active.noCheatUntilDay) return state
  if (active.dirtyUntilDay !== null && day <= active.dirtyUntilDay) return state
  // Old saves can have a risk timer which ends later than the calendar deadline.
  if (active.kind === 'grey' && state.market.dirtyRiskUntil !== null &&
      state.elapsedGameHours < state.market.dirtyRiskUntil) return state
  return pushNotice(
    { ...state, contracts: { ...state.contracts, active: null } },
    `Контракт «${active.clientName}» закрыт. Компания может принимать новые предложения.`,
  )
}

/** One offer at a time: the same deal in an official and a grey variant. */
export function maybeGenerateOffer(state: GameState, rng: Rng): GameState {
  if (state.ending || state.contracts.pending || state.contracts.active) return state
  if (gameDay(state) < state.contracts.nextOfferDay) return state

  const clientName = FICTIONAL_CLIENTS[Math.floor(rng() * FICTIONAL_CLIENTS.length)]
  const offer: ContractOffer = {
    id: state.contracts.seq + 1,
    clientName,
    officialPayout: CONTRACT_OFFICIAL_PAYOUT,
    greyPayout: Math.round(CONTRACT_OFFICIAL_PAYOUT * CONTRACT_GREY_MULTIPLIER),
    enterprise: state.model.tech.includes('context') && rng() < 0.25,
    enterprisePayout: CONTRACT_ENTERPRISE_PAYOUT,
    expiresDay: gameDay(state) + CONTRACT_EXPIRY_DAYS,
  }
  const next: GameState = {
    ...state,
    contracts: {
      ...state.contracts,
      seq: offer.id,
      pending: offer,
      nextOfferDay: nextOfferDay(state, rng),
    },
  }
  return pushNotice(next, `Новое предложение: контракт от «${offer.clientName}». Решение ждёт на панели.`)
}

export function offerVariantAvailable(state: GameState, variant: ContractKind): boolean {
  if (variant === 'official') return state.reputation >= CONTRACT_OFFICIAL_REPUTATION_MIN
  return true
}

export function clearExpiredOffer(state: GameState): GameState {
  const pending = state.contracts.pending
  if (!pending || gameDay(state) <= pending.expiresDay) return state
  return pushNotice(
    { ...state, contracts: { ...state.contracts, pending: null } },
    `Предложение от «${pending.clientName}» истекло без ответа.`,
  )
}

export function acceptContract(state: GameState, variant: ContractKind): ActionResult {
  const pending = state.contracts.pending
  if (!pending) return { ok: false, error: 'Активного предложения нет.' }
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (state.contracts.active) return { ok: false, error: 'Сначала завершите действующий контракт.' }
  if (gameDay(state) > pending.expiresDay) return { ok: false, error: 'Срок предложения истёк.' }
  if (!offerVariantAvailable(state, variant)) {
    return { ok: false, error: 'Репутация слишком низка: клиент работает только по официальным правилам.' }
  }
  if (variant === 'enterprise' && !pending.enterprise) {
    return { ok: false, error: 'Этот клиент не предлагает энтерпрайз-формат.' }
  }

  const payout = variant === 'official' ? pending.officialPayout : variant === 'grey' ? pending.greyPayout : pending.enterprisePayout
  const active = {
    kind: variant,
    clientName: pending.clientName,
    payout,
    requiresOfficialData: variant === 'official',
    noCheatUntilDay: variant === 'official' ? gameDay(state) + CONTRACT_NO_CHEAT_DAYS : null,
    dirtyUntilDay: variant === 'grey' ? gameDay(state) + CONTRACT_DIRTY_DAYS : null,
    fulfilled: null,
  }
  let next: GameState = {
    ...state,
    cash: state.cash + payout,
    totalRevenue: state.totalRevenue + payout,
    contracts: { ...state.contracts, pending: null, active },
  }
  if (variant === 'grey') {
    next = { ...next, market: { ...next.market, dirtyRiskUntil: next.elapsedGameHours + CONTRACT_DIRTY_DAYS * 24 } }
  }
  const label = variant === 'official' ? 'официальный' : variant === 'grey' ? 'серый' : 'энтерпрайз'
  return {
    ok: true,
    state: pushNotice(next, `Подписан ${label} контракт с «${pending.clientName}»: выплата ${payout}.`),
  }
}

export function declineContract(state: GameState): GameState {
  const pending = state.contracts.pending
  if (!pending) return state
  return pushNotice(
    { ...state, contracts: { ...state.contracts, pending: null } },
    `Вы отказались от контракта «${pending.clientName}».`,
  )
}

export function activeContractLabel(state: GameState): string | null {
  const active = state.contracts.active
  if (!active) return null
  if (active.requiresOfficialData && active.fulfilled !== null) {
    const outcome = active.fulfilled ? 'Обязательство по обучению выполнено.' : 'Обязательство по обучению нарушено.'
    const restriction = active.noCheatUntilDay !== null && gameDay(state) <= active.noCheatUntilDay
      ? ` Без манипуляций с бенчмарками до конца дня ${active.noCheatUntilDay}.`
      : ' Ожидает закрытия на суточной границе.'
    return `Контракт «${active.clientName}»: ${outcome}${restriction}`
  }
  return `Контракт с «${active.clientName}» в силе.`
}
