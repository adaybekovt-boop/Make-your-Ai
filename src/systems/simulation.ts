import { advanceCompanySimulation } from './models/simulation'
import { adaptSingleModel, legacyFlagshipView } from './models/state'
import {
  CHIPS,
  CONTRACT_INTERVAL_MIN_DAYS,
  getLocationDefinition,
  getRegion,
  getRegionLocationDefinition,
  LOCATIONS,
  STARTING_CASH,
  TOKEN_PRICE_DEFAULT,
} from './config'
import {
  isModelOnline,
  purchasesRestricted,
} from './market'
import { createCompetitorState } from './competitor'
import type {
  ActionResult,
  AnyLocationId,
  GameState,
  LocationState,
  Milestones,
  Rng,
} from './types'

const initialMilestones = (): Milestones => ({
  boughtLocation: false,
  installedServer: false,
  earnedRevenue: false,
  experiencedThrottle: false,
})

export function createInitialGame(): GameState {
  return {
    cash: STARTING_CASH,
    elapsedGameHours: 0,
    speed: 1,
    paused: false,
    locations: LOCATIONS.map(({ id }): LocationState => ({ id, owned: false, servers: 0 })),
    regionLocations: [],
    regions: [],
    totalRevenue: 0,
    totalExpenses: 0,
    totalCapex: 0,
    milestones: initialMilestones(),
    users: 0,
    reputation: 50,
    model: {
      iq: 0,
      queue: [],
      run: null,
      infected: false,
      offlineUntil: null,
      personality: null,
      openSource: false,
      openSourceChosen: false,
      tech: [],
      licensed: false,
      dirtyHistory: false,
    },
    benchmark: { preparing: false, testing: false, last: null, adBoostUntil: null },
    contracts: { seq: 0, pending: null, nextOfferDay: CONTRACT_INTERVAL_MIN_DAYS + 1, active: null },
    competitor: createCompetitorState(),
    team: { seq: 0, employees: [], morale: 70, overwork: false },
    market: {
      chips: {
        'consumer-gpu': { price: CHIPS['consumer-gpu'].price, trend: 0 },
        'pro-gpu': { price: CHIPS['pro-gpu'].price, trend: 0 },
        accelerator: { price: CHIPS.accelerator.price, trend: 0 },
        flagship: { price: CHIPS.flagship.price, trend: 0 },
      },
      advertising: false,
      tokenPrice: TOKEN_PRICE_DEFAULT,
      insurance: false,
      viralUntil: null,
      ambientBoostUntil: null,
      ambientPenaltyUntil: null,
      dirtyRiskUntil: null,
    },
    investors: { nextCheckDay: 10, restrictedUntil: null, misses: 0 },
    dataLotSeq: 0,
    orders: [],
    orderSeq: 0,
    ending: null,
    acquisitionOffered: false,
    acquisitionDeclined: false,
    pendingNotices: [],
  }
}

function findLocation(state: GameState, id: AnyLocationId): LocationState | undefined {
  return [...state.locations, ...state.regionLocations].find((location) => location.id === id)
}

function withUpdatedLocation(state: GameState, id: AnyLocationId, update: (location: LocationState) => LocationState): GameState {
  const inBase = state.locations.some((location) => location.id === id)
  const key = inBase ? 'locations' as const : 'regionLocations' as const
  return {
    ...state,
    [key]: state[key].map((location) => location.id === id ? update(location) : location),
  }
}

function withMilestone(state: GameState, key: keyof Milestones): GameState {
  return { ...state, milestones: { ...state.milestones, [key]: true } }
}

function blockedByBoard(state: GameState): string | null {
  if (state.ending) return 'Компания уже продана.'
  if (purchasesRestricted(state)) return 'Совет директоров ограничил крупные траты. Дождитесь окончания срока.'
  return null
}

export function buyLocation(state: GameState, id: AnyLocationId): ActionResult {
  const boardBlock = blockedByBoard(state)
  if (boardBlock) return { ok: false, error: boardBlock }
  const location = findLocation(state, id)
  if (!location) return { ok: false, error: 'Неизвестная локация.' }
  if (location.owned) return { ok: false, error: 'Локация уже приобретена.' }

  if (id === 'overseas-west' || id === 'overseas-east') {
    const { region } = getRegionLocationDefinition(id)
    if (!state.regions.includes(region.id)) return { ok: false, error: 'Сначала откройте регион.' }
    if (state.cash < getRegionLocationDefinition(id).location.price) return { ok: false, error: 'Недостаточно средств.' }
    const next = withUpdatedLocation(state, id, (item) => ({ ...item, owned: true }))
    return {
      ok: true,
      state: {
        ...withMilestone(next, 'boughtLocation'),
        cash: state.cash - getRegionLocationDefinition(id).location.price,
        totalCapex: state.totalCapex + getRegionLocationDefinition(id).location.price,
      },
    }
  }

  const definition = getLocationDefinition(id)
  if (state.cash < definition.price) return { ok: false, error: 'Недостаточно средств.' }
  const next = withUpdatedLocation(state, id, (item) => ({ ...item, owned: true }))
  return {
    ok: true,
    state: {
      ...withMilestone(next, 'boughtLocation'),
      cash: state.cash - definition.price,
      totalCapex: state.totalCapex + definition.price,
    },
  }
}

export function unlockRegion(state: GameState, regionId: string): ActionResult {
  const boardBlock = blockedByBoard(state)
  if (boardBlock) return { ok: false, error: boardBlock }
  if (state.regions.includes(regionId)) return { ok: false, error: 'Регион уже открыт.' }
  const region = getRegion(regionId)
  if (state.cash < region.unlockCost) return { ok: false, error: 'Недостаточно средств.' }
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - region.unlockCost,
      totalCapex: state.totalCapex + region.unlockCost,
      regions: [...state.regions, regionId],
      regionLocations: region.locations.map(({ id }): LocationState => ({ id, owned: false, servers: 0 })),
    },
  }
}

/** Legacy UI adapter. All hourly cash posting now lives in the single V3 company clock. */
export function advanceSimulation(state: GameState, realSeconds: number, rng: Rng = Math.random): GameState {
  if (state.paused || state.ending || !Number.isFinite(realSeconds) || realSeconds <= 0) return state
  return legacyFlagshipView(advanceCompanySimulation(adaptSingleModel(state), realSeconds, rng))
}

/** True when the model serves users (no repair, no benchmark downtime). */
export function modelServing(state: GameState): boolean {
  return isModelOnline(state)
}
