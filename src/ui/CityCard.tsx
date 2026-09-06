import { useLayoutEffect, useRef, useState } from 'react'
import { CHIP_SHOPS, CITY_TOWERS, type CityObjectId, type CityTowerId } from '../systems/city'
import { CHIPS, LOCATIONS, rackCount } from '../systems/config'
import { purchasesRestricted } from '../systems/market'
import { useGameStore } from '../store/gameStore'
import { placeCard, type MapProjection, type ScreenPoint } from '../render/mapPresentation'
import type { ChipId, LocationId } from '../systems/types'
import { orderPrice, deliveryHours } from '../systems/procurement'
import { Icon } from './Icon'
import { money } from './format'

export function CityCard({ id, anchor, projection, onClose }: { id: CityObjectId; anchor: ScreenPoint; projection: MapProjection; onClose: () => void }) {
  const game = useGameStore((state) => state.game)
  const ready = useGameStore((state) => state.ready)
  const tower = CITY_TOWERS.find((item) => item.id === id)
  const shop = CHIP_SHOPS.find((item) => item.id === id)
  const [targetId, setTargetId] = useState<LocationId | ''>('')
  const [message, setMessage] = useState('')
  const element = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 340, height: 480 })
  useLayoutEffect(() => {
    if (!element.current) return
    const node = element.current
    const observer = new ResizeObserver(() => setSize({ width: node.offsetWidth, height: node.offsetHeight }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const owned = (game.cityProperties ?? []).includes(id as CityTowerId)
  const ownedLocations = game.locations.filter((item) => item.owned)
  const destination = ownedLocations.find((item) => item.id === targetId) ?? ownedLocations[0]
  const position = placeCard(anchor, size, projection, projection.buildings.filter((item) => item.visible).map((item) => item.bounds))
  const restricted = purchasesRestricted(game) || !!game.ending

  return <div ref={element} role="dialog" aria-label={tower?.name ?? shop?.name} className="location-card city-card" data-testid={`city-card-${id}`} style={{ left: position.x, top: position.y }} onPointerDown={(event) => event.stopPropagation()}>
    <div className="card-heading"><div><span className="card-caption">{tower ? tower.district : 'Городской рынок · доставка в технопарк'}</span><h2>{tower?.name ?? shop?.name}</h2></div><button className="icon-button close-card" aria-label="Закрыть карточку" onClick={onClose}><Icon name="close" size={16} /></button></div>
    <p className="card-description">{tower?.description ?? shop?.description}</p>
    {tower ? <>
      {owned && <span className="status-pill city-owned">Здание вашей компании</span>}
      <div className="card-facts"><span>Арендный доход<strong>{money(tower.rentPerHour)}/ч</strong></span><span>Эксплуатация<strong>{money(tower.upkeepPerHour)}/ч</strong></span><span>Чистая прибыль<strong className="text-green">+{money(tower.rentPerHour - tower.upkeepPerHour)}/ч</strong></span><span>Окупаемость<strong>{Math.ceil(tower.price / (tower.rentPerHour - tower.upkeepPerHour))} игр. ч</strong></span></div>
      {!owned && <button className="primary-button" disabled={!ready || restricted || game.cash < tower.price} onClick={() => useGameStore.getState().purchaseCityTower(tower.id)}>Купить небоскрёб<span>{money(tower.price)}</span></button>}
      <p className="card-note">{restricted ? 'Крупные покупки сейчас недоступны.' : !owned && game.cash < tower.price ? `Для покупки нужно ещё ${money(tower.price - game.cash)}.` : owned ? 'Аренда зачисляется автоматически. Владение сохраняется вместе с компанией.' : 'Здание сдаётся под офисы. Серверная инфраструктура остаётся в технопарке за городом.'}</p>
    </> : <>
      <label className="delivery-label" htmlFor={`destination-${id}`}>Склад доставки</label>
      <select id={`destination-${id}`} aria-label="Площадка для доставки чипа" className="delivery-select" value={destination?.id ?? ''} onChange={(event) => { setTargetId(event.target.value as LocationId); setMessage('') }} disabled={!ownedLocations.length}>
        {!ownedLocations.length && <option value="">Сначала купите площадку в технопарке</option>}
        {ownedLocations.map((location) => <option key={location.id} value={location.id}>{LOCATIONS.find((item) => item.id === location.id)?.name ?? location.id} · {location.servers + rackCount(location.racks)} серверов</option>)}
      </select>
      <div className="store-catalog">{(Object.keys(CHIPS) as ChipId[]).map((chip) => {
        const product = CHIPS[chip]
        const price = orderPrice(product.price, 'official', 1)
        return <div className="store-product" key={chip}><div className="store-product-heading"><Icon name="server" size={21} /><div><strong>{product.name.replace('GPU', 'Gpu')}</strong><small>{product.compute} вычисл. · {product.powerKw} кВт · {money(product.maintenancePerHour)}/ч</small></div></div><button className="secondary-button" aria-label={`Купить ${product.name}`} disabled={!ready || !destination || restricted || game.cash < price} onClick={() => {
          if (!destination) return
          const before = useGameStore.getState().game
          useGameStore.getState().orderEquipment({ locationId: destination.id, kind: 'chip', item: chip, channel: 'official', qty: 1 })
          if (useGameStore.getState().game !== before) setMessage(`${product.name.replace('GPU', 'Gpu')} заказан, доставка через ${deliveryHours('chip', chip, 'official')} ч на склад: ${LOCATIONS.find((item) => item.id === destination.id)?.name}.`)
        }}>Заказать у официала <span>{money(price)}</span></button></div>
      })}</div>
      {message && <p className="delivery-success" role="status">{message}</p>}
      <p className="card-note">{restricted ? 'Совет директоров временно ограничил покупки.' : 'Чип поступит на склад после доставки. Для монтажа нужна совместимая стойка. Выбор канала, опт и статус заказа — по клику на ячейку в интерьере.'}</p>
    </>}
  </div>
}
