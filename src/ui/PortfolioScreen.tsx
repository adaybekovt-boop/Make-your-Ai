import { portfolioEconomy } from '../systems/models'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'
import { CompetenceReadout } from './CompetenceReadout'
import { QuantizePanel } from './QuantizePanel'
import { allocationPercent, COMPUTE_BUDGET_BPS, modelDisplayName, modelIdleStatus, percentToBps, remainingAllocationBps } from './modelView'
import { percent, quantity } from './format'

export function PortfolioScreen({ onLeave }: { onLeave: () => void }) {
  const company = useGameStore((state) => state.company)
  const ready = useGameStore((state) => state.ready)
  const economy = portfolioEconomy(company)
  const used = company.models.reduce((sum, model) => sum + model.allocationBps, 0)
  const free = COMPUTE_BUDGET_BPS - used

  if (company.strategy !== 'portfolio') {
    return (
      <section className="screen" aria-label="Портфель моделей">
        <header className="screen-header">
          <div>
            <span className="card-caption">Портфель</span>
            <h2>Недоступно в стратегии «Один флагман»</h2>
          </div>
          <button className="secondary-button" onClick={onLeave}><Icon name="map" size={16} />К карте</button>
        </header>
      </section>
    )
  }

  return (
    <section className="screen" aria-label="Портфель моделей" data-testid="portfolio-screen">
      <header className="screen-header">
        <div>
          <span className="card-caption">Портфель · до 4 моделей</span>
          <h2>Квота мощности</h2>
        </div>
        <div className="screen-status">
          <span className="status-pill" data-testid="allocation-used">Распределено {percent(used / COMPUTE_BUDGET_BPS)}</span>
          <span className={`status-pill ${free > 0 ? '' : 'warm'}`} data-testid="allocation-free">Осталось {percent(free / COMPUTE_BUDGET_BPS)}</span>
        </div>
        <button className="secondary-button" onClick={onLeave}><Icon name="map" size={16} />К карте</button>
      </header>
      <div className="allocation-bar" aria-hidden="true">
        {company.models.map((model) => (
          <i key={model.id} style={{ width: `${allocationPercent(model.allocationBps)}%` }} title={modelDisplayName(model)} />
        ))}
        {free > 0 && <i className="free" style={{ width: `${allocationPercent(free)}%` }} />}
      </div>
      <div className="portfolio-grid">
        {company.models.map((model) => {
          const rates = economy.models.find((item) => item.modelId === model.id)
          const idle = modelIdleStatus(company, model)
          const maxBps = remainingAllocationBps(company, model.id)
          return (
            <article className="panel-section portfolio-card" key={model.id} data-testid={`portfolio-card-${model.id}`}>
              <div className="card-heading">
                <div>
                  <span className="card-caption">{model.baseId}</span>
                  <h2>{modelDisplayName(model)}</h2>
                </div>
                <span className={`status-pill ${idle.idle ? 'warm' : ''}`}>{idle.label}</span>
              </div>
              <label className="slider-row">
                <span>Квота мощности · {Math.round(allocationPercent(model.allocationBps))}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(allocationPercent(model.allocationBps))}
                  disabled={!ready}
                  data-testid={`allocation-${model.id}`}
                  onChange={(event) => {
                    const desired = percentToBps(Number(event.target.value))
                    const next = Math.max(0, Math.min(desired, maxBps))
                    const allocations = Object.fromEntries(company.models.map((item) => [
                      item.id,
                      item.id === model.id ? next : item.allocationBps,
                    ]))
                    useGameStore.getState().setAllocations(allocations)
                  }}
                />
                <small>Сумма квот не может превысить 100%. Свободно для этой модели: {Math.round(allocationPercent(maxBps))}%</small>
              </label>
              <CompetenceReadout model={model} compact />
              <div className="card-facts">
                <span>Аудитория<strong>{quantity(model.users)}</strong></span>
                <span>Ёмкость<strong>{quantity(rates?.capacity ?? 0)}</strong></span>
              </div>
              <QuantizePanel model={model} />
            </article>
          )
        })}
      </div>
    </section>
  )
}
