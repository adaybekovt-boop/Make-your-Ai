import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { RegionMap } from '../render/RegionMap'
import { type MapProjection, type MapSelection } from '../render/mapPresentation'
import { LOCATIONS } from '../systems/config'
import { CHIP_SHOPS, CITY_TOWERS, type CityObjectId } from '../systems/city'
import { installedChips } from '../systems/serverSlots'
import { CityCard } from './CityCard'
import type { LocationId } from '../systems/types'
import { calculateLocationEconomy } from '../systems/economy'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'
import { LocationCard } from './LocationCard'
import { money, percent, serversText } from './format'

export interface MapControls { zoomBy: (factor: number) => void; resetView: () => void; closeCard: () => void }

export const MapView = forwardRef<MapControls, { onEnterInterior: (id: LocationId) => void }>(function MapView({ onEnterInterior }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<RegionMap | null>(null)
  const selectionRef = useRef<MapSelection | null>(null)
  const [selection, setSelection] = useState<MapSelection | null>(null)
  const [hoveredPower, setHoveredPower] = useState<string | null>(null)
  const [projection, setProjection] = useState<MapProjection>({ width: 0, height: 0, buildings: [] })
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const game = useGameStore((state) => state.game)
  const ready = useGameStore((state) => state.ready)

  const select = useCallback((next: MapSelection | null) => {
    selectionRef.current = next
    setSelection(next)
    setHoveredPower(null)
    if (next && LOCATIONS.some((item) => item.id === next.id)) useGameStore.getState().selectLocation(next.id as LocationId)
    map.current?.update(useGameStore.getState().game, next?.id ?? null)
  }, [])
  const chooseBuilding = useCallback((id: MapSelection['id'] | null) => {
    const owned = useGameStore.getState().game.locations.find((item) => item.id === id && item.owned)
    if (owned) { select(null); onEnterInterior(owned.id as LocationId); return }
    select(id && selectionRef.current?.id !== id ? { id, kind: 'building' } : null)
  }, [select, onEnterInterior])

  useImperativeHandle(ref, () => ({
    zoomBy: (factor) => map.current?.zoomBy(factor),
    resetView: () => { select(null); map.current?.resetView() },
    closeCard: () => select(null),
  }), [select])

  useEffect(() => {
    if (!host.current) return
    let cancelled = false
    let instance: RegionMap | null = null
    let unsubscribe = () => {}
    const element = host.current
    import('../render/RegionMap')
      .then(({ RegionMap }) => cancelled ? null : RegionMap.create(element, chooseBuilding, (next) => { if (!cancelled) setProjection(next) }))
      .then((created) => {
        if (!created) return
        if (cancelled) return created.destroy()
        instance = created
        map.current = created
        created.update(useGameStore.getState().game, null)
        unsubscribe = useGameStore.subscribe((next) => created.update(next.game, selectionRef.current?.id ?? null))
        setMapReady(true)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось запустить карту.')
      })
    return () => {
      cancelled = true
      unsubscribe()
      instance?.destroy()
      if (map.current === instance) map.current = null
    }
  }, [chooseBuilding])

  useEffect(() => { if (!ready) select(null) }, [ready, select])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') select(null) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [select])

  const selectedProjection = selection ? projection.buildings.find((item) => item.id === selection.id) : undefined
  const selectedLocation = selection ? game.locations.find((item) => item.id === selection.id) : undefined
  const anchor = selectedProjection && selection ? selection.kind === 'power' ? selectedProjection.warning : selectedProjection.roof : null

  return <main className="map-viewport" aria-label="Карта компании" onKeyDown={(event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === '+' || event.key === '=') map.current?.zoomBy(1.2)
    if (event.key === '-') map.current?.zoomBy(1 / 1.2)
    if (event.key === 'Home') map.current?.resetView()
  }} tabIndex={0}>
    <div className="map-host" ref={host} aria-label="Город и загородный технопарк" />
    <div className="map-object-layer" aria-label="Объекты на карте">
      {projection.buildings.map((building) => {
        if (!building.visible) return null
        const cityTower = CITY_TOWERS.find((item) => item.id === building.id)
        const cityShop = CHIP_SHOPS.find((item) => item.id === building.id)
        if (cityTower || cityShop) {
          const owned = game.cityProperties?.some((id) => id === building.id)
          const title = cityTower?.name ?? cityShop!.name
          return <div key={building.id} className="map-object" data-location={building.id}>
            <button className="building-hotspot" aria-label={`Здание «${title}»`} aria-expanded={selection?.id === building.id} style={{ left: building.bounds.x, top: building.bounds.y, width: Math.max(36, building.bounds.width), height: Math.max(36, building.bounds.height) }} onClick={() => chooseBuilding(building.id)} />
            <button className={`building-label city-object-label ${cityShop ? 'shop-label' : ''} ${owned ? 'owned' : ''} ${selection?.id === building.id ? 'selected' : ''}`} aria-label={`Открыть ${title}`} onClick={() => chooseBuilding(building.id)} style={{ left: building.label.x, top: building.label.y }}><span className="building-name"><Icon name={cityShop ? 'server' : 'wallet'} size={14} />{title}</span><small>{cityShop ? 'Чипы · доставка в технопарк' : owned ? 'Ваша недвижимость' : money(cityTower!.price)}</small></button>
          </div>
        }
        const location = game.locations.find((item) => item.id === building.id)!
        const locationId = location.id as LocationId
        const definition = LOCATIONS.find((item) => item.id === building.id)!
        const economy = calculateLocationEconomy(location)
        const overloaded = location.owned && economy.efficiency < 1
        const selected = selection?.id === location.id
        if (!building.visible) return null
        return <div key={building.id} className="map-object" data-location={building.id}>
          <button className={`building-hotspot ${selected ? 'selected' : ''}`} aria-label={`Здание «${definition.name}»`} aria-expanded={selected} data-testid={`building-${locationId}`} style={{ left: building.bounds.x, top: building.bounds.y, width: Math.max(36, building.bounds.width), height: Math.max(36, building.bounds.height) }} onClick={() => chooseBuilding(locationId)} />
          <button className={`building-label ${location.owned ? 'owned' : ''} ${selected ? 'selected' : ''}`} aria-label={`Открыть здание «${definition.name}»`} onClick={() => chooseBuilding(locationId)} style={{ left: building.label.x, top: building.label.y }}>
            <span className="building-name"><i className={overloaded ? 'warm-dot' : location.owned ? 'green-dot' : ''} />{definition.name}</span>
            <small>{location.owned ? `${serversText(installedChips(location).length)} · ${definition.powerLimitKw} кВт` : money(definition.price)}</small>
          </button>
          {overloaded && <div className="power-marker-anchor" style={{ left: building.warning.x, top: building.warning.y }}>
            <button className="power-marker" aria-label={`Энергия: ${definition.name}, ${percent(economy.efficiency)} мощности`} aria-expanded={selected && selection?.kind === 'power'} data-testid={`throttle-${location.id}`} onMouseEnter={() => setHoveredPower(locationId)} onMouseLeave={() => setHoveredPower(null)} onFocus={() => setHoveredPower(location.id)} onBlur={() => setHoveredPower(null)} onClick={() => select(selected && selection?.kind === 'power' ? null : { id: locationId, kind: 'power' })}><Icon name="bolt" size={16} /><span>{percent(economy.efficiency)}</span></button>
            {hoveredPower === locationId && selection?.kind !== 'power' && <span className="power-hover" role="tooltip">Точка перегружена — серверы работают на {percent(economy.efficiency)} мощности. Нажмите, чтобы узнать больше.</span>}
          </div>}
        </div>
      })}

    </div>
    {selection && anchor && selectedProjection?.visible && (selectedLocation ? <LocationCard key={`${selection.id}-${selection.kind}-${selection.serverIndex ?? ''}`} selection={selection} anchor={anchor} projection={projection} onClose={() => select(null)} onBuilding={() => onEnterInterior(selection.id as LocationId)} /> : <CityCard key={selection.id} id={selection.id as CityObjectId} anchor={anchor} projection={projection} onClose={() => select(null)} />)}
    {!mapReady && !error && <div className="map-message" role="status">Готовим место для вашей идеи…</div>}
    {error && <div className="map-message map-error" role="alert"><Icon name="help" size={28} /><h2>Карта пока недоступна</h2><p>{error}</p><p>Попробуйте включить аппаратное ускорение браузера и перезагрузить страницу.</p></div>}
  </main>
})
