import { gridSizeFor, isGridPosition } from '../systems/serverGrid'
import { validateGridData, migrateGridLocations } from './gridSave'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  BALANCE_VERSION,
  CHASSIS,
  CHIPS,
  LOCATIONS,
  MAX_SERVERS_PER_LOCATION,
  REGIONS,
} from '../systems/config'
import { CITY_TOWERS, type CityTowerId } from '../systems/city'
import { createInitialGame } from '../systems/simulation'
import type {
  BenchmarkState,
  EquipmentOrder,
  ChipId,
  CompetitorState,
  ContractOffer,
  ContractsState,
  GameState,
  InvestorsState,
  MarketState,
  ModelState,
  TeamState,
  TechNodeId,
  LocationState,
  Milestones,
} from '../systems/types'

export const SAVE_VERSION = 2
export const DATABASE_NAME = 'neuron-phase-0'

export interface SaveEnvelope {
  schemaVersion: typeof SAVE_VERSION
  balanceVersion: number
  savedAt: string
  game: GameState
}

interface SaveDatabase extends DBSchema {
  saves: { key: string; value: unknown }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Повреждённое сохранение: ${field}.`)
  return value as Record<string, unknown>
}

function finite(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error(`Некорректное число: ${field}.`)
  return value
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Некорректное значение: ${field}.`)
  return value
}

function optionalFinite(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : finite(value, field)
}

function oneOf<T extends string>(value: unknown, options: readonly T[], field: string): T | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !options.includes(value as T)) throw new Error(`Некорректное значение: ${field}.`)
  return value as T
}

function validateLocation(value: unknown, ids: readonly string[], maxServers = MAX_SERVERS_PER_LOCATION): LocationState {
  const location = record(value, 'локация')
  const id = location.id
  if (typeof id !== 'string' || !ids.includes(id)) throw new Error('Неизвестная или повторяющаяся локация.')
  const owned = bool(location.owned, 'владение')
  const servers = finite(location.servers, 'серверы')
  if (!Number.isInteger(servers) || servers > maxServers || (!owned && servers > 0)) throw new Error('Некорректное количество серверов.')
  let racks: LocationState['racks']
  if (location.racks !== undefined) {
    if (!Array.isArray(location.racks)) throw new Error('Некорректный список стоек.')
    racks = location.racks.map((rackValue: unknown) => {
      const rack = record(rackValue, 'стойка')
      const chip = oneOf(rack.chip, Object.keys(CHIPS) as ChipId[], 'класс чипа')
      if (!chip) throw new Error('Некорректный класс чипа.')
      const count = finite(rack.count, 'серверы в стойке')
      if (!Number.isInteger(count) || count < 0 || count > MAX_SERVERS_PER_LOCATION) throw new Error('Некорректное количество серверов в стойке.')
      return { chip, count }
    })
  }
  return validateGridData(location, { id: id as LocationState['id'], owned, servers, ...(racks ? { racks } : {}) })
}

function validateModel(value: unknown): ModelState {
  const model = record(value, 'модель')
  const queue = Array.isArray(model.queue) ? model.queue.map((lotValue: unknown) => {
    const lot = record(lotValue, 'партия данных')
    const quality = oneOf(lot.quality, ['official', 'unofficial'] as const, 'качество данных')
    if (!quality) throw new Error('Некорректная партия данных.')
    return { id: finite(lot.id, 'номер партии'), quality, volume: finite(lot.volume, 'объём') }
  }) : (() => { throw new Error('Некорректная очередь данных.') })()
  const runValue = model.run
  let run: ModelState['run']
  if (runValue !== null && runValue !== undefined) {
    const runRecord = record(runValue, 'процесс обучения')
    run = {
      total: finite(runRecord.total, 'объём обучения'),
      remaining: finite(runRecord.remaining, 'остаток обучения'),
      poisonedChance: finite(runRecord.poisonedChance, 'шанс отравления', 0),
      usedUnofficial: bool(runRecord.usedUnofficial, 'неофициальные данные'),
    }
  } else {
    run = null
  }
  const tech = Array.isArray(model.tech)
    ? model.tech.map((node: unknown) => oneOf(node, ['context', 'multimodal', 'voice'] as const, 'технология'))
    : (() => { throw new Error('Некорректный список технологий.') })()
  if (tech.some((node) => node === null)) throw new Error('Некорректный список технологий.')
  return {
    iq: finite(model.iq, 'Model IQ'),
    queue,
    run,
    infected: bool(model.infected, 'флаг заражения'),
    offlineUntil: optionalFinite(model.offlineUntil, 'простой модели'),
    personality: oneOf(model.personality, ['friendly', 'raw'] as const, 'личность модели'),
    openSource: bool(model.openSource, 'open-source'),
    openSourceChosen: bool(model.openSourceChosen ?? false, 'выбор open-source'),
    tech: tech as TechNodeId[],
    licensed: bool(model.licensed, 'лицензии'),
    dirtyHistory: bool(model.dirtyHistory, 'история грязных данных'),
  }
}

function validateBenchmark(value: unknown): BenchmarkState {
  const benchmark = record(value, 'бенчмарки')
  let last: BenchmarkState['last']
  if (benchmark.last !== null && benchmark.last !== undefined) {
    const result = record(benchmark.last, 'результат GMI')
    last = {
      reasoning: finite(result.reasoning, 'Reasoning'),
      coding: finite(result.coding, 'Coding'),
      safety: finite(result.safety, 'Safety'),
      multimodal: finite(result.multimodal, 'Multimodal'),
      total: finite(result.total, 'итог GMI'),
      cheated: bool(result.cheated, 'жульничество'),
      exposed: bool(result.exposed, 'разоблачение'),
      day: finite(result.day, 'день теста'),
    }
  } else {
    last = null
  }
  return {
    preparing: bool(benchmark.preparing, 'подготовка к бенчмаркам'),
    testing: bool(benchmark.testing, 'идёт тест'),
    last,
    adBoostUntil: optionalFinite(benchmark.adBoostUntil, 'буст рекламы'),
  }
}

function validateContracts(value: unknown): ContractsState {
  const contracts = record(value, 'контракты')
  const validateOffer = (offerValue: unknown): ContractOffer => {
    const offer = record(offerValue, 'предложение')
    return {
      id: finite(offer.id, 'номер контракта'),
      clientName: typeof offer.clientName === 'string' ? offer.clientName : (() => { throw new Error('Некорректный клиент.') })(),
      officialPayout: finite(offer.officialPayout, 'официальная выплата'),
      greyPayout: finite(offer.greyPayout, 'серая выплата'),
      enterprise: bool(offer.enterprise, 'энтерпрайз-формат'),
      enterprisePayout: finite(offer.enterprisePayout, 'энтерпрайз-выплата'),
      expiresDay: finite(offer.expiresDay, 'срок предложения'),
    }
  }
  const pending = contracts.pending !== null && contracts.pending !== undefined ? validateOffer(contracts.pending) : null
  let active: ContractsState['active']
  if (contracts.active !== null && contracts.active !== undefined) {
    const contract = record(contracts.active, 'активный контракт')
    const kind = oneOf(contract.kind, ['official', 'grey', 'enterprise'] as const, 'тип контракта')
    if (!kind) throw new Error('Некорректный контракт.')
    active = {
      kind,
      clientName: typeof contract.clientName === 'string' ? contract.clientName : (() => { throw new Error('Некорректный клиент.') })(),
      payout: finite(contract.payout, 'выплата'),
      requiresOfficialData: bool(contract.requiresOfficialData, 'обязательство по данным'),
      noCheatUntilDay: optionalFinite(contract.noCheatUntilDay, 'срок без жульничества'),
      dirtyUntilDay: optionalFinite(contract.dirtyUntilDay, 'срок грязных рисков'),
      fulfilled: contract.fulfilled === null || contract.fulfilled === undefined ? null : bool(contract.fulfilled, 'исполнение'),
    }
  } else {
    active = null
  }
  return {
    seq: finite(contracts.seq, 'счётчик контрактов'),
    pending,
    nextOfferDay: finite(contracts.nextOfferDay, 'день следующего предложения'),
    active,
  }
}

function validateCompetitor(value: unknown): CompetitorState {
  const competitor = record(value, 'конкурент')
  if (!Array.isArray(competitor.samples)) throw new Error('Некорректная история конкурента.')
  return {
    score: finite(competitor.score, 'балл конкурента'),
    samples: competitor.samples.map((sample: unknown) => finite(sample, 'точка графика')),
    revealedUntil: optionalFinite(competitor.revealedUntil, 'раскрытие данных'),
    nextAmbientDay: finite(competitor.nextAmbientDay, 'день сводки GMI'),
  }
}

function validateTeam(value: unknown): TeamState {
  const team = record(value, 'команда')
  if (!Array.isArray(team.employees)) throw new Error('Некорректный список сотрудников.')
  const employees = team.employees.map((employeeValue: unknown) => {
    const employee = record(employeeValue, 'сотрудник')
    const role = oneOf(employee.role, ['safety', 'engineer'] as const, 'роль')
    if (!role) throw new Error('Некорректная роль.')
    return {
      id: finite(employee.id, 'номер сотрудника'),
      role,
      salaryPerHour: finite(employee.salaryPerHour, 'ставка'),
      hiredDay: finite(employee.hiredDay, 'день найма'),
    }
  })
  return {
    seq: finite(team.seq, 'счётчик найма'),
    employees,
    morale: finite(team.morale, 'мораль'),
    overwork: bool(team.overwork, 'переработки'),
  }
}

function validateMarket(value: unknown): MarketState {
  const market = record(value, 'рынок')
  const chips = record(market.chips, 'цены чипов')
  const validatedChips = {} as MarketState['chips']
  for (const chip of Object.keys(CHIPS) as ChipId[]) {
    const priceState = record(chips[chip] ?? { price: CHIPS[chip].price, trend: 0 }, `цена ${chip}`)
    const trend = finite(priceState.trend, 'тренд', -1)
    validatedChips[chip] = {
      price: finite(priceState.price, `цена ${chip}`),
      trend: trend > 0 ? 1 : trend < 0 ? -1 : 0,
    }
  }
  return {
    chips: validatedChips,
    advertising: bool(market.advertising, 'реклама'),
    tokenPrice: finite(market.tokenPrice, 'цена токена'),
    insurance: bool(market.insurance, 'страхование'),
    viralUntil: optionalFinite(market.viralUntil, 'вирал'),
    ambientBoostUntil: optionalFinite(market.ambientBoostUntil, 'буст сводки'),
    ambientPenaltyUntil: optionalFinite(market.ambientPenaltyUntil, 'провал сводки'),
    dirtyRiskUntil: optionalFinite(market.dirtyRiskUntil, 'грязные риски'),
  }
}

function validateInvestors(value: unknown): InvestorsState {
  const investors = record(value, 'инвесторы')
  return {
    nextCheckDay: finite(investors.nextCheckDay, 'день отчёта'),
    restrictedUntil: optionalFinite(investors.restrictedUntil, 'ограничение трат'),
    misses: finite(investors.misses, 'провалы отчётов'),
  }
}

function validateOrders(value: unknown, locations: LocationState[], orderSeq: number): EquipmentOrder[] {
  const ids = new Set<number>()
  if (!Array.isArray(value)) throw new Error('Некорректный список заказов.')
  if (value.length > 200) throw new Error('Слишком много заказов.')
  return value.map((entry) => {
    const order = record(entry, 'заказ')
    const kind = oneOf(order.kind, ['chip', 'chassis'] as const, 'тип заказа')
    if (!kind) throw new Error('Некорректный заказ.')
    const channel = oneOf(order.channel, ['official', 'grey'] as const, 'канал закупки')
    if (!channel) throw new Error('Некорректный канал закупки.')
    const item = typeof order.item === 'string' ? order.item : ''
    if (kind === 'chip' ? !Object.hasOwn(CHIPS, item) : !Object.hasOwn(CHASSIS, item)) throw new Error('Неизвестное оборудование в заказе.')
    const qty = finite(order.qty, 'количество')
    if (!Number.isInteger(qty) || qty < 1 || qty > 24) throw new Error('Некорректное количество в заказе.')
    let targetCell: EquipmentOrder['targetCell'] = null
    if (order.targetCell !== null && order.targetCell !== undefined) {
      const point = record(order.targetCell, 'ячейка заказа')
      targetCell = { row: finite(point.row, 'строка ячейки'), col: finite(point.col, 'колонка ячейки') }
    }
    const location = locations.find((location) => location.id === order.locationId)
    if (!location?.owned) throw new Error('Заказ в неизвестную или неприобретённую локацию.')
    if (targetCell && !isGridPosition(targetCell, gridSizeFor(location.id))) throw new Error('Ячейка заказа за пределами сетки.')
    const id = finite(order.id, 'номер заказа')
    if (!Number.isSafeInteger(id) || id < 1 || id > orderSeq || ids.has(id)) throw new Error('Некорректный номер заказа.')
    ids.add(id)
    const targetServerId = order.targetServerId === null || order.targetServerId === undefined ? null : String(order.targetServerId)
    return {
      id,
      locationId: String(order.locationId ?? '') as EquipmentOrder['locationId'],
      kind, item: item as EquipmentOrder['item'], channel, qty,
      paid: finite(order.paid, 'оплата заказа'),
      arriveAt: finite(order.arriveAt, 'срок доставки'),
      targetCell, targetServerId,
    }
  })
}

export function validateGameState(value: unknown): GameState {
  const game = record(value, 'компания')
  const officeOwned = game.officeOwned === undefined ? undefined : bool(game.officeOwned, 'владение офисом')
  const cityProperties: CityTowerId[] = []
  if (game.cityProperties !== undefined) {
    if (!Array.isArray(game.cityProperties)) throw new Error('Некорректный список городской недвижимости.')
    for (const id of game.cityProperties) {
      if (typeof id !== 'string' || !CITY_TOWERS.some((tower) => tower.id === id) || cityProperties.includes(id as CityTowerId)) throw new Error('Неизвестное или повторяющееся городское здание.')
      cityProperties.push(id as CityTowerId)
    }
  }
  if (!Array.isArray(game.locations) || game.locations.length !== LOCATIONS.length) throw new Error('Некорректный список локаций.')
  const seen = new Set<string>()
  const locations: LocationState[] = game.locations.map((value: unknown) => {
    const location = record(value, 'локация')
    const definition = LOCATIONS.find((item) => item.id === location.id)
    if (!definition || seen.has(definition.id)) throw new Error('Неизвестная или повторяющаяся локация.')
    seen.add(definition.id)
    return validateLocation(location, LOCATIONS.map((item) => item.id as string))
  })
  const regionIds = REGIONS.flatMap((region) => region.locations.map((item) => item.id as string))
  if (!Array.isArray(game.regionLocations)) throw new Error('Некорректный список региональных локаций.')
  const regionSeen = new Set<string>()
  const regionLocations: LocationState[] = game.regionLocations.map((value: unknown) => {
    const location = record(value, 'региональная локация')
    if (typeof location.id !== 'string' || !regionIds.includes(location.id) || regionSeen.has(location.id)) {
      throw new Error('Неизвестная или повторяющаяся региональная локация.')
    }
    regionSeen.add(location.id)
    return validateLocation(location, regionIds)
  })
  if (!Array.isArray(game.regions)) throw new Error('Некорректный список регионов.')
  const regions = game.regions.map((region: unknown) => {
    if (typeof region !== 'string' || !REGIONS.some((item) => item.id === region)) throw new Error('Неизвестный регион.')
    return region
  })
  if (!Array.isArray(game.pendingNotices)) throw new Error('Некорректный список уведомлений.')
  const pendingNotices = game.pendingNotices.map((notice: unknown) => {
    if (typeof notice !== 'string') throw new Error('Некорректное уведомление.')
    return notice
  })
  if (game.speed !== 1 && game.speed !== 3) throw new Error('Некорректная скорость симуляции.')
  const sourceMilestones = record(game.milestones, 'прогресс обучения')
  const milestones: Milestones = {
    boughtLocation: bool(sourceMilestones.boughtLocation, 'покупка локации'),
    installedServer: bool(sourceMilestones.installedServer, 'установка сервера'),
    earnedRevenue: bool(sourceMilestones.earnedRevenue, 'первая выручка'),
    experiencedThrottle: bool(sourceMilestones.experiencedThrottle, 'троттлинг'),
  }
  const orderSeq = finite(game.orderSeq, 'счётчик заказов')
  if (!Number.isSafeInteger(orderSeq)) throw new Error('Некорректный счётчик заказов.')
  return {
    ...(officeOwned === undefined ? {} : { officeOwned }),
    ...(game.rareCarUntil === undefined ? {} : { rareCarUntil: finite(game.rareCarUntil, '������ ����������') }),
    ...(game.cityProperties !== undefined ? { cityProperties } : {}),
    cash: finite(game.cash, 'капитал', -Number.MAX_SAFE_INTEGER),
    elapsedGameHours: finite(game.elapsedGameHours, 'время'),
    speed: game.speed,
    paused: bool(game.paused, 'пауза'),
    locations,
    regionLocations,
    regions,
    totalRevenue: finite(game.totalRevenue, 'выручка'),
    totalExpenses: finite(game.totalExpenses, 'расходы'),
    totalCapex: finite(game.totalCapex, 'капитальные вложения'),
    milestones,
    users: finite(game.users, 'пользователи'),
    reputation: finite(game.reputation, 'репутация'),
    model: validateModel(game.model),
    benchmark: validateBenchmark(game.benchmark),
    contracts: validateContracts(game.contracts),
    competitor: validateCompetitor(game.competitor),
    team: validateTeam(game.team),
    market: validateMarket(game.market),
    investors: validateInvestors(game.investors),
    dataLotSeq: finite(game.dataLotSeq, 'счётчик партий'),
    orders: validateOrders(game.orders, [...locations, ...regionLocations], orderSeq),
    orderSeq,
    ending: oneOf(game.ending, ['acquired'] as const, 'концовка'),
    acquisitionOffered: bool(game.acquisitionOffered, 'предложение о поглощении'),
    acquisitionDeclined: bool(game.acquisitionDeclined, 'отказ от поглощения'),
    pendingNotices,
  }
}

export function decodeSave(value: unknown): SaveEnvelope {
  const envelope = record(value, 'контейнер')
  if (envelope.schemaVersion !== 0 && envelope.schemaVersion !== 1 && envelope.schemaVersion !== SAVE_VERSION) {
    throw new Error('Версия сохранения не поддерживается. Откройте его в подходящей версии игры.')
  }
  if (typeof envelope.savedAt !== 'string' || !Number.isFinite(Date.parse(envelope.savedAt))) throw new Error('Некорректная дата сохранения.')
  const balanceVersion = finite(envelope.balanceVersion ?? (envelope.schemaVersion === 0 ? 1 : undefined), 'версия баланса', 1)
  if (!Number.isInteger(balanceVersion)) throw new Error('Некорректная версия баланса.')
  let game = record(envelope.game, 'компания')
  // Backfill everything the save predates: new systems default to their initial values.
  const initial = createInitialGame()
  game = {
    ...initial,
    ...game,
    orders: game.orders === undefined ? initial.orders : game.orders,
    orderSeq: game.orderSeq === undefined ? initial.orderSeq : game.orderSeq,
    model: { ...initial.model, ...(typeof game.model === 'object' && game.model !== null ? game.model : {}) },
    benchmark: { ...initial.benchmark, ...(typeof game.benchmark === 'object' && game.benchmark !== null ? game.benchmark : {}) },
    contracts: { ...initial.contracts, ...(typeof game.contracts === 'object' && game.contracts !== null ? game.contracts : {}) },
    competitor: { ...initial.competitor, ...(typeof game.competitor === 'object' && game.competitor !== null ? game.competitor : {}) },
    team: { ...initial.team, ...(typeof game.team === 'object' && game.team !== null ? game.team : {}) },
    market: { ...initial.market, ...(typeof game.market === 'object' && game.market !== null ? game.market : {}) },
    investors: { ...initial.investors, ...(typeof game.investors === 'object' && game.investors !== null ? game.investors : {}) },
  }
  if (envelope.schemaVersion === 0) {
    game = { ...game, totalCapex: game.totalCapex ?? 0, milestones: game.milestones ?? initial.milestones }
  }
  // Add only the two newly introduced sites to otherwise complete legacy saves.
  if (Array.isArray(game.locations) && game.locations.length === 5) {
    const legacyIds = ['garage', 'workshop', 'technopark', 'server-hall', 'campus']
    const ids = game.locations.map(value => record(value, 'локация').id)
    if (legacyIds.every(id => ids.includes(id)) && new Set(ids).size === 5) {
      game = { ...game, locations: [...game.locations, { id: 'dc-north', owned: false, servers: 0 }, { id: 'dc-south', owned: false, servers: 0 }] }
    }
  }
  const validated = validateGameState(game)
  if (envelope.schemaVersion !== SAVE_VERSION) {
    validated.locations = migrateGridLocations(validated.locations)
    validated.regionLocations = migrateGridLocations(validated.regionLocations)
  }
  return { schemaVersion: SAVE_VERSION, balanceVersion, savedAt: envelope.savedAt, game: validated }
}

export function makeSaveEnvelope(game: GameState): SaveEnvelope {
  return { schemaVersion: SAVE_VERSION, balanceVersion: BALANCE_VERSION, savedAt: new Date().toISOString(), game: validateGameState(game) }
}

export function parseSaveText(text: string): SaveEnvelope {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('Файл сохранения не является корректным JSON.') }
  return decodeSave(value)
}

let connection: Promise<IDBPDatabase<SaveDatabase>> | null = null

function database() {
  if (!connection) {
    connection = openDB<SaveDatabase>(DATABASE_NAME, 1, {
      upgrade(db) { db.createObjectStore('saves') },
      blocking() { void connection?.then((db) => db.close()); connection = null },
      terminated() { connection = null },
    }).catch((error: unknown) => { connection = null; throw error })
  }
  return connection
}

export async function saveGame(game: GameState): Promise<string> {
  const envelope = makeSaveEnvelope(game)
  const db = await database()
  await db.put('saves', envelope, 'main')
  return envelope.savedAt
}

export async function loadGame(): Promise<SaveEnvelope | null> {
  const db = await database()
  const value = await db.get('saves', 'main')
  return value === undefined ? null : decodeSave(value)
}
