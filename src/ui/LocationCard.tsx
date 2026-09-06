import { useLayoutEffect, useRef, useState } from 'react'
import { getLocationDefinition } from '../systems/config'
import { calculateLocationEconomy } from '../systems/economy'
import { useGameStore } from '../store/gameStore'
import { placeCard, type MapProjection, type MapSelection, type ScreenPoint } from '../render/mapPresentation'
import type { LocationId } from '../systems/types'
import { Icon } from './Icon'
import { money, percent, signedMoney } from './format'

export function LocationCard({ selection, anchor, projection, onClose, onBuilding }: { selection: MapSelection; anchor: ScreenPoint; projection: MapProjection; onClose: () => void; onBuilding: () => void }) {
  const game = useGameStore((state) => state.game); const ready = useGameStore((state) => state.ready)
  const location = game.locations.find((item) => item.id === selection.id)!
  const definition = getLocationDefinition(selection.id as LocationId); const economy = calculateLocationEconomy(location, undefined, game)
  const element = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ width: 272, height: 300 })
  useLayoutEffect(() => { if (!element.current) return; const node = element.current; const observer = new ResizeObserver(() => setSize({ width: node.offsetWidth, height: node.offsetHeight })); observer.observe(node); return () => observer.disconnect() }, [])
  const point = placeCard(anchor, size, projection, projection.buildings.filter((item) => item.visible).map((item) => item.bounds))
  return <div ref={element} className={`location-card ${selection.kind === 'power' ? 'power-card' : ''}`} role="dialog" aria-label={definition.name} style={{ left: point.x, top: point.y }}>
    <div className="card-heading"><div><span className="card-caption">{location.owned ? 'Ваша серверная' : 'Будущая серверная'}</span><h2>{definition.name}</h2></div><button className="icon-button" aria-label="Закрыть карточку" onClick={onClose}><Icon name="close" size={16} /></button></div>
    {location.owned ? <><p className="card-description">{selection.kind === 'power' ? `Серверы работают на ${percent(economy.efficiency)} мощности. В интерьере можно снизить разгон или продать лишнее оборудование.` : 'Площадка куплена. Расставляйте серверы в ячейках внутри помещения.'}</p><p className="card-note" data-testid="location-profit">Прибыль локации: {signedMoney(economy.profitPerHour)}/ч · выручка от аудитории: {money(economy.revenuePerHour)}/ч.</p><button className="primary-button" onClick={onBuilding}>Войти в интерьер<Icon name="arrow" size={16} /></button></> : <><p className="card-description">{definition.description}</p><div className="card-facts"><span>Сетка помещения<strong>{definition.gridSize.rows} × {definition.gridSize.cols}</strong></span><span>Энергосеть<strong>{definition.powerLimitKw} кВт</strong></span><span>Аренда<strong>{money(definition.rentPerHour)}/ч</strong></span></div><button className="primary-button" disabled={!ready || game.cash < definition.price} onClick={() => useGameStore.getState().purchaseLocation(selection.id as LocationId)}>Купить локацию<span>{money(definition.price)}</span></button><p className="card-note">{game.cash < definition.price ? `Нужно ещё ${money(definition.price - game.cash)}.` : 'После покупки войдите в интерьер, чтобы разместить первый сервер.'}</p></>}
  </div>
}
