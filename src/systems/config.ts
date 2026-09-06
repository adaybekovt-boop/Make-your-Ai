import type { ChassisDefinition, ChassisId, Channel, ChipId, ChipRack, LocationDefinition, RegionDefinition, ServerDefinition } from './types'

export const BALANCE_VERSION = 1
export const STARTING_CASH = 12_000
export const GAME_HOURS_PER_REAL_SECOND = 1 / 60
export const ELECTRICITY_PRICE_PER_KWH = 18
export const REVENUE_PER_COMPUTE_HOUR = 960
export const MAX_SERVERS_PER_LOCATION = 100

export const SERVER: ServerDefinition = {
  id: 'consumer-gpu',
  name: 'Terra T1',
  price: 2_000,
  powerKw: 2,
  maintenancePerHour: 90,
  compute: 1,
  resaleRatio: 0.6,
}

export const CHIPS: Record<ChipId, ServerDefinition> = {
  'consumer-gpu': SERVER,
  'pro-gpu': {
    id: 'pro-gpu',
    name: 'Titan X9',
    price: 6_000,
    powerKw: 3,
    maintenancePerHour: 180,
    compute: 2.4,
    resaleRatio: 0.65,
  },
  accelerator: {
    id: 'accelerator',
    name: 'Helios HC',
    price: 15_000,
    powerKw: 6,
    maintenancePerHour: 420,
    compute: 6,
    resaleRatio: 0.7,
  },
  flagship: {
    id: 'flagship',
    name: 'Zenith Z1',
    price: 40_000,
    powerKw: 9,
    maintenancePerHour: 900,
    compute: 14,
    resaleRatio: 0.7,
  },
}

export const CHIP_PRICE_SWING = 0.2

// ---------- Шасси и закупка оборудования ----------
export const CHASSIS: Record<ChassisId, ChassisDefinition> = {
  'rack-basic': {
    id: 'rack-basic', name: 'Базовая стойка', price: 1_000,
    chips: ['consumer-gpu', 'pro-gpu'], failRiskMult: 1, computeMult: 1,
    delivery: { official: 6, grey: 2 },
  },
  'rack-cooled': {
    id: 'rack-cooled', name: 'Стойка с охлаждением', price: 5_000,
    chips: ['consumer-gpu', 'pro-gpu', 'accelerator'], failRiskMult: 0.85, computeMult: 1,
    delivery: { official: 8, grey: 3 },
  },
  'rack-enterprise': {
    id: 'rack-enterprise', name: 'Энтерпрайз-стойка', price: 20_000,
    chips: ['consumer-gpu', 'pro-gpu', 'accelerator', 'flagship'],
    failRiskMult: 0.75, computeMult: 1.10,
    delivery: { official: 12, grey: 4 },
  },
}
export const CHANNEL_MULT: Record<Channel, number> = { official: 1.6, grey: 1.1 }
export const GREY_DEFECT_CHANCE = 0.08
export const BULK_DISCOUNT_STEP = 0.05
export const BULK_DISCOUNT_MAX = 0.2
export const MAX_ORDER_QTY = 24
export const CHIP_DELIVERY_HOURS: Record<ChipId, Record<Channel, number>> = {
  'consumer-gpu': { official: 6, grey: 2 },
  'pro-gpu': { official: 8, grey: 2 },
  accelerator: { official: 10, grey: 3 },
  flagship: { official: 12, grey: 4 },
}
export const BASE_CHIP_FAIL_CHANCE_DAILY = 0.002
export const EQUIPMENT_CLEANUP_RATIO = 0.15
// Days per price cycle per chip class, so markets do not move in lockstep.
export const CHIP_PRICE_PERIOD_DAYS: Record<ChipId, number> = {
  'consumer-gpu': 9,
  'pro-gpu': 13,
  accelerator: 17,
  flagship: 21,
}

export const LOCATIONS: LocationDefinition[] = [
  {
    id: 'garage', gridSize: { rows: 3, cols: 3 }, name: 'Гараж', district: '01 / СТАРТОВЫЙ КВАРТАЛ',
    description: 'У каждой большой идеи есть маленькое начало. Дешёвая аренда, скромная электросеть — идеальное место для первого сервера.',
    price: 1_500, powerLimitKw: 3, rentPerHour: 80,
    polygon: [110, 355, 245, 326, 333, 373, 316, 493, 182, 521, 98, 455],
    center: { x: 213, y: 417 },
  },
  {
    id: 'workshop', gridSize: { rows: 4, cols: 4 }, name: 'Мастерская', district: '02 / РЕМЕСЛЕННЫЙ КВАРТАЛ',
    description: 'Бывшая мастерская с усиленной проводкой. Достаточно мощности, чтобы небольшой стартап встал на ноги.',
    price: 6_500, powerLimitKw: 8, rentPerHour: 160,
    polygon: [96, 158, 253, 119, 353, 175, 321, 288, 215, 308, 99, 267],
    center: { x: 224, y: 215 },
  },
  {
    id: 'technopark', gridSize: { rows: 5, cols: 5 }, name: 'Технопарк', district: '03 / ИННОВАЦИОННЫЙ КЛАСТЕР',
    description: 'Готовая инфраструктура для растущего вычислительного парка. Место, где прототип становится компанией.',
    price: 18_000, powerLimitKw: 18, rentPerHour: 320,
    polygon: [390, 218, 519, 173, 635, 248, 607, 374, 470, 401, 375, 336],
    center: { x: 504, y: 290 },
  },
  {
    id: 'server-hall', gridSize: { rows: 6, cols: 6 }, name: 'Серверный цех', district: '04 / ПРОМЫШЛЕННАЯ ЗОНА',
    description: 'Просторный цех на выделенной линии электропитания. Крупный шаг требует стабильного денежного потока.',
    price: 48_000, powerLimitKw: 40, rentPerHour: 700,
    polygon: [430, 458, 604, 411, 723, 463, 679, 579, 519, 604, 407, 543],
    center: { x: 562, y: 511 },
  },
  {
    id: 'campus', gridSize: { rows: 8, cols: 8 }, name: 'Кампус', district: '05 / СЕВЕРНЫЙ БЕРЕГ',
    description: 'Собственная площадка на другом берегу. Самая мощная локация этого прототипа и пространство для будущего роста.',
    price: 120_000, powerLimitKw: 90, rentPerHour: 1_500,
    polygon: [709, 124, 828, 97, 931, 178, 903, 322, 776, 354, 678, 273],
    center: { x: 808, y: 221 },
  },
]

LOCATIONS.push(
  { id: 'dc-north', gridSize: { rows: 8, cols: 8 }, name: 'Северный дата-центр', district: '06 / СЕВЕРНЫЙ ПРОМЫШЛЕННЫЙ ПАРК', description: 'Загородный вычислительный комплекс с собственной подстанцией и резервным охлаждением.', price: 220_000, powerLimitKw: 150, rentPerHour: 2_200, polygon: [], center: { x: 0, y: 0 } },
  { id: 'dc-south', gridSize: { rows: 8, cols: 8 }, name: 'Южный дата-центр', district: '07 / ЮЖНЫЙ ПРОМЫШЛЕННЫЙ ПАРК', description: 'Большая площадка у кольцевой дороги: мощная электросеть для расширения вашей инфраструктуры.', price: 320_000, powerLimitKw: 220, rentPerHour: 3_200, polygon: [], center: { x: 0, y: 0 } },
)

export function getLocationDefinition(id: LocationDefinition['id']): LocationDefinition {
  const location = LOCATIONS.find((item) => item.id === id)
  if (!location) throw new Error(`Unknown location: ${id}`)
  return location
}

export const REGIONS: RegionDefinition[] = [
  {
    id: 'overseas',
    name: 'Заморский регион',
    description: 'Дешёвая земля и дорогая электроэнергия. Рынок растёт, но и риски исков выше — местные законы суровее.',
    unlockCost: 250_000,
    electricityMult: 1.25,
    courtRiskMult: 1.5,
    locations: [
      {
        id: 'overseas-west', gridSize: { rows: 6, cols: 6 }, name: 'Западная площадка',
        description: 'Бывший склад у глубоководного порта. Дешёвый старт в новом регионе.',
        price: 90_000, powerLimitKw: 60, rentPerHour: 900,
      },
      {
        id: 'overseas-east', gridSize: { rows: 8, cols: 8 }, name: 'Восточная площадка',
        description: 'Свежая площадка под крупный парк. Требует своего резерва мощности.',
        price: 210_000, powerLimitKw: 120, rentPerHour: 1_900,
      },
    ],
  },
]

export function getRegion(id: string): RegionDefinition {
  const region = REGIONS.find((item) => item.id === id)
  if (!region) throw new Error(`Unknown region: ${id}`)
  return region
}

export function getRegionLocationDefinition(id: string) {
  for (const region of REGIONS) {
    const location = region.locations.find((item) => item.id === id)
    if (location) return { region, location }
  }
  throw new Error(`Unknown region location: ${id}`)
}

// ---------- Данные и обучение ----------
export const DATA_LOT_OFFICIAL = { volume: 100, price: 14_000 }
export const DATA_LOT_UNOFFICIAL = { volume: 100, price: 5_000 }
export const TRAINING_IQ_PER_VOLUME = 0.06
export const TRAINING_VOLUME_PER_COMPUTE_HOUR = 2
export const POISON_BASE_CHANCE = 0.02
export const POISON_UNOFFICIAL_SHARE_CHANCE = 0.25
export const INFECTED_DAILY_CHANCE = 0.08
export const MALWARE_DOWNTIME_HOURS = 6
export const MALWARE_REPAIR_COST = 15_000
export const MALWARE_REPUTATION_HIT = 12

// ---------- Тестирование GMI ----------
export const BENCHMARK_COST = 100_000
export const BENCHMARK_OFFLINE_HOURS = 5
export const GMI_NOISE = 0.1
export const CHEAT_TOKEN_PENALTY = 0.2
export const CHEAT_GMI_BONUS = 0.3
export const CHEAT_EXPOSURE_DAILY_CHANCE = 0.15
export const CHEAT_EXPOSURE_REPUTATION_HIT = 25
export const GMI_BOOST_THRESHOLD = 75
export const GMI_AD_BOOST = 0.25
export const GMI_AD_BOOST_HOURS = 72
export const GMI_CATEGORIES = [
  { id: 'reasoning', label: 'Reasoning', weight: 1.0 },
  { id: 'coding', label: 'Coding', weight: 1.1 },
  { id: 'safety', label: 'Safety', weight: 0.9 },
  { id: 'multimodal', label: 'Multimodal', weight: 0.8 },
] as const

// ---------- Репутация ----------
export const REPUTATION_MIN = 0
export const REPUTATION_MAX = 100

// ---------- Пользователи, токены, реклама ----------
export const USERS_PER_COMPUTE = 40
export const USER_GROWTH_PER_DAY = 0.5
export const TOKEN_REVENUE_PER_USER_HOUR = 1.2
export const SUBSCRIPTION_PER_USER_HOUR = 0.4
export const TOKEN_PRICE_DEFAULT = 100
export const TOKEN_PRICE_MIN = 50
export const TOKEN_PRICE_MAX = 200
export const TOKEN_PRICE_LOW_THRESHOLD = 80
export const USERS_OFFLINE_DECAY_PER_DAY = 0.25
export const AD_DAILY_COST = 3_000
export const AD_USER_BOOST = 0.5
export const RETENTION_FRIENDLY = 1.15
export const RETENTION_RAW = 0.95
export const RAW_TOKEN_BONUS = 0.1
export const OPEN_SOURCE_IQ_THRESHOLD = 70
export const OPEN_SOURCE_TOKEN_PENALTY = 0.25

// ---------- Конкурент ----------
export const COMPETITOR_START = 10
export const COMPETITOR_BASE_GROWTH = 0.6
export const COMPETITOR_COMPOUND = 0.02
export const COMPETITOR_LOW_PRICE_PRESSURE = 0.35
export const COMPETITOR_ADS_PRESSURE = 0.2
export const COMPETITOR_GMI_DRAG = 0.3
export const COMPETITOR_GMI_DRAG_THRESHOLD = 80
export const COMPETITOR_REPUTATION_DRAG = 0.15
export const COMPETITOR_REPUTATION_DRAG_THRESHOLD = 60
export const COMPETITOR_SAMPLES_MAX = 60
export const ESPIONAGE_COST = 25_000
export const ESPIONAGE_SUCCESS_CHANCE = 0.5
export const ESPIONAGE_REVEAL_HOURS = 48
export const ESPIONAGE_FAIL_REPUTATION = 6

// ---------- Контракты ----------
export const CONTRACT_INTERVAL_MIN_DAYS = 3
export const CONTRACT_INTERVAL_MAX_DAYS = 7
export const CONTRACT_OFFICIAL_PAYOUT = 60_000
export const CONTRACT_GREY_MULTIPLIER = 1.8
export const CONTRACT_ENTERPRISE_PAYOUT = 120_000
export const CONTRACT_DIRTY_DAYS = 5
export const CONTRACT_NO_CHEAT_DAYS = 10
export const CONTRACT_EXPIRY_DAYS = 2
export const CONTRACT_OFFICIAL_REPUTATION_MIN = 35
export const CONTRACT_GREY_REPUTATION_MAX = 65
export const CONTRACT_FULFILLED_REPUTATION = 5
export const CONTRACT_BREACH_REPUTATION = 10
export const ENTERPRISE_TECH_REQUIREMENT: Extract<import('./types').TechNodeId, 'context'> = 'context'

// ---------- Команда ----------
export const HIRE_COST: Record<'safety' | 'engineer', number> = { safety: 9_000, engineer: 7_000 }
export const SALARY_PER_HOUR: Record<'safety' | 'engineer', number> = { safety: 120, engineer: 90 }
export const MORALE_RECOVER_PER_DAY = 6
export const OVERWORK_MORALE_DRAIN_PER_DAY = 12
export const OVERWORK_TRAINING_BONUS = 1.5
export const LOW_MORALE_QUIT_CHANCE = 0.15
export const LOW_MORALE_THRESHOLD = 30
export const MAX_EMPLOYEES = 12

// ---------- Случайные события и риски ----------
export const RANDOM_EVENT_DAILY_CHANCE = 0.3
export const FIRE_COST = 5_000
export const FIRE_REPUTATION_HIT = 3
export const VIRAL_HOURS = 36
export const VIRAL_USER_MULT = 2.5
export const COURT_FINE = 35_000
export const COURT_REPUTATION_HIT = 20
export const COURT_DAILY_CHANCE = 0.05
export const COMPLAINT_FINE = 2_500
export const COMPLAINT_REPUTATION_HIT = 4
export const COMPLAINT_DAILY_CHANCE = 0.2
export const PROMPT_INJECTION_DAILY_CHANCE = 0.03
export const PROMPT_INJECTION_SAFETY_FACTOR = 0.6
export const PROMPT_INJECTION_DOWNTIME_HOURS = 3
export const PROMPT_INJECTION_COST = 8_000
export const PROMPT_INJECTION_REPUTATION_HIT = 6
export const DATA_LEAK_FINE = 20_000
export const DATA_LEAK_REPUTATION_HIT = 10
export const HALLUCINATION_REPUTATION_HIT = 8

// ---------- Сезонность ----------
export const GAME_YEAR_DAYS = 360
// A run starts in spring (day index 0), so day one bills electricity at its base price.
export const SUMMER_START_DAY = 80
export const SUMMER_END_DAY = 170
export const WINTER_START_DAY = 260
export const WINTER_END_DAY = GAME_YEAR_DAYS
export const SEASON_SUMMER_MULT = 1.15
export const SEASON_WINTER_MULT = 0.9

// ---------- Страхование ----------
export const INSURANCE_DAILY_PREMIUM = 1_200
export const INSURANCE_COVERAGE = 0.4

// ---------- Инвесторы ----------
export const INVESTOR_CHECK_INTERVAL_DAYS = 10
export const INVESTOR_FIRST_CHECK_DAY = 10
export const INVESTOR_TARGET_PROFIT_PER_HOUR = 2_500
export const INVESTOR_TARGET_IQ = 60
export const INVESTOR_PAYOUT_RATIO = 0.1
export const INVESTOR_RESTRICTION_HOURS = 48

// ---------- Ambient GMI ----------
export const AMBIENT_GMI_MIN_INTERVAL_DAYS = 4
export const AMBIENT_GMI_MAX_INTERVAL_DAYS = 8
export const AMBIENT_WIN_USER_BOOST = 0.15
export const AMBIENT_LOSS_PENALTY = 0.08
export const AMBIENT_EFFECT_HOURS = 72
export const AMBIENT_WIN_REPUTATION = 2
export const AMBIENT_LOSS_REPUTATION = -2

// ---------- Лицензирование ----------
export const LICENSE_IQ_THRESHOLD = 80
export const LICENSE_PAYOUT_PER_DAY = 2_500
export const LICENSE_VOICE_MULTIPLIER = 1.5

// ---------- Технологическое дерево ----------
export interface TechNodeDefinition {
  id: import('./types').TechNodeId
  name: string
  description: string
  iqThreshold: number
  cost: number
}

export const TECH_NODES: TechNodeDefinition[] = [
  {
    id: 'context',
    name: 'Длинный контекст',
    description: 'Корпоративные клиенты с длинными документами. Открывает энтерпрайз-контракты, +15% к ёмкости аудитории.',
    iqThreshold: 60,
    cost: 150_000,
  },
  {
    id: 'multimodal',
    name: 'Мультимодальность',
    description: 'Картинки и документы в подписке: ставка подписки ×1.3, +25% к ёмкости аудитории.',
    iqThreshold: 90,
    cost: 300_000,
  },
  {
    id: 'voice',
    name: 'Голос',
    description: 'Голосовой канал для партнёров: лицензии ×1.5, +10% к ёмкости аудитории.',
    iqThreshold: 120,
    cost: 500_000,
  },
]

// ---------- Поглощение ----------
export const ACQUISITION_IQ_THRESHOLD = 110
export const ACQUISITION_REVENUE_THRESHOLD = 1_500_000
export const ACQUISITION_OFFER = 2_500_000

export function rackCompute(racks: ChipRack[] | undefined): number {
  return (racks ?? []).reduce((sum, rack) => {
    const chip = CHIPS[rack.chip]
    return sum + rack.count * chip.compute
  }, 0)
}

export function rackPower(racks: ChipRack[] | undefined): number {
  return (racks ?? []).reduce((sum, rack) => sum + rack.count * CHIPS[rack.chip].powerKw, 0)
}

export function rackMaintenance(racks: ChipRack[] | undefined): number {
  return (racks ?? []).reduce((sum, rack) => sum + rack.count * CHIPS[rack.chip].maintenancePerHour, 0)
}

export function rackCount(racks: ChipRack[] | undefined): number {
  return (racks ?? []).reduce((sum, rack) => sum + rack.count, 0)
}
