import { describe, expect, it } from 'vitest'
import {
  DATA_LOT_OFFICIAL,
  DATA_LOT_UNOFFICIAL,
  MALWARE_DOWNTIME_HOURS,
  MALWARE_REPAIR_COST,
  POISON_BASE_CHANCE,
  POISON_UNOFFICIAL_SHARE_CHANCE,
  TRAINING_IQ_PER_VOLUME,
  TRAINING_VOLUME_PER_COMPUTE_HOUR,
} from './config'
import { createInitialGame } from './simulation'
import { buyDataLot, dailyMalwareRoll, queueVolume, startTraining, tickTraining, unofficialShare } from './training'
import type { ActionResult, DataLot, GameState } from './types'

const rich = (): GameState => ({ ...createInitialGame(), cash: 1_000_000 })

function result(action: ActionResult): GameState {
  if (!action.ok) throw new Error(action.error)
  return action.state
}

function withQueue(game: GameState, lots: Array<{ quality: 'official' | 'unofficial'; volume: number }>): GameState {
  let id = game.dataLotSeq
  const queue: DataLot[] = lots.map((lot) => ({ id: ++id, quality: lot.quality, volume: lot.volume }))
  return { ...game, dataLotSeq: id, model: { ...game.model, queue } }
}

const never = () => 0.99
const always = () => 0.01

describe('data lots and the training queue', () => {
  it('official and unofficial lots differ in price and stack in the queue', () => {
    let game = rich()
    game = result(buyDataLot(game, 'official'))
    game = result(buyDataLot(game, 'unofficial'))
    expect(game.cash).toBe(1_000_000 - DATA_LOT_OFFICIAL.price - DATA_LOT_UNOFFICIAL.price)
    expect(game.model.queue).toHaveLength(2)
    expect(queueVolume(game.model.queue)).toBe(DATA_LOT_OFFICIAL.volume + DATA_LOT_UNOFFICIAL.volume)
  })

  it('refuses a lot the company cannot afford', () => {
    expect(buyDataLot(createInitialGame(), 'official').ok).toBe(false)
  })

  it('unofficial share weights by volume', () => {
    const queue: DataLot[] = [
      { id: 1, quality: 'official', volume: 300 },
      { id: 2, quality: 'unofficial', volume: 100 },
    ]
    expect(unofficialShare(queue)).toBeCloseTo(0.25)
  })

  it('poisoning chance is 2% plus 25% of the unofficial share', () => {
    let game = result(startTraining(withQueue(rich(), [{ quality: 'official', volume: 100 }])))
    expect(game.model.run?.poisonedChance).toBeCloseTo(POISON_BASE_CHANCE)

    game = result(startTraining(withQueue(rich(), [
      { quality: 'official', volume: 100 },
      { quality: 'unofficial', volume: 100 },
    ])))
    expect(game.model.run?.poisonedChance).toBeCloseTo(POISON_BASE_CHANCE + 0.5 * POISON_UNOFFICIAL_SHARE_CHANCE)
  })

  it('startTraining consumes the queue and refuses to double-run', () => {
    let game = result(startTraining(withQueue(rich(), [{ quality: 'official', volume: 100 }])))
    expect(game.model.queue).toHaveLength(0)
    expect(game.model.run?.total).toBe(100)
    expect(startTraining(game).ok).toBe(false)
  })
})

describe('training progress and Model IQ', () => {
  it('compute eats queue volume at a fixed rate', () => {
    let game = result(startTraining(withQueue(rich(), [{ quality: 'official', volume: 100 }])))
    game = tickTraining(game, 1, 1, never)
    expect(game.model.run?.remaining).toBe(100 - TRAINING_VOLUME_PER_COMPUTE_HOUR)
    expect(game.model.iq).toBe(0)
  })

  it('overtime trains faster', () => {
    const plain = tickTraining(
      result(startTraining(withQueue(rich(), [{ quality: 'official', volume: 100 }]))),
      1, 1, never,
    )
    const tired = { ...rich(), team: { ...rich().team, overwork: true } }
    const overtime = tickTraining(
      result(startTraining(withQueue(tired, [{ quality: 'official', volume: 100 }]))),
      1, 1, never,
    )
    expect(overtime.model.run!.remaining).toBeLessThan(plain.model.run!.remaining)
  })

  it('completion adds IQ proportional to volume and stays clean on a friendly roll', () => {
    let game = result(startTraining(withQueue(rich(), [{ quality: 'official', volume: 100 }])))
    game = tickTraining(game, 100, 4, never)
    expect(game.model.run).toBeNull()
    expect(game.model.iq).toBeCloseTo(100 * TRAINING_IQ_PER_VOLUME)
    expect(game.model.infected).toBe(false)
  })

  it('a dirty roll marks the model infected', () => {
    let game = result(startTraining(withQueue(rich(), [{ quality: 'unofficial', volume: 100 }])))
    game = tickTraining(game, 100, 4, always)
    expect(game.model.infected).toBe(true)
    expect(game.model.dirtyHistory).toBe(true)
  })

  it('training pauses while the model is offline', () => {
    let game = result(startTraining(withQueue(rich(), [{ quality: 'official', volume: 100 }])))
    game = { ...game, model: { ...game.model, offlineUntil: game.elapsedGameHours + 10 } }
    const untouched = tickTraining(game, 5, 4, never)
    expect(untouched.model.run?.remaining).toBe(100)
  })
})

describe('malware incidents while infected', () => {
  it('fires with the daily chance, stops the model and charges the repair', () => {
    let game = { ...rich(), model: { ...rich().model, infected: true } }
    game = dailyMalwareRoll(game, always)
    expect(game.model.infected).toBe(false)
    expect(game.model.offlineUntil).toBe(game.elapsedGameHours + MALWARE_DOWNTIME_HOURS)
    expect(game.cash).toBe(1_000_000 - MALWARE_REPAIR_COST)
    expect(game.pendingNotices.some((notice) => notice.includes('вредоносный код'))).toBe(true)
  })

  it('insurance covers part of the repair', () => {
    const base = { ...rich(), model: { ...rich().model, infected: true }, market: { ...rich().market, insurance: true } }
    const game = dailyMalwareRoll(base, always)
    expect(game.cash).toBe(1_000_000 - MALWARE_REPAIR_COST * 0.6)
  })

  it('a healthy model never triggers the incident', () => {
    const game = dailyMalwareRoll(rich(), always)
    expect(game.model.offlineUntil).toBeNull()
    expect(game.cash).toBe(1_000_000)
  })
})
