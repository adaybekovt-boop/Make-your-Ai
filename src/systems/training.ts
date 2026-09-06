import {
  CONTRACT_BREACH_REPUTATION,
  CONTRACT_FULFILLED_REPUTATION,
  DATA_LOT_OFFICIAL,
  DATA_LOT_UNOFFICIAL,
  INFECTED_DAILY_CHANCE,
  MALWARE_DOWNTIME_HOURS,
  MALWARE_REPAIR_COST,
  MALWARE_REPUTATION_HIT,
  OVERWORK_TRAINING_BONUS,
  POISON_BASE_CHANCE,
  POISON_UNOFFICIAL_SHARE_CHANCE,
  TRAINING_IQ_PER_VOLUME,
  TRAINING_VOLUME_PER_COMPUTE_HOUR,
} from './config'
import { changeReputation } from './reputation'
import { isModelOnline, pushNotice, reduceFine } from './market'
import type { ActionResult, DataLot, DataQuality, GameState, Rng, TrainingRun } from './types'

export function queueVolume(queue: DataLot[]): number {
  return queue.reduce((sum, lot) => sum + lot.volume, 0)
}

export function unofficialShare(queue: DataLot[]): number {
  const total = queueVolume(queue)
  if (total <= 0) return 0
  const dirty = queue
    .filter((lot) => lot.quality === 'unofficial')
    .reduce((sum, lot) => sum + lot.volume, 0)
  return dirty / total
}

export function buyDataLot(state: GameState, quality: DataQuality): ActionResult {
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  const spec = quality === 'official' ? DATA_LOT_OFFICIAL : DATA_LOT_UNOFFICIAL
  if (state.cash < spec.price) return { ok: false, error: 'Недостаточно средств.' }
  const lot: DataLot = { id: state.dataLotSeq + 1, quality, volume: spec.volume }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - spec.price,
      dataLotSeq: lot.id,
      model: { ...state.model, queue: [...state.model.queue, lot] },
    },
  }
}

export function startTraining(state: GameState): ActionResult {
  const { model } = state
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (model.run) return { ok: false, error: 'Обучение уже идёт.' }
  if (!isModelOnline(state)) return { ok: false, error: 'Модель остановлена: дождитесь окончания ремонта или теста.' }
  if (model.queue.length === 0) return { ok: false, error: 'Очередь пуста. Сначала купите партию данных.' }
  const share = unofficialShare(model.queue)
  const run: TrainingRun = {
    total: queueVolume(model.queue),
    remaining: queueVolume(model.queue),
    poisonedChance: POISON_BASE_CHANCE + share * POISON_UNOFFICIAL_SHARE_CHANCE,
    usedUnofficial: share > 0,
  }
  return { ok: true, state: { ...state, model: { ...model, run, queue: [] } } }
}

/** Shared by training and chronological simulation segmentation. */
export function trainingRate(state: GameState, effectiveCompute: number): number {
  if (!isModelOnline(state) || effectiveCompute <= 0) return 0
  return effectiveCompute * TRAINING_VOLUME_PER_COMPUTE_HOUR * (state.team.overwork ? OVERWORK_TRAINING_BONUS : 1)
}

/** Consume queue volume against available compute; finish and roll poisoning when done. */
export function tickTraining(state: GameState, hours: number, effectiveCompute: number, rng: Rng): GameState {
  const { model } = state
  if (!model.run || hours <= 0 || effectiveCompute <= 0) return state
  if (model.offlineUntil !== null && state.elapsedGameHours < model.offlineUntil) return state
  const processed = Math.min(model.run.remaining, trainingRate(state, effectiveCompute) * hours)
  const remaining = model.run.remaining - processed
  if (remaining > 0) {
    return { ...state, model: { ...model, run: { ...model.run, remaining } } }
  }
  return completeTraining(state, model.run, rng)
}

function completeTraining(state: GameState, run: TrainingRun, rng: Rng): GameState {
  let next: GameState = {
    ...state,
    model: {
      ...state.model,
      run: null,
      iq: state.model.iq + run.total * TRAINING_IQ_PER_VOLUME,
      dirtyHistory: state.model.dirtyHistory || run.usedUnofficial,
    },
  }
  const contract = next.contracts.active
  // The obligation concerns one training run, not every subsequent batch.
  if (contract?.requiresOfficialData && contract.fulfilled === null) {
    if (run.usedUnofficial) {
      next = changeReputation(next, -CONTRACT_BREACH_REPUTATION)
      next = {
        ...next,
        contracts: { ...next.contracts, active: { ...contract, fulfilled: false } },
        pendingNotices: [...next.pendingNotices, `Контракт «${contract.clientName}» нарушен: обучение прошло на неофициальных данных.`],
      }
    } else {
      next = changeReputation(next, CONTRACT_FULFILLED_REPUTATION)
      next = {
        ...next,
        contracts: { ...next.contracts, active: { ...contract, fulfilled: true } },
        pendingNotices: [...next.pendingNotices, `Обязательство перед «${contract.clientName}» выполнено.`],
      }
    }
  }
  if (rng() < run.poisonedChance) {
    next = {
      ...next,
      model: { ...next.model, infected: true },
      pendingNotices: [...next.pendingNotices, 'Партия оказалась грязной: в модели поселился вредоносный код. Ждите инцидента или лечите превентивно.'],
    }
  } else {
    next = pushNotice(next, 'Обучение завершено. Model IQ вырос.')
  }
  return next
}

/** Once a day, an infected model may trigger a malware incident; repairing clears the flag. */
export function dailyMalwareRoll(state: GameState, rng: Rng): GameState {
  if (!state.model.infected) return state
  if (rng() >= INFECTED_DAILY_CHANCE) return state
  const repairCost = reduceFine(state, MALWARE_REPAIR_COST)
  let next: GameState = {
    ...state,
    cash: state.cash - repairCost,
    totalExpenses: state.totalExpenses + repairCost,
    model: {
      ...state.model,
      infected: false,
      offlineUntil: state.elapsedGameHours + MALWARE_DOWNTIME_HOURS,
    },
  }
  next = changeReputation(next, -MALWARE_REPUTATION_HIT)
  return pushNotice(next, `Обнаружен вредоносный код. Модель стоит на ремонте ${MALWARE_DOWNTIME_HOURS} ч, устранение обошлось в ${Math.round(repairCost)}.`)
}
