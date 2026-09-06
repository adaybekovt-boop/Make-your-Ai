from pathlib import Path
import subprocess

# Temporary source migration. Removed after its generated source commit is validated.
if 'export const USERS_PER_COMPUTE = 220' in Path('src/systems/config.ts').read_text():
    raise SystemExit('Economy source migration already applied.')
expected = {
 'src/systems/config.ts': '7f6e787eb0a8ffd44df73ef232cc134c2e98eed0',
 'src/systems/types.ts': 'f5e153fc267ab611bad42fc63c66ae4c4225a990',
 'src/systems/economy.ts': '9634f1b04c3eff2078743f66ac8b6ab73212c0a3',
 'src/systems/simulation.ts': '5e447b3b0087ad15dd7d7dbf5b424de3e854a69f',
 'src/systems/training.ts': '24e5ea5edd12f01297f6dcea7385e2841f0c0e30',
 'src/systems/market.ts': '1485bbff0a87991a85612e100f1b7189c4e34018',
 'src/systems/daily.ts': 'f6807b15b79fb24a816a787bbf0d678db9a9c09e',
 'src/systems/economy.test.ts': '3dadde8ecfaeae5db23455a7df635d11e32abd51',
 'src/systems/simulation.test.ts': 'dfc103437e498b180cb11ba2e74eb7f760b66902',
 'src/ui/App.tsx': 'ee66c5491db114a222e2baea261610a2e1fbdb32',
 'src/ui/InteriorScreen.tsx': '496630da6b86f33d9c3be7f209241ad12a2d19a6',
 'src/ui/LocationCard.tsx': 'ff1db52ce3892eb8386fb65be4d3ff2718ab5791',
}
for path, sha in expected.items():
    actual = subprocess.check_output(['git', 'hash-object', path], text=True).strip()
    assert actual == sha, f'Unexpected source revision: {path}: {actual}'
files = {path: Path(path).read_text() for path in expected}
def replace(path, old, new, count=1):
    assert files[path].count(old) == count, f'Unexpected match count in {path}: {old!r}'
    files[path] = files[path].replace(old, new)

replace('src/systems/config.ts', 'export const USERS_PER_COMPUTE = 40', 'export const USERS_PER_COMPUTE = 220')
replace('src/systems/config.ts', 'export const REVENUE_PER_COMPUTE_HOUR = 960\n', '')
replace('src/systems/types.ts', 'export interface CompanyEconomy {\n', '''export interface CompanyEconomy {
  /** Actual token + subscription revenue, for reporting only; never an extra payment. */
  serverRevenuePerHour: number
  propertyRevenuePerHour: number
  propertyExpensesPerHour: number
  salariesPerHour: number
''')
files['src/systems/economy.ts'] = '''import { CHASSIS, ELECTRICITY_PRICE_PER_KWH, SERVER } from './config'
import { firstFreeCell, locationDefinition, locationEquipment } from './serverGrid'
import { cityPropertyEconomy } from './city'
import { regionElectricityMult, seasonalityMult, subscriptionPerHour, tokenRevenuePerHour, userCapacity } from './market'
import { salariesPerHour } from './team'
import { orderPrice } from './procurement'
import type { CompanyEconomy, GameState, LocationEconomy, LocationState } from './types'

export function calculatePowerBalance(demandKw: number, capacityKw: number): { suppliedKw: number; efficiency: number } {
  if (!Number.isFinite(demandKw) || demandKw < 0) throw new RangeError('Power demand must be finite and nonnegative.')
  if (!Number.isFinite(capacityKw) || capacityKw < 0) throw new RangeError('Power capacity must be finite and nonnegative.')
  return { suppliedKw: Math.min(demandKw, capacityKw), efficiency: demandKw === 0 ? 1 : Math.min(1, capacityKw / demandKw) }
}

/** Physical output and costs only. No direct conversion of compute into money. */
function infrastructure(location: LocationState, electricityMult: number): LocationEconomy {
  const definition = locationDefinition(location.id)
  const equipment = location.owned ? locationEquipment(location) : { demandKw: 0, compute: 0, maintenancePerHour: 0 }
  const { suppliedKw, efficiency } = calculatePowerBalance(equipment.demandKw, definition.powerLimitKw)
  const electricityPerHour = suppliedKw * ELECTRICITY_PRICE_PER_KWH * electricityMult
  const rentPerHour = location.owned ? definition.rentPerHour : 0
  const expensesPerHour = electricityPerHour + equipment.maintenancePerHour + rentPerHour
  return {
    demandKw: equipment.demandKw, suppliedKw, efficiency, effectiveCompute: equipment.compute * efficiency,
    revenuePerHour: 0, electricityPerHour, maintenancePerHour: equipment.maintenancePerHour,
    rentPerHour, expensesPerHour, profitPerHour: -expensesPerHour,
  }
}

function companyCompute(state: GameState): number {
  return [...state.locations, ...state.regionLocations].reduce((sum, location) => sum + infrastructure(location, 1).effectiveCompute, 0)
}

/** Without company context there is no audience revenue to attribute. */
export function calculateLocationEconomy(
  location: LocationState,
  electricityMult = regionElectricityMult(location.id),
  state?: GameState,
): LocationEconomy {
  const result = infrastructure(location, electricityMult * (state ? seasonalityMult(state) : 1))
  const totalCompute = state ? companyCompute(state) : 0
  const revenuePerHour = state && totalCompute > 0
    ? (tokenRevenuePerHour(state) + subscriptionPerHour(state)) * result.effectiveCompute / totalCompute
    : 0
  return { ...result, revenuePerHour, profitPerHour: revenuePerHour - result.expensesPerHour }
}

/** Recurring company cash rates; daily and one-off events are posted separately. */
export function calculateCompanyEconomy(state: GameState): CompanyEconomy {
  const totals: CompanyEconomy = {
    serverRevenuePerHour: tokenRevenuePerHour(state) + subscriptionPerHour(state),
    propertyRevenuePerHour: 0, propertyExpensesPerHour: 0, salariesPerHour: salariesPerHour(state),
    revenuePerHour: 0, electricityPerHour: 0, maintenancePerHour: 0, rentPerHour: 0,
    expensesPerHour: 0, profitPerHour: 0, demandKw: 0, suppliedKw: 0, capacityKw: 0,
    effectiveCompute: 0, serverCount: 0, ownedCount: 0,
  }
  for (const location of [...state.locations, ...state.regionLocations]) {
    const local = infrastructure(location, regionElectricityMult(location.id) * seasonalityMult(state))
    totals.electricityPerHour += local.electricityPerHour
    totals.maintenancePerHour += local.maintenancePerHour
    totals.rentPerHour += local.rentPerHour
    totals.demandKw += local.demandKw
    totals.suppliedKw += local.suppliedKw
    totals.effectiveCompute += local.effectiveCompute
    if (location.owned) {
      totals.capacityKw += locationDefinition(location.id).powerLimitKw
      totals.serverCount += location.servers + (location.racks?.reduce((sum, rack) => sum + rack.count, 0) ?? 0)
      totals.ownedCount += 1
    }
  }
  const property = cityPropertyEconomy(state)
  totals.propertyRevenuePerHour = property.revenuePerHour
  totals.propertyExpensesPerHour = property.expensesPerHour
  totals.revenuePerHour = totals.serverRevenuePerHour + totals.propertyRevenuePerHour
  totals.expensesPerHour = totals.electricityPerHour + totals.maintenancePerHour + totals.rentPerHour + totals.propertyExpensesPerHour + totals.salariesPerHour
  totals.profitPerHour = totals.revenuePerHour - totals.expensesPerHour
  return totals
}

/**
 * Conditional steady-state forecast for one additional official Terra T1/basic kit.
 * Excludes delivery time and the audience ramp from the nominal payback. It is NOT
 * an immediate revenue increase, and does not promise that placement is possible.
 */
export function calculateServerROI(location: LocationState, state: GameState) {
  const current = infrastructure(location, regionElectricityMult(location.id) * seasonalityMult(state))
  const equipment = locationEquipment(location)
  const definition = locationDefinition(location.id)
  const nextPower = calculatePowerBalance(equipment.demandKw + SERVER.powerKw, definition.powerLimitKw)
  const deltaCompute = (equipment.compute + SERVER.compute) * nextPower.efficiency - current.effectiveCompute
  const deltaCosts = SERVER.maintenancePerHour + (nextPower.suppliedKw - current.suppliedKw) * ELECTRICITY_PRICE_PER_KWH * regionElectricityMult(location.id) * seasonalityMult(state)
  // Temporary downtime and promotional boosts are not perpetual revenue sources.
  const stable: GameState = {
    ...state, model: { ...state.model, offlineUntil: null },
    benchmark: { ...state.benchmark, adBoostUntil: null },
    market: { ...state.market, viralUntil: null, ambientBoostUntil: null, ambientPenaltyUntil: null },
  }
  const revenueAtCapacity = (effectiveCompute: number): number => {
    const projected = { ...stable, users: userCapacity(stable, { effectiveCompute }) }
    return tokenRevenuePerHour(projected) + subscriptionPerHour(projected)
  }
  const compute = companyCompute(state)
  const incrementalProfitPerHour = revenueAtCapacity(compute + deltaCompute) - revenueAtCapacity(compute) - deltaCosts
  const capitalCost = orderPrice(SERVER.price, 'official', 1) + orderPrice(CHASSIS['rack-basic'].price, 'official', 1)
  return {
    forecast: 'steady-state' as const,
    capitalCost,
    installable: location.owned && firstFreeCell(location) !== null && equipment.demandKw + SERVER.powerKw <= definition.powerLimitKw,
    immediateProfitPerHour: -deltaCosts,
    incrementalProfitPerHour,
    paybackHours: incrementalProfitPerHour > 0 ? capitalCost / incrementalProfitPerHour : null,
  }
}
'''
replace('src/systems/market.ts', 'economy: CompanyEconomy): number {', "economy: Pick<CompanyEconomy, 'effectiveCompute'>): number {")
replace('src/systems/market.ts', 'state.model.iq >= 110 && state.totalRevenue >= 1_500_000', 'state.model.iq >= ACQUISITION_IQ_THRESHOLD && state.totalRevenue >= ACQUISITION_REVENUE_THRESHOLD')
replace('src/systems/daily.ts', 'next = dailyInvestors(next, economy, rng)', 'next = dailyInvestors(next, calculateCompanyEconomy(next), rng)')
replace('src/systems/training.ts', "import { pushNotice, reduceFine } from './market'", "import { isModelOnline, pushNotice, reduceFine } from './market'")
replace('src/systems/training.ts', '/** Consume queue volume against available compute; finish and roll poisoning when done. */', '''/** Shared by training and chronological simulation segmentation. */
export function trainingRate(state: GameState, effectiveCompute: number): number {
  if (!isModelOnline(state) || effectiveCompute <= 0) return 0
  return effectiveCompute * TRAINING_VOLUME_PER_COMPUTE_HOUR * (state.team.overwork ? OVERWORK_TRAINING_BONUS : 1)
}

/** Consume queue volume against available compute; finish and roll poisoning when done. */''')
replace('src/systems/training.ts', '''  const overwork = state.team.overwork ? OVERWORK_TRAINING_BONUS : 1
  const processed = Math.min(model.run.remaining, effectiveCompute * TRAINING_VOLUME_PER_COMPUTE_HOUR * overwork * hours)''', '''  const processed = Math.min(model.run.remaining, trainingRate(state, effectiveCompute) * hours)''')
replace('src/systems/simulation.ts', "import { salariesPerHour } from './team'\n", '')
replace('src/systems/simulation.ts', "import { tickTraining } from './training'", "import { tickTraining, trainingRate } from './training'")
start = files['src/systems/simulation.ts'].index('export function advanceSimulation(')
end = files['src/systems/simulation.ts'].index('/** True when the model serves users', start)
files['src/systems/simulation.ts'] = files['src/systems/simulation.ts'][:start] + '''/** Advance chronologically; never run several daily hooks at the final timestamp. */
export function advanceSimulation(state: GameState, realSeconds: number, rng: Rng = Math.random): GameState {
  if (state.paused || state.ending || !Number.isFinite(realSeconds) || realSeconds <= 0) return state
  const hours = realSeconds * state.speed * GAME_HOURS_PER_REAL_SECOND
  const target = state.elapsedGameHours + hours
  if (!Number.isFinite(target) || target <= state.elapsedGameHours) return state
  let next = state
  while (next.elapsedGameHours < target) {
    const now = next.elapsedGameHours
    const dayBoundary = (Math.floor((now + 8) / 24) + 1) * 24 - 8
    // Cooling uses elapsed days, whereas the visible day starts at 08:00.
    const coolingBoundary = (Math.floor(now / 24) + 1) * 24
    const economy = calculateCompanyEconomy(next)
    const rate = trainingRate(next, economy.effectiveCompute)
    let until = Math.min(target, dayBoundary, coolingBoundary)
    const splitAt = (time: number | null) => {
      if (time !== null && Number.isFinite(time) && time > now && time < until) until = time
    }
    splitAt(next.model.offlineUntil)
    for (const order of next.orders) splitAt(order.arriveAt)
    if (next.model.run && rate > 0) splitAt(now + next.model.run.remaining / rate)
    const interval = until - now
    if (!(interval > 0)) throw new RangeError('Simulation time cannot advance at this numeric precision.')

    // serverRevenuePerHour is a reporting field, not a second source of cash.
    const revenuePerHour = economy.propertyRevenuePerHour + tokenRevenuePerHour(next) + subscriptionPerHour(next)
    const revenue = revenuePerHour * interval
    const expenses = economy.expensesPerHour * interval
    next = {
      ...next, cash: next.cash + revenue - expenses,
      totalRevenue: next.totalRevenue + revenue,
      totalExpenses: next.totalExpenses + expenses,
    }
    // Evaluate online/offline at the interval START, not its end.
    next = tickTraining(next, interval, economy.effectiveCompute, rng)
    next = { ...next, elapsedGameHours: until }
    next = deliverOrders(next, rng)
    if (next.benchmark.testing && next.model.offlineUntil !== null && until >= next.model.offlineUntil) {
      next = { ...next, benchmark: { ...next.benchmark, testing: false } }
    }
    if (until === dayBoundary) next = processDailySystems(next, rng)
  }
  const earnedRevenue = state.milestones.earnedRevenue || next.totalRevenue > state.totalRevenue
  const experiencedThrottle = state.milestones.experiencedThrottle || [...next.locations, ...next.regionLocations].some((location) => {
    if (!location.owned) return false
    const limit = location.id === 'overseas-west' || location.id === 'overseas-east'
      ? getRegionLocationDefinition(location.id).location.powerLimitKw
      : getLocationDefinition(location.id).powerLimitKw
    return locationEquipment(location).demandKw > limit
  })
  return { ...next, milestones: { ...next.milestones, earnedRevenue, experiencedThrottle } }
}

''' + files['src/systems/simulation.ts'][end:]

# Update the existing assertions, rather than removing the tests that exposed the old model.
p = 'src/systems/economy.test.ts'
replace(p, "const garage = (servers = 0): LocationState => ({ id: 'garage', owned: true, servers })", "const garage = (servers = 0): LocationState => ({ id: 'garage', owned: true, servers })\nconst withGarage = (location: LocationState) => { const state = createInitialGame(); state.locations[0] = location; return state }")
replace(p, 'one garage GPU earns 754 net per game hour', 'one garage GPU with no audience costs 206 per game hour')
replace(p, 'revenuePerHour: 960', 'revenuePerHour: 0')
replace(p, 'profitPerHour: 754', 'profitPerHour: -206')
replace(p, 'revenuePerHour: 1440', 'revenuePerHour: 0')
replace(p, 'profitPerHour: 1126', 'profitPerHour: -314')
replace(p, 'expect(result.profitPerHour).toBe(1126 + 674)', 'expect(result.profitPerHour).toBe(-314 - 286)')
replace(p, "it('first server excludes already committed rent and location CAPEX'", "it('first server forecast excludes committed rent, but includes the official rack/chip kit'")
replace(p, 'calculateServerROI(garage())).toEqual({ incrementalProfitPerHour: 834, paybackHours: 2000 / 834 })', "calculateServerROI(garage(), withGarage(garage()))).toMatchObject({ forecast: 'steady-state', capitalCost: 4800, immediateProfitPerHour: -126, incrementalProfitPerHour: 138, paybackHours: 4800 / 138 })")
replace(p, 'calculateServerROI(garage(1))).toEqual({ incrementalProfitPerHour: 372, paybackHours: 2000 / 372 })', 'calculateServerROI(garage(1), withGarage(garage(1)))).toMatchObject({ installable: false, immediateProfitPerHour: -108, incrementalProfitPerHour: 24, paybackHours: 4800 / 24 })')
replace(p, 'calculateServerROI(garage(2))).toEqual({ incrementalProfitPerHour: -90, paybackHours: null })', 'calculateServerROI(garage(2), withGarage(garage(2)))).toMatchObject({ incrementalProfitPerHour: -90, paybackHours: null })')
p = 'src/systems/simulation.test.ts'
replace(p, 'one real minute earns one hour of operating profit after mounting', 'one real minute incurs costs but earns nothing before the first users arrive')
replace(p, 'expect(next.totalRevenue).toBe(960)', 'expect(next.totalRevenue).toBe(0)')
replace(p, 'expect(next.cash).toBe(game.cash + 754)', 'expect(next.cash).toBe(game.cash - 206)')

# UI reads the actual audience allocation, including regional/seasonal electricity.
for p in ['src/ui/LocationCard.tsx', 'src/ui/InteriorScreen.tsx']:
    replace(p, 'calculateLocationEconomy(location)', 'calculateLocationEconomy(location, undefined, game)')
p = 'src/ui/LocationCard.tsx'
replace(p, "import { money, percent } from './format'", "import { money, percent, signedMoney } from './format'")
replace(p, '<button className="primary-button" onClick={onBuilding}>', '<p className="card-note" data-testid="location-profit">Прибыль локации: {signedMoney(economy.profitPerHour)}/ч · выручка от аудитории: {money(economy.revenuePerHour)}/ч.</p><button className="primary-button" onClick={onBuilding}>')
p = 'src/ui/InteriorScreen.tsx'
replace(p, 'import { calculateLocationEconomy }', 'import { calculateLocationEconomy, calculateServerROI }')
replace(p, "import { money, percent, quantity } from './format'", "import { money, percent, quantity, signedMoney } from './format'")
replace(p, '  const blocked = !ready', '  const roi = location ? calculateServerROI(location, game) : null\n  const blocked = !ready')
replace(p, '    <div className="interior-workspace">', '''    <details className="interior-economy">
      <summary>Экономика комнаты · {signedMoney(economy?.profitPerHour ?? 0)}/ч</summary>
      <p data-testid="interior-profit">Выручка от аудитории: {money(economy?.revenuePerHour ?? 0)}/ч. Расходы помещения: {money(economy?.expensesPerHour ?? 0)}/ч.</p>
      <p>Доля пользовательской выручки пропорциональна вычислениям этой комнаты. Арендный доход башен и зарплаты учитываются отдельно на уровне компании.</p>
      {roi && <p data-testid="roi-forecast">Прогноз дополнительного Terra T1 после разгона аудитории: {signedMoney(roi.incrementalProfitPerHour)}/ч. Немедленно: {signedMoney(roi.immediateProfitPerHour)}/ч, без новых пользователей. Официальный комплект со стойкой: {money(roi.capitalCost)}. Условная окупаемость при устойчивой аудитории: {roi.paybackHours === null ? 'не окупается' : `${quantity(roi.paybackHours)} ч`}. Время доставки и убытки разгона в этот срок не включены. {!roi.installable && 'Сейчас для установки не хватает свободной ячейки или мощности сети.'}</p>}
    </details>
    <div className="interior-workspace">''')
p = 'src/ui/App.tsx'
replace(p, '<span>Выручка в час</span>', '<span>Регулярная выручка в час</span>')
replace(p, '<div><span>Электричество ·', '<div><span>Токены и подписки</span><strong>+{money(economy.serverRevenuePerHour)}</strong></div><div><span>Аренда башен — доход</span><strong>+{money(economy.propertyRevenuePerHour)}</strong></div><div><span>Электричество ·')
replace(p, '<div className="summary-total"><span>Чистая прибыль в час</span>', '<div><span>Эксплуатация башен</span><strong>−{money(economy.propertyExpensesPerHour)}</strong></div><div><span>Зарплаты</span><strong>−{money(economy.salariesPerHour)}</strong></div><div className="summary-total"><span>Текущая прибыль в час</span>')
replace(p, '</div></div><h3>За всё время</h3>', '</div></div><p className="card-note">Суточные и разовые события, включая лицензии и контракты, проводятся отдельно. Установка сервера расширяет ёмкость аудитории, но не создаёт мгновенную выручку.</p><h3>За всё время</h3>')

files['src/systems/economy-regression.test.ts'] = '''import { describe, expect, it } from 'vitest'
import { CHIPS, GAME_HOURS_PER_REAL_SECOND, LICENSE_PAYOUT_PER_DAY, SEASON_SUMMER_MULT, SUMMER_START_DAY } from './config'
import { calculateCompanyEconomy, calculateLocationEconomy, calculateServerROI } from './economy'
import { buyCityTower } from './city'
import { gameDay, subscriptionPerHour, tokenRevenuePerHour, userCapacity } from './market'
import { mountChassisFromInventory, mountChipFromInventory, orderServerKit } from './procurement'
import { advanceSimulation, buyLocation, createInitialGame } from './simulation'
import type { ActionResult, ChassisId, ChipId, GameState, LocationId, Personality, Rng } from './types'

const safe: Rng = () => 0.99
function unwrap(result: ActionResult): GameState { if (!result.ok) throw new Error(result.error); return result.state }
const advanceHours = (state: GameState, hours: number, rng: Rng = safe) => advanceSimulation(state, hours / (state.speed * GAME_HOURS_PER_REAL_SECOND), rng)
function startKit(chip: ChipId = 'consumer-gpu', chassis: ChassisId = 'rack-basic', id: LocationId = 'garage', cash = 12000, personality: Personality | null = null) {
  let state = createInitialGame()
  state = { ...state, cash, model: { ...state.model, personality } }
  state = unwrap(buyLocation(state, id))
  state = unwrap(orderServerKit(state, { locationId: id, chip, chassis, channel: 'official', qty: 1, targetCell: { row: 0, col: 0 } }))
  const arrival = Math.max(...state.orders.map(order => order.arriveAt))
  state = advanceHours(state, arrival - state.elapsedGameHours)
  expect(state.orders).toHaveLength(0)
  expect(state.locations.find(location => location.id === id)?.servers).toBe(0)
  state = unwrap(mountChassisFromInventory(state, id, { row: 0, col: 0 }, chassis, safe))
  return unwrap(mountChipFromInventory(state, id, { row: 0, col: 0 }, chip, safe))
}
function seeded(seed: number): Rng { let value = seed >>> 0; return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32 } }
const rounded = (state: GameState) => JSON.parse(JSON.stringify(state, (_key, value: unknown) => typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value)) as unknown

describe('real procurement and audience revenue', () => {
  it('an installed server with zero users loses money in both the UI model and cash posting', () => {
    const state = startKit()
    expect(state.cash).toBe(5220)
    expect(state.users).toBe(0)
    expect(calculateCompanyEconomy(state)).toMatchObject({ serverRevenuePerHour: 0, revenuePerHour: 0, profitPerHour: -206 })
    expect(calculateLocationEconomy(state.locations[0], undefined, state).profitPerHour).toBe(-206)
    const next = advanceHours(state, 1)
    expect(next.cash).toBe(state.cash - 206)
    expect(next.totalRevenue).toBe(0)
  })
  it.each([null, 'friendly', 'raw'] as const)('survives the full $12,000 start, official delivery and audience ramp: %s', personality => {
    let state = startKit('consumer-gpu', 'rack-basic', 'garage', 12000, personality)
    let minimumCash = state.cash, firstPositiveHour: number | null = null
    const observations: Array<{ hour: number; users: number; revenue: number }> = []
    for (let hour = 0; hour < 80; hour++) {
      state = advanceHours(state, 1)
      minimumCash = Math.min(minimumCash, state.cash)
      const economy = calculateCompanyEconomy(state)
      if (economy.profitPerHour > 0 && firstPositiveHour === null) firstPositiveHour = state.elapsedGameHours
      if ((state.elapsedGameHours + 8) % 24 === 0) observations.push({ hour: state.elapsedGameHours, users: state.users, revenue: economy.serverRevenuePerHour })
      expect(economy.serverRevenuePerHour).toBeCloseTo(tokenRevenuePerHour(state) + subscriptionPerHour(state))
    }
    expect(minimumCash).toBeGreaterThan(0)
    expect(firstPositiveHour).not.toBeNull()
    expect(firstPositiveHour!).toBeGreaterThan(6)
    for (let i = 1; i < observations.length; i++) expect(observations[i].revenue).toBeGreaterThan(observations[i - 1].revenue)
    expect(state.users).toBeLessThan(userCapacity(state, calculateCompanyEconomy(state)))
    console.log('START_BALANCE', JSON.stringify({ personality, minimumCash, firstPositiveHour, observations }))
  })
  it.each([
    ['consumer-gpu', 'rack-basic', 'garage', 12000],
    ['pro-gpu', 'rack-basic', 'workshop', 30000],
    ['accelerator', 'rack-cooled', 'technopark', 100000],
    ['flagship', 'rack-enterprise', 'campus', 400000],
  ] as const)('staged viability uses actual delivery and mounting: %s', (chip, chassis, id, capital) => {
    let state = startKit(chip, chassis, id, capital)
    const initial = calculateCompanyEconomy(state)
    expect(initial.serverRevenuePerHour).toBe(0)
    expect(initial.profitPerHour).toBeLessThan(0)
    let minimumCash = state.cash
    for (let hour = 0; hour < 120; hour++) { state = advanceHours(state, 1); minimumCash = Math.min(minimumCash, state.cash) }
    const economy = calculateCompanyEconomy(state)
    expect(minimumCash).toBeGreaterThan(0)
    expect(economy.profitPerHour).toBeGreaterThan(0)
    console.log('CHIP_STAGE', JSON.stringify({ chip: CHIPS[chip].name, location: id, stageCapital: capital, minimumCash, profitPerHour: economy.profitPerHour }))
  })
})

describe('revenue channels and allocation', () => {
  it('preserves legitimate rent even without users and while the model is offline', () => {
    let state = createInitialGame()
    state = unwrap(buyCityTower({ ...state, cash: 50000 }, 'meridian'))
    state = { ...state, model: { ...state.model, offlineUntil: 10 } }
    expect(calculateCompanyEconomy(state)).toMatchObject({ serverRevenuePerHour: 0, propertyRevenuePerHour: 360, propertyExpensesPerHour: 80, revenuePerHour: 360, profitPerHour: 280 })
    expect(advanceHours(state, 1).cash).toBe(state.cash + 280)
  })
  it('allocates only actual user revenue, not property income, by effective compute', () => {
    const state = createInitialGame()
    state.users = 150
    state.cityProperties = ['meridian']
    state.locations[0] = { id: 'garage', owned: true, servers: 1 }
    state.locations[1] = { id: 'workshop', owned: true, servers: 2 }
    const company = calculateCompanyEconomy(state)
    expect(company).toMatchObject({ serverRevenuePerHour: 240, propertyRevenuePerHour: 360, revenuePerHour: 600 })
    expect(calculateLocationEconomy(state.locations[0], undefined, state).revenuePerHour).toBe(80)
    expect(calculateLocationEconomy(state.locations[1], undefined, state).revenuePerHour).toBe(160)
    const allocated = state.locations.reduce((sum, location) => sum + calculateLocationEconomy(location, undefined, state).revenuePerHour, 0)
    expect(allocated).toBe(company.serverRevenuePerHour)
    const next = advanceHours(state, 1)
    expect(next.totalRevenue - state.totalRevenue).toBe(600)
    expect(next.cash - state.cash).toBe(company.profitPerHour)
  })
  it('counts payroll exactly once in both company profit and cash', () => {
    const state = startKit()
    state.team.employees = [{ id: 1, role: 'engineer', salaryPerHour: 90, hiredDay: 1 }]
    expect(calculateCompanyEconomy(state)).toMatchObject({ salariesPerHour: 90, profitPerHour: -296 })
    expect(advanceHours(state, 1).cash).toBe(state.cash - 296)
  })
  it('has a finite zero allocation when no compute exists', () => {
    const state = createInitialGame()
    expect(calculateLocationEconomy(state.locations[0], undefined, state).revenuePerHour).toBe(0)
  })
  it('labels ROI as a steady-state kit forecast and separates its negative immediate effect', () => {
    const state = createInitialGame()
    state.locations[0] = { id: 'garage', owned: true, servers: 0 }
    const roi = calculateServerROI(state.locations[0], state)
    expect(roi).toMatchObject({ forecast: 'steady-state', capitalCost: 4800, installable: true, immediateProfitPerHour: -126, incrementalProfitPerHour: 138 })
    expect(roi.paybackHours).toBeCloseTo(4800 / 138)
    expect(state.users).toBe(0)
  })
})

describe('chronological multi-day simulation', () => {
  it('posts each crossed daily license payout once at the actual boundary', () => {
    const state = createInitialGame()
    state.model.licensed = true
    const next = advanceHours(state, 16 + 6 * 24)
    expect(gameDay(next)).toBe(8)
    expect(next.totalRevenue).toBe(7 * LICENSE_PAYOUT_PER_DAY)
    expect(next.competitor.samples).toHaveLength(8)
    expect(advanceHours(next, 1).totalRevenue).toBe(next.totalRevenue)
  })
  it.each([1, 3] as const)('one 15-day call equals hourly calls, including real daily events and RNG ordering, at %s×', speed => {
    const state = { ...startKit(), speed }
    state.model.run = { total: 500, remaining: 500, poisonedChance: 0.1, usedUnofficial: false }
    const single = advanceHours(structuredClone(state), 360, seeded(42))
    let many = structuredClone(state)
    const rng = seeded(42)
    for (let hour = 0; hour < 360; hour++) many = advanceHours(many, 1, rng)
    expect(rounded(single)).toEqual(rounded(many))
  })
  it('splits model downtime instead of billing or training retroactively', () => {
    const state = startKit()
    state.users = 100
    state.model.offlineUntil = state.elapsedGameHours + 3
    state.model.run = { total: 100, remaining: 100, poisonedChance: 0, usedUnofficial: false }
    const next = advanceHours(state, 5)
    expect(next.totalRevenue - state.totalRevenue).toBe(2 * 160)
    expect(next.model.run?.remaining).toBe(96)
  })
  it('splits a cooling season change even though it is not a visible day boundary', () => {
    const state = startKit()
    state.elapsedGameHours = SUMMER_START_DAY * 24 - 1
    const next = advanceHours(state, 2)
    expect(next.totalExpenses - state.totalExpenses).toBeCloseTo(2 * (80 + 90) + 36 * (1 + SEASON_SUMMER_MULT))
  })
})
'''
files['src/ui/styles.css'] = Path('src/ui/styles.css').read_text() + '\n.interior-economy { padding: 10px 24px; background: #f5f7f8; color: #263238; font-size: 13px; border-bottom: 1px solid #dce3e7; }\n.interior-economy summary { cursor: pointer; font-weight: 600; }\n.interior-economy p { max-width: 1100px; line-height: 1.55; }\n'
for path, content in files.items():
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
print('Updated source files:', *files, sep='\n')
