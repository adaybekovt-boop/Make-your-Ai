import { useState } from 'react'
import { CHASSIS, CHIPS, MAX_ORDER_QTY } from '../systems/config'
import { bulkDiscount, chassisSupports, deliveryHours, orderPrice } from '../systems/procurement'
import { normalizeLocation, sameCell } from '../systems/serverGrid'
import { purchasesRestricted } from '../systems/market'
import type { Channel, ChassisId, ChipId } from '../systems/types'
import { useGameStore } from '../store/gameStore'
import { Modal } from './Modal'
import { money } from './format'

function countdown(hours: number) {
  const minutes = Math.max(0, Math.ceil(hours * 60))
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`
}

export function ProcurementModal() {
  const { game, procurement: request, ready, notice } = useGameStore()
  const [chassis, setChassis] = useState<ChassisId>('rack-basic')
  const [chip, setChip] = useState<ChipId>('consumer-gpu')
  const [channel, setChannel] = useState<Channel>('official')
  const [qty, setQty] = useState(1)
  const [kind, setKind] = useState<'kit' | 'chassis' | 'chip'>('kit')
  if (!request) return null
  const found = [...game.locations, ...game.regionLocations].find((item) => item.id === request.locationId)
  if (!found) return null
  const location = normalizeLocation(found)
  const position = request.position
  const server = location.installedServers.find((item) => sameCell(item.gridPosition, position))
  const rig = location.rigs?.find((item) => sameCell(item.gridPosition, position))
  const existingChassis = server?.chassis ?? rig?.chassis
  const selectedChassis = existingChassis ?? chassis
  const mode = existingChassis ? 'chip' : kind
  const choices = (Object.keys(CHIPS) as ChipId[]).filter((id) => chassisSupports(selectedChassis, id) && (!server || CHIPS[id].compute > CHIPS[server.chip].compute))
  const selectedChip = choices.includes(chip) ? chip : choices[0]
  const chipCost = selectedChip ? orderPrice(CHIPS[selectedChip].price, channel, qty) : 0
  const rackCost = orderPrice(CHASSIS[chassis].price, channel, qty)
  const price = mode === 'kit' ? chipCost + rackCost : mode === 'chip' ? chipCost : rackCost
  const invalid = !Number.isInteger(qty) || qty < 1 || qty > MAX_ORDER_QTY || (mode !== 'chassis' && !selectedChip)
  const blocked = !ready || !!game.ending
  const orders = game.orders.filter((item) => item.locationId === location.id)
  const actions = useGameStore.getState()
  const stock = location.inventory ?? { chips: {}, chassis: {} }
  return <Modal title={server ? 'Апгрейд чипа' : 'Закупка и монтаж'} onClose={actions.closeProcurement}>
    <div className="procurement-flow">
      <div className="equipment-preview"><img src={`${import.meta.env.BASE_URL}models/racks/${selectedChassis}.png`} alt={CHASSIS[selectedChassis].name} /><div><span className="card-caption">Ваша конфигурация</span><h3>{mode === 'chassis' ? 'Пустая стойка' : selectedChip ? CHIPS[selectedChip].name : 'Выберите модуль'}</h3><p>{CHASSIS[selectedChassis].name}</p><small>Стойка — корпус и охлаждение.<br />Модуль — вычислительная мощность.</small></div></div>
      <ol className="procurement-steps"><li><b>01</b> Закажите</li><li><b>02</b> Дождитесь доставки</li><li><b>03</b> Установите со склада</li></ol>
      <p className="card-description">После доставки установите сначала стойку, затем вычислительный модуль{position ? ` · ячейка ${position.row + 1}, ${position.col + 1}` : ''}</p>
      {existingChassis ? <p>{CHASSIS[existingChassis].name} уже установлена. Оплачивается только чип. {server && 'После апгрейда прежний исправный чип вернётся на склад.'}</p> : <>
        <label>Что заказать<select aria-label="Состав заказа" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="kit">Полный комплект сервера</option><option value="chassis">Пустая стойка</option><option value="chip">Вычислительный модуль на склад</option></select></label>
        <label>Стойка (корпус сервера)<select aria-label="Шасси" value={chassis} onChange={(event) => setChassis(event.target.value as ChassisId)}>{Object.values(CHASSIS).map((item) => <option key={item.id} value={item.id}>{item.name} · база {money(item.price)}</option>)}</select></label>
      </>}
      <p className="card-note">{CHASSIS[selectedChassis].failRiskMult < 1 ? `Риск отказа −${Math.round((1 - CHASSIS[selectedChassis].failRiskMult) * 100)}%. ` : ''}{selectedChassis === 'rack-enterprise' ? 'Вычисления +10%. ' : ''}Поддерживает: {CHASSIS[selectedChassis].chips.map((id) => CHIPS[id].name).join(', ')}.</p>
      {mode !== 'chassis' && <label>Вычислительный модуль<select aria-label="Чип" value={selectedChip ?? ''} onChange={(event) => setChip(event.target.value as ChipId)}>{!choices.length && <option value="">Нет совместимых улучшений</option>}{choices.map((id) => <option key={id} value={id}>{CHIPS[id].name} · база {money(CHIPS[id].price)} · {CHIPS[id].powerKw} кВт</option>)}</select></label>}
      <label>Канал закупки<select aria-label="Канал закупки" value={channel} onChange={(event) => setChannel(event.target.value as Channel)}><option value="official">Официальный · ×1.6 · без дополнительного брака</option><option value="grey">Серый импорт · ×1.1 · 8% брака при монтаже</option></select></label>
      <label>Количество<input aria-label="Количество" type="number" min={1} max={MAX_ORDER_QTY} value={qty} onChange={(event) => setQty(Number(event.target.value))} /></label>
      <p>Оптовая скидка: {Math.round(bulkDiscount(qty) * 100)}% · {mode !== 'chip' && `шасси ${deliveryHours('chassis', chassis, channel)} ч`}{mode === 'kit' && ' · '}{mode !== 'chassis' && selectedChip && `чип ${deliveryHours('chip', selectedChip, channel)} ч`}</p>
      <button className="primary-button wide" disabled={blocked || purchasesRestricted(game) || invalid || game.cash < price} onClick={() => {
        if (mode === 'kit' && position && selectedChip) actions.orderKit({ locationId: location.id, chassis, chip: selectedChip, channel, qty, targetCell: position })
        else actions.orderEquipment({ locationId: location.id, kind: mode === 'chassis' ? 'chassis' : 'chip', item: mode === 'chassis' ? chassis : selectedChip!, channel, qty, ...(server ? { targetServerId: server.id } : {}) })
      }}>Оплатить заказ <span>{invalid ? '—' : money(price)}</span></button>
      {game.cash < price && <p className="text-warm">Недостаточно средств.</p>}
      {purchasesRestricted(game) && <p className="text-warm">Совет директоров временно ограничил закупки.</p>}
      {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
      <section aria-label="Заказы в пути"><h3>В пути · {orders.length}</h3>{orders.length ? orders.map((order) => <p key={order.id} className="procurement-order">{order.kind === 'chip' ? CHIPS[order.item as ChipId].name : CHASSIS[order.item as ChassisId].name} ×{order.qty}<strong>В пути · {countdown(order.arriveAt - game.elapsedGameHours)}</strong><small>{order.channel === 'grey' ? 'Серый импорт' : 'Официальный'} · оплачено {money(order.paid)}</small></p>) : <p className="card-note">Ожидаемых доставок нет.</p>}{game.paused && orders.length > 0 && <button className="secondary-button" onClick={actions.togglePause}>Продолжить время для доставки</button>}</section>
      <section aria-label="Склад локации"><h3>Доставленное оборудование</h3><p className="card-note">{existingChassis ? 'Стойка установлена. Выберите совместимый модуль ниже.' : 'Начните с установки стойки; затем станет доступна установка модуля.'}</p>
        {(Object.keys(CHASSIS) as ChassisId[]).filter((id) => (stock.chassis[id] ?? 0) > 0).map((id) => <div className="procurement-stock" key={id}><span>{CHASSIS[id].name} ×{stock.chassis[id]}<small>Серый импорт: {stock.greyChassis?.[id] ?? 0}</small></span><button className="secondary-button" disabled={blocked || !position || !!existingChassis} onClick={() => position && actions.mountChassis(location.id, position, id)}>1. Установить стойку</button></div>)}
        {(Object.keys(CHIPS) as ChipId[]).filter((id) => (stock.chips[id] ?? 0) > 0).map((id) => <div className="procurement-stock" key={id}><span>{CHIPS[id].name} ×{stock.chips[id]}<small>Серый импорт: {stock.greyChips?.[id] ?? 0}</small></span><button className="secondary-button" disabled={blocked || !position || !existingChassis || !chassisSupports(existingChassis, id) || !!server && CHIPS[id].compute <= CHIPS[server.chip].compute} onClick={() => position && actions.mountChip(location.id, position, id)}>{server ? 'Заменить чип' : '2. Установить модуль'}</button></div>)}
        {!Object.values(stock.chips).some(Boolean) && !Object.values(stock.chassis).some(Boolean) && <p className="card-note">Склад пуст. Оборудование появится здесь после доставки.</p>}
        <p className="card-note">Монтаж со склада без повторной оплаты. Проверенное оборудование используется первым. При браке списывается утилизация; исправный старый чип сохраняется.</p>
      </section>
    </div>
  </Modal>
}
