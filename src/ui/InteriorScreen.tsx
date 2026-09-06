import { useCallback, useEffect, useRef, useState } from 'react'
import { CHIPS } from '../systems/config'
import { currentChipPrice, purchasesRestricted } from '../systems/market'
import { gridSizeFor, locationDefinition, locationEquipment, normalizeLocation, placementError, sameCell, serverOutput } from '../systems/serverGrid'
import { calculateLocationEconomy } from '../systems/economy'
import type { AnyLocationId, ChipId, GridPosition } from '../systems/types'
import type { CellProjection, InteriorScene } from '../render/InteriorScene'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'
import { money, percent, quantity } from './format'

export function InteriorScreen({ locationId, onLeave }: { locationId: AnyLocationId; onLeave: () => void }) {
  const game = useGameStore((state) => state.game)
  const ready = useGameStore((state) => state.ready)
  const raw = [...game.locations, ...game.regionLocations].find((location) => location.id === locationId)
  const location = raw ? normalizeLocation(raw) : null
  const definition = locationDefinition(locationId)
  const size = gridSizeFor(locationId)
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<InteriorScene | null>(null)
  const [cells, setCells] = useState<CellProjection[]>([])
  const [selected, setSelected] = useState<GridPosition | null>(null)
  const [error, setError] = useState('')
  const choose = useCallback((position: GridPosition | null) => setSelected(position), [])
  const server = location?.installedServers.find((item) => sameCell(item.gridPosition, selected))
  const reserve = location?.installedServers.filter((item) => !item.gridPosition) ?? []
  const occupied = location?.installedServers.filter((item) => item.gridPosition).length ?? 0
  const equipment = location ? locationEquipment(location) : { demandKw: 0 }
  const economy = location ? calculateLocationEconomy(location) : null
  const blocked = !ready || !!game.ending || purchasesRestricted(game)
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
      instance = new InteriorScene(element, gridSizeFor(locationId), choose, setCells)
      scene.current = instance
      const state = latest.current
      instance.update(state.location?.installedServers ?? [], state.selected, state.efficiency)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось отрисовать интерьер.'))
    return () => { cancelled = true; instance?.destroy(); scene.current = null }
  }, [locationId, choose])
  useEffect(() => { scene.current?.update(location?.installedServers ?? [], selected, economy?.efficiency ?? 1) }, [location?.installedServers, selected, economy?.efficiency])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])

  if (!location?.owned) return null
  const capacity = size.rows * size.cols
  const className = server ? CHIPS[server.chip].name.replace('GPU', 'Gpu') : 'Выберите чип'

  return <main className="interior-screen" aria-label={`Интерьер: ${definition.name}`}>
    <header className="interior-toolbar"><button className="secondary-button" onClick={onLeave}><Icon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} />Назад к карте</button><div className="interior-title"><span>Серверная комната · вид сверху</span><h1>{definition.name}</h1></div><div className={`occupancy ${occupied === capacity ? 'text-warm' : ''}`} data-testid="grid-occupancy">Занято <strong>{occupied} / {capacity}</strong> ячеек<small>{size.rows} × {size.cols} · жёсткий лимит площади</small></div><div className="interior-energy"><Icon name="bolt" size={17} /><span>{quantity(equipment.demandKw)} / {definition.powerLimitKw} кВт<small>{economy && economy.efficiency < 1 ? `Троттлинг · ${percent(economy.efficiency)}` : 'Лимит энергии'}</small></span></div></header>
    <div className="interior-workspace">
      <section className="interior-floor" aria-label="Пол с сеткой размещения">
        <div className="interior-canvas" ref={host} />
        <div className="floor-cells" role="grid" aria-label={`Сетка ${definition.name}: ${size.rows} на ${size.cols}`} aria-rowcount={size.rows} aria-colcount={size.cols}>
          {cells.map((cell) => {
            const placed = location.installedServers.find((item) => sameCell(item.gridPosition, cell))
            const name = placed ? `${CHIPS[placed.chip].name.replace('GPU', 'Gpu')} · ${percent(placed.overclock)}` : 'Свободно'
            return <button key={`${cell.row}-${cell.col}`} role="gridcell" aria-rowindex={cell.row + 1} aria-colindex={cell.col + 1} aria-selected={sameCell(cell, selected)} aria-label={`Ячейка ${cell.row + 1}, ${cell.col + 1}: ${name}`} data-testid={`cell-${cell.row}-${cell.col}`} className={`floor-cell ${placed ? 'filled' : ''} ${sameCell(cell, selected) ? 'selected' : ''}`} style={{ left: cell.x, top: cell.y, width: cell.size * .96, height: cell.size * .96 }} onClick={() => choose(cell)}><span className="cell-coordinate">{cell.row + 1} · {cell.col + 1}</span>{!placed && <Icon name="plus" size={20} />}<span className="cell-caption">{placed ? placed.chip === 'consumer-gpu' ? 'G1' : placed.chip === 'pro-gpu' ? 'P2' : 'X9' : ''}</span></button>
          })}
        </div>
        <div className="floor-legend"><span><i />Свободная ячейка</span><span><i className="green-dot" />Сервер установлен</span><span>Кликните по ячейке · Esc — снять выбор</span></div>
        {error && <div className="map-message" role="alert">{error}</div>}
      </section>
      {(selected || reserve.length > 0) && <aside className="interior-inspector" aria-label="Управление выбранной ячейкой">
        {!selected ? <div className="interior-empty"><Icon name="target" size={34} /><h2>У каждого сервера своё место</h2><p>Выберите свободную ячейку на полу для установки. Нажмите на сервер, чтобы изменить его мощность, улучшить или продать.</p><div className="interior-capacity-note">Площадь и энергия — разные ограничения. Даже при свободных киловаттах для нового сервера нужна пустая ячейка.</div></div> : <>
          <div className="card-heading"><div><span className="card-caption">Ячейка {selected.row + 1} · {selected.col + 1}</span><h2>{className}</h2></div><button className="icon-button" aria-label="Снять выбор ячейки" onClick={() => setSelected(null)}><Icon name="close" size={16} /></button></div>
          {server ? <>
            <span className="status-pill">{server.id} · установлен</span>
            <div className="card-facts"><span>Потребление<strong>{quantity(serverOutput(server).powerKw)} кВт</strong></span><span>Вычисления<strong>{quantity(serverOutput(server).compute)} ед.</strong></span></div>
            <label className="overclock-label" htmlFor="server-clock">Мощность сервера <strong>{percent(server.overclock)}</strong></label>
            <input id="server-clock" aria-label="Оверклок сервера" type="range" min="50" max="150" step="5" value={Math.round(server.overclock * 100)} disabled={!ready || !!game.ending} onChange={(event) => useGameStore.getState().overclockAt(locationId, server.id, Number(event.target.value) / 100)} />
            <div className="range-ticks"><span>50%</span><span>100%</span><span>150%</span></div>
            <p className="card-note">Вычисления растут линейно, потребление — по квадрату мощности. Разгон может вызвать троттлинг всей комнаты; установка новых серверов при нехватке энергии запрещена.</p>
            <button className="secondary-button wide" disabled={!ready || !!game.ending} onClick={() => useGameStore.getState().sellAt(locationId, server.id)}>Продать сервер <span>+{money(Math.round(CHIPS[server.chip].price * CHIPS[server.chip].resaleRatio))}</span></button>
            <h3>Улучшить в этой ячейке</h3>
            {(Object.keys(CHIPS) as ChipId[]).filter((chip) => CHIPS[chip].compute > CHIPS[server.chip].compute).map((chip) => {
              const cost = currentChipPrice(game, chip) - Math.round(CHIPS[server.chip].price * CHIPS[server.chip].resaleRatio)
              const power = equipment.demandKw - serverOutput(server).powerKw + CHIPS[chip].powerKw
              return <button className="secondary-button upgrade-choice" key={chip} disabled={blocked || game.cash < cost || power > definition.powerLimitKw} onClick={() => useGameStore.getState().upgradeAt(locationId, server.id, chip)}>{CHIPS[chip].name.replace('GPU', 'Gpu')}<small>{money(cost)} · {CHIPS[chip].powerKw} кВт</small></button>
            })}
            {server.chip === 'accelerator' && <p className="card-note">Установлен старший класс чипа.</p>}
          </> : <>
            <p className="card-description">Один сервер занимает одну ячейку. Цена включает установку на выбранное место.</p>
            {(Object.keys(CHIPS) as ChipId[]).map((chip) => {
              const product = CHIPS[chip], price = currentChipPrice(game, chip)
              const reason = placementError(location, chip, selected)
              return <div className="interior-product" key={chip}><div><Icon name="server" size={21} /><strong>{product.name.replace('GPU', 'Gpu')}</strong></div><p>{product.compute} вычисл. · {product.powerKw} кВт · {money(product.maintenancePerHour)}/ч</p><button className="primary-button" disabled={blocked || !!reason || game.cash < price} onClick={() => useGameStore.getState().installAt(locationId, chip, selected)}>Установить<span>{money(price)}</span></button>{reason && <small className="text-warm">{reason}</small>}{!reason && game.cash < price && <small className="text-warm">Не хватает {money(price - game.cash)}</small>}</div>
            })}
            {reserve.length > 0 && <><h3>Разместить из резерва</h3>{reserve.map((item) => <button key={item.id} className="secondary-button wide" disabled={blocked || !!placementError(location, item.chip, selected, item.overclock)} onClick={() => useGameStore.getState().deployReserve(locationId, item.id, selected)}>{CHIPS[item.chip].name} · {item.id}<small>Без оплаты</small></button>)}</>}
          </>}
        </>}
        {reserve.length > 0 && <details className="reserve-details"><summary>Резерв старого сохранения: {reserve.length}</summary><p>Лишние серверы сохранены, но не потребляют энергию и не приносят доход. Выберите пустую ячейку для размещения или продайте резерв.</p>{reserve.map((item) => <button className="secondary-button wide" key={item.id} onClick={() => useGameStore.getState().sellAt(locationId, item.id)} disabled={!ready || !!game.ending}>Продать {item.id}<small>{money(Math.round(CHIPS[item.chip].price * CHIPS[item.chip].resaleRatio))}</small></button>)}</details>}
      </aside>}
    </div>
  </main>
}
