import { useCallback, useEffect, useRef, useState } from 'react'
import { CHASSIS, CHIPS } from '../systems/config'
import { gridSizeFor, locationDefinition, locationEquipment, normalizeLocation, placementError, sameCell, serverOutput } from '../systems/serverGrid'
import { calculateLocationEconomy } from '../systems/economy'
import type { AnyLocationId, GridPosition } from '../systems/types'
import type { CellProjection, InteriorScene } from '../render/InteriorScene'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'
import { money, percent, quantity } from './format'

export function InteriorScreen({ locationId, onLeave }: { locationId: AnyLocationId; onLeave: () => void }) {
  const ready = useGameStore((state) => state.ready)
  const ending = useGameStore((state) => state.company.company.ending)
  const restricted = useGameStore((state) => {
    const until = state.company.company.investors.restrictedUntil
    return until !== null && state.company.company.elapsedGameHours < until
  })
  const raw = useGameStore((state) => (
    state.company.company.locations.find((location) => location.id === locationId)
    ?? state.company.company.regionLocations.find((location) => location.id === locationId)
    ?? null
  ))
  const location = raw ? normalizeLocation(raw) : null
  const definition = locationDefinition(locationId)
  const size = gridSizeFor(locationId)
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<InteriorScene | null>(null)
  const [cells, setCells] = useState<CellProjection[]>([])
  const [selected, setSelected] = useState<GridPosition | null>(null)
  const [error, setError] = useState('')
  const choose = useCallback((position: GridPosition | null) => {
    setSelected(position)
    const state = useGameStore.getState()
    const current = [...state.company.company.locations, ...state.company.company.regionLocations].find((item) => item.id === locationId)
    if (position && !current?.installedServers?.some((item) => sameCell(item.gridPosition, position))) state.openProcurement({ locationId, position })
  }, [locationId])
  const server = location?.installedServers.find((item) => sameCell(item.gridPosition, selected))
  const reserve = location?.installedServers.filter((item) => !item.gridPosition) ?? []
  const occupied = (location?.installedServers.filter((item) => item.gridPosition).length ?? 0) + (location?.rigs?.length ?? 0)
  const equipment = location ? locationEquipment(location) : { demandKw: 0 }
  const economy = location ? calculateLocationEconomy(location) : null
  const blocked = !ready || !!ending || restricted
  const latest = useRef({ location, selected, efficiency: economy?.efficiency ?? 1 })
  latest.current = { location, selected, efficiency: economy?.efficiency ?? 1 }

  useEffect(() => {
    if (!raw?.owned) onLeave()
  }, [raw?.owned, onLeave])
  useEffect(() => {
    if (!host.current) return
    const element = host.current
    let cancelled = false
    let instance: InteriorScene | null = null
    import('../render/InteriorScene').then(({ InteriorScene }) => {
      if (cancelled) return
      instance = new InteriorScene(element, gridSizeFor(locationId), choose, setCells, locationId, setError)
      scene.current = instance
      const state = latest.current
      instance.update(state.location?.installedServers ?? [], state.selected, state.efficiency, state.location?.rigs ?? [])
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось отрисовать интерьер.'))
    return () => { cancelled = true; instance?.destroy(); scene.current = null }
  }, [locationId, choose])
  useEffect(() => { scene.current?.update(location?.installedServers ?? [], selected, economy?.efficiency ?? 1, location?.rigs ?? []) }, [location?.installedServers, location?.rigs, selected, economy?.efficiency])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])

  if (!location?.owned) return null
  const capacity = size.rows * size.cols
  const className = server ? CHIPS[server.chip].name.replace('GPU', 'Gpu') : 'Выберите чип'

  return <main className="interior-screen" aria-label={`Интерьер: ${definition.name}`}>
    <header className="interior-toolbar"><button className="secondary-button" onClick={onLeave}><Icon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} />Назад к карте</button><div className="interior-title"><span>Инфраструктура компании</span><h1>{definition.name}</h1></div><div className={`occupancy ${occupied === capacity ? 'text-warm' : ''}`} data-testid="grid-occupancy">Занято <strong>{occupied} / {capacity}</strong> ячеек<small>{size.rows} × {size.cols} · жёсткий лимит площади</small></div><div className="interior-energy"><Icon name="bolt" size={17} /><span>{quantity(equipment.demandKw)} / {definition.powerLimitKw} кВт<small>{economy && economy.efficiency < 1 ? `Троттлинг · ${percent(economy.efficiency)}` : 'Лимит энергии'}</small></span></div></header>
    <div className="interior-workspace">
      <section className="interior-floor" aria-label="Пол с сеткой размещения">
        <div className="interior-canvas" ref={host} />
        <div className="floor-cells" role="grid" aria-label={`Сетка ${definition.name}: ${size.rows} на ${size.cols}`} aria-rowcount={size.rows} aria-colcount={size.cols}>
          {cells.map((cell) => {
            const placed = location.installedServers.find((item) => sameCell(item.gridPosition, cell))
            const rig = location.rigs?.find((item) => sameCell(item.gridPosition, cell))
            const name = placed ? `${CHIPS[placed.chip].name.replace('GPU', 'Gpu')} · ${percent(placed.overclock)}` : rig ? `${CHASSIS[rig.chassis].name} · без чипа` : 'Свободно'
            return <button key={`${cell.row}-${cell.col}`} role="gridcell" aria-rowindex={cell.row + 1} aria-colindex={cell.col + 1} aria-selected={sameCell(cell, selected)} aria-label={`Ячейка ${cell.row + 1}, ${cell.col + 1}: ${name}`} data-testid={`cell-${cell.row}-${cell.col}`} className={`floor-cell ${placed || rig ? 'filled' : ''} ${sameCell(cell, selected) ? 'selected' : ''}`} style={{ left: cell.x, top: cell.y, width: cell.size * .96, height: cell.height }} onClick={() => choose(cell)}><span className="cell-coordinate">{cell.row + 1} · {cell.col + 1}</span>{!placed && <Icon name={rig ? 'server' : 'plus'} size={20} />}<span className="cell-caption">{placed ? placed.chip === 'consumer-gpu' ? 'G1' : placed.chip === 'pro-gpu' ? 'P2' : 'X9' : ''}</span></button>
          })}
        </div>
        <div className="interior-guide"><span>ВАША СЕРВЕРНАЯ</span><strong>{location.installedServers.some(item => item.gridPosition) ? 'Нажмите на сервер для управления' : 'Первый сервер начинается здесь'}</strong><p>Выберите свободное место на полу. Закажите комплект, дождитесь доставки и установите его со склада.</p></div><div className="floor-legend"><span><i />Свободная ячейка</span><span><i className="green-dot" />Сервер установлен</span><span>Кликните по ячейке · Esc — снять выбор</span></div>
        {error && <div className="map-message" role="alert">{error}</div>}
      </section>
      {(selected || reserve.length > 0) && <aside className="interior-inspector" aria-label="Управление выбранной ячейкой">
        {!selected ? <div className="interior-empty"><Icon name="target" size={34} /><h2>У каждого сервера своё место</h2><p>Выберите свободную ячейку на полу для установки. Нажмите на сервер, чтобы изменить его мощность, улучшить или продать.</p><div className="interior-capacity-note">Площадь и энергия — разные ограничения. Даже при свободных киловаттах для нового сервера нужна пустая ячейка.</div></div> : <>
          <div className="card-heading"><div><span className="card-caption">Ячейка {selected.row + 1} · {selected.col + 1}</span><h2>{className}</h2></div><button className="icon-button" aria-label="Снять выбор ячейки" onClick={() => setSelected(null)}><Icon name="close" size={16} /></button></div>
          {server ? <>
            <button className="secondary-button wide" onClick={() => scene.current?.focusSelected()}>Приблизить / общий вид</button><span className="status-pill">{server.id} · установлен</span>
            <div className="card-facts"><span>Потребление<strong>{quantity(serverOutput(server).powerKw)} кВт</strong></span><span>Вычисления<strong>{quantity(serverOutput(server).compute)} ед.</strong></span></div>
            <label className="overclock-label" htmlFor="server-clock">Мощность сервера <strong>{percent(server.overclock)}</strong></label>
            <input id="server-clock" aria-label="Оверклок сервера" type="range" min="50" max="150" step="5" value={Math.round(server.overclock * 100)} disabled={!ready || !!ending} onChange={(event) => useGameStore.getState().overclockAt(locationId, server.id, Number(event.target.value) / 100)} />
            <div className="range-ticks"><span>50%</span><span>100%</span><span>150%</span></div>
            <p className="card-note">Вычисления растут линейно, потребление — по квадрату мощности. Разгон может вызвать троттлинг всей комнаты; установка новых серверов при нехватке энергии запрещена.</p>
            <button className="secondary-button wide" disabled={!ready || !!ending} onClick={() => useGameStore.getState().sellAt(locationId, server.id)}>Продать сервер <span>+{money(Math.round(CHIPS[server.chip].price * CHIPS[server.chip].resaleRatio))}</span></button>
            <button className="primary-button wide" disabled={blocked} onClick={() => useGameStore.getState().openProcurement({ locationId, position: selected, serverId: server.id })}>Заказать / смонтировать апгрейд</button>
            <p className="card-note">{CHASSIS[server.chassis ?? 'rack-basic'].name}. При апгрейде оплачивается только новый чип.</p>
          </> : <>
            <p className="card-description">Закажите оборудование, дождитесь доставки на склад и смонтируйте его в этой ячейке.</p>
            <button className="primary-button wide" onClick={() => useGameStore.getState().openProcurement({ locationId, position: selected })}>Закупка и склад</button>
            {reserve.length > 0 && <><h3>Разместить из резерва</h3>{reserve.map((item) => <button key={item.id} className="secondary-button wide" disabled={blocked || !!placementError(location, item.chip, selected, item.overclock)} onClick={() => useGameStore.getState().deployReserve(locationId, item.id, selected)}>{CHIPS[item.chip].name} · {item.id}<small>Без оплаты</small></button>)}</>}
          </>}
        </>}
        {reserve.length > 0 && <details className="reserve-details"><summary>Резерв старого сохранения: {reserve.length}</summary><p>Лишние серверы сохранены, но не потребляют энергию и не приносят доход. Выберите пустую ячейку для размещения или продайте резерв.</p>{reserve.map((item) => <button className="secondary-button wide" key={item.id} onClick={() => useGameStore.getState().sellAt(locationId, item.id)} disabled={!ready || !!ending}>Продать {item.id}<small>{money(Math.round(CHIPS[item.chip].price * CHIPS[item.chip].resaleRatio))}</small></button>)}</details>}
      </aside>}
    </div>
  </main>
}
