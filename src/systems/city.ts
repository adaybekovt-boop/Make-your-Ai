import type { ActionResult, GameState } from './types'

export const CITY_TOWERS = [
  { id: 'meridian', name: 'Башня «Меридиан»', district: 'Деловой квартал', price: 45_000, rentPerHour: 360, upkeepPerHour: 80, floors: 18, description: 'Небольшая офисная башня. Покупка открывает стабильный арендный доход без нагрузки на вашу серверную сеть.' },
  { id: 'horizon', name: 'Башня «Горизонт»', district: 'Центральный проспект', price: 120_000, rentPerHour: 1_000, upkeepPerHour: 240, floors: 32, description: 'Офисы технологических компаний у центрального проспекта. Доход от арендаторов поступает каждый игровой час.' },
  { id: 'orbit', name: 'Башня «Орбита»', district: 'Деловой квартал', price: 280_000, rentPerHour: 2_600, upkeepPerHour: 650, floors: 46, description: 'Флагман делового района с общественной площадью. Крупная инвестиция с отдельными расходами на эксплуатацию.' },
] as const

export type CityTowerId = typeof CITY_TOWERS[number]['id']
export const CHIP_SHOPS = [
  { id: 'silicon-market', name: 'Кремний · магазин чипов', description: 'Комплектующие для вашей сети. Выберите класс чипа и площадку — магазин доставит и установит сервер сразу.' },
  { id: 'chip-depot', name: 'Чип-депо', description: 'Поставка ускорителей и графических станций. Цены общие для городского рынка и обновляются каждый игровой день.' },
] as const
export type ChipShopId = typeof CHIP_SHOPS[number]['id']
export type CityObjectId = CityTowerId | ChipShopId

export function cityPropertyEconomy(state: Pick<GameState, 'cityProperties'>) {
  const owned = new Set(state.cityProperties ?? [])
  let revenuePerHour = 0
  let expensesPerHour = 0
  for (const tower of CITY_TOWERS) {
    if (!owned.has(tower.id)) continue
    revenuePerHour += tower.rentPerHour
    expensesPerHour += tower.upkeepPerHour
  }
  return { revenuePerHour, expensesPerHour, profitPerHour: revenuePerHour - expensesPerHour }
}

export function buyCityTower(state: GameState, id: CityTowerId): ActionResult {
  const tower = CITY_TOWERS.find((item) => item.id === id)
  if (!tower) return { ok: false, error: 'Такого здания нет в продаже.' }
  if (state.ending) return { ok: false, error: 'Компания уже продана.' }
  if (state.investors.restrictedUntil !== null && state.elapsedGameHours < state.investors.restrictedUntil) return { ok: false, error: 'Совет директоров временно ограничил крупные покупки.' }
  if ((state.cityProperties ?? []).includes(id)) return { ok: false, error: 'Это здание уже принадлежит вашей компании.' }
  if (state.cash < tower.price) return { ok: false, error: 'Пока недостаточно средств для покупки здания.' }
  return {
    ok: true,
    state: { ...state, cash: state.cash - tower.price, totalCapex: state.totalCapex + tower.price, cityProperties: [...(state.cityProperties ?? []), id] },
  }
}
