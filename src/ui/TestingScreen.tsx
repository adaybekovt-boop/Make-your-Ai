import { AD_DAILY_COST, BENCHMARK_COST, BENCHMARK_OFFLINE_HOURS, INSURANCE_DAILY_PREMIUM, INSURANCE_COVERAGE, REGIONS, TOKEN_PRICE_DEFAULT, TOKEN_PRICE_MAX, TOKEN_PRICE_MIN } from '../systems/config'
import { adCostMultiplier } from '../systems/reputation'
import { competitorRevealed, competitorGrowth } from '../systems/competitor'
import { gameDay } from '../systems/market'
import { benchmarkIsCurrent, effectiveProfile, getModel, modelIsOnline } from '../systems/models'
import { useGameStore } from '../store/gameStore'
import { money, percent } from './format'
import { Icon } from './Icon'
import { ModelTabs } from './ModelTabs'
import { CompetenceReadout } from './CompetenceReadout'
import { modelDisplayName } from './modelView'

function Sparkline({ samples }: { samples: number[] }) {
  if (samples.length < 2) return <p className="card-note">Кривая конкурента появится после первых игровых дней.</p>
  const width = 320
  const height = 64
  const max = Math.max(...samples)
  const min = Math.min(...samples)
  const span = Math.max(max - min, 1)
  const points = samples
    .map((value, index) => {
      const x = (index / (samples.length - 1)) * (width - 4) + 2
      const y = height - 4 - ((value - min) / span) * (height - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Кривая конкурента по дням">
    <polyline points={points} />
  </svg>
}

export function TestingScreen({ onLeave }: { onLeave: () => void }) {
  const company = useGameStore((state) => state.company)
  const selectedModelId = useGameStore((state) => state.selectedModelId)
  const ready = useGameStore((state) => state.ready)
  const model = getModel(company, selectedModelId)
  const game = useGameStore((state) => state.game)
  const { market } = company.company
  const last = model.benchmark.last
  const testing = model.benchmark.testing
  const revealed = competitorRevealed(game)
  const today = gameDay(game)
  const name = modelDisplayName(model)
  const stale = last !== null && !benchmarkIsCurrent(model)

  return <section className="screen" aria-label={`Тестирование и рынок · ${name}`}>
    <header className="screen-header">
      <div>
        <span className="card-caption">Тестирование и рынок · {name}</span>
        <h2>GMI {last ? <strong className="text-green">{Math.round(last.total)}</strong> : <strong>—</strong>}</h2>
      </div>
      <div className="screen-status">
        {model.state.iq <= 0 && !Object.values(effectiveProfile(model)).some((value) => value > 0) && <span className="status-pill warm">Сначала обучите {name}</span>}
        {testing && <span className="status-pill">Тест идёт: {name} отключена от пользователей</span>}
        {stale && <span className="status-pill warm">Прошлый тест устарел после смены квантования</span>}
        {!testing && last?.exposed && <span className="status-pill warm">Результат запятнан жульничеством</span>}
      </div>
      <button className="secondary-button" onClick={onLeave}><Icon name="map" size={16} />К карте</button>
    </header>
    <ModelTabs />
    <CompetenceReadout model={model} compact />

    <div className="screen-columns">
      <div className="panel-section" data-testid="gmi-panel">
        <h3>Тест Global Model Index · {name}</h3>
        <p className="card-note">
          Тест стоит {money(BENCHMARK_COST)} и держит {name} офлайн {BENCHMARK_OFFLINE_HOURS} ч: доход этой модели в это время не идёт,
          аренда и электричество — идут. Результат зависит от заработанного IQ {Math.round(model.state.iq)} и купленного стартового GMI — это разные числа.
        </p>
        <button
          className="primary-button"
          data-testid="run-benchmark"
          disabled={!ready || testing || !modelIsOnline(company, model) || company.company.cash < BENCHMARK_COST || (model.state.iq <= 0 && !Object.values(effectiveProfile(model)).some((value) => value > 0))}
          onClick={() => useGameStore.getState().runBenchmark()}
        >
          Провести тестирование {name}<span>{money(BENCHMARK_COST)}</span>
        </button>

        {last && <div className="gmi-results" data-testid="gmi-results">
          <div><span>Reasoning</span><strong>{Math.round(last.reasoning)}</strong></div>
          <div><span>Coding</span><strong>{Math.round(last.coding)}</strong></div>
          <div><span>Safety</span><strong>{Math.round(last.safety)}</strong></div>
          <div><span>Multimodal</span><strong>{Math.round(last.multimodal)}</strong></div>
          <div className="summary-total"><span>Итог · день {last.day}{stale ? ' · устарел' : ''}</span><strong>{Math.round(last.total)}</strong></div>
          {last.cheated && !last.exposed && <p className="card-note text-warm">Этот результат «{name}» завышен подготовкой. Пока правда не вскрылась.</p>}
          {last.exposed && <p className="card-note text-warm">Жульничество в результате «{name}» вскрыто: буст рекламы и доверие потеряны.</p>}
          {!last.cheated && last.total >= 75 && <p className="card-note text-green">Честный высокий балл: реклама работает на четверть лучше, открыты дорогие контракты.</p>}
        </div>}

        <div className="toggle-row">
          <label className="toggle-label" data-testid="preparing-toggle">
            <input
              type="checkbox"
              checked={model.benchmark.preparing}
              disabled={!ready}
              onChange={() => useGameStore.getState().togglePreparing()}
            />
            Подготовить {name} к бенчмаркам: −20% дохода от пользователей сейчас, +30% к следующему тесту
          </label>
        </div>
        <p className="card-note">Так готовились и другие лаборатории. Часть из них вскрыли — с репутацией было хуже, чем если бы они не готовились. Точный шанс — не публикуется.</p>
      </div>

      <div className="panel-section">
        <h3>Конкурент</h3>
        <Sparkline samples={company.company.competitor.samples} />
        <p className="card-note" data-testid="competitor-score">
          {revealed
            ? `Балл конкурента: ${Math.round(company.company.competitor.score)} (точные данные разведки, ещё ${Math.ceil((company.company.competitor.revealedUntil! - company.company.elapsedGameHours))} ч).`
            : `Балл конкурента: ≈${Math.round(company.company.competitor.score / 10) * 10} (оценка; разведка покажет точное число).`}
        </p>
        <button className="secondary-button" disabled={!ready || company.company.cash < 25_000} onClick={() => useGameStore.getState().attemptEspionage()}>Заказать разведку<span>{money(25_000)}</span></button>
        <p className="card-note">Провал разведки ударит по репутации сильнее, чем отказ от попытки.</p>

        <h3>Реклама и цена токена</h3>
        <div className="toggle-row">
          <label className="toggle-label">
            <input type="checkbox" checked={market.advertising} disabled={!ready} onChange={() => useGameStore.getState().toggleAdvertising()} />
            Реклама: +50% к ёмкости аудитории, {money(Math.round(AD_DAILY_COST * adCostMultiplier(game)))} в день
          </label>
        </div>
        <label className="slider-row">
          <span>Цена токена · {market.tokenPrice}% базы</span>
          <input
            type="range" min={TOKEN_PRICE_MIN} max={TOKEN_PRICE_MAX} step={5}
            value={market.tokenPrice}
            disabled={!ready}
            onChange={(event) => useGameStore.getState().setTokenPrice(Number(event.target.value))}
          />
          <small>{market.tokenPrice < TOKEN_PRICE_DEFAULT ? 'Дёшево: аудитория растёт, маржа падает' : market.tokenPrice > TOKEN_PRICE_DEFAULT ? 'Дорого: маржа растёт, аудитория уходит' : 'Базовая цена'}</small>
        </label>

        <h3>Репутация и страховка</h3>
        <div className="card-facts">
          <span>Репутация<strong>{Math.round(company.company.reputation)} / 100</strong></span>
          <span>Эффективность рекламы<strong>{percent(company.company.reputation / 100 / 2 + 0.5)}</strong></span>
        </div>
        <div className="toggle-row">
          <label className="toggle-label">
            <input type="checkbox" checked={market.insurance} disabled={!ready} onChange={() => useGameStore.getState().toggleInsurance()} />
            Страховка: покрывает {percent(INSURANCE_COVERAGE)} штрафов, {money(INSURANCE_DAILY_PREMIUM)} в день
          </label>
        </div>

        <h3>Заморский регион</h3>
        {company.company.regions.includes('overseas') ? <>
          {REGIONS[0].locations.map((location) => {
            const owned = company.company.regionLocations.find((item) => item.id === location.id)?.owned
            return owned
              ? <p className="card-note" key={location.id}>{location.name}: площадка ваша. Электричество здесь дороже на {percent(REGIONS[0].electricityMult - 1)}, а иски — чаще.</p>
              : <div className="chip-row" key={location.id}>
                <Icon name="server" size={16} />
                <div><strong>{location.name}</strong><span>{location.powerLimitKw} кВт · электричество ×{REGIONS[0].electricityMult}</span></div>
                <button className="secondary-button" disabled={!ready || company.company.cash < location.price} onClick={() => useGameStore.getState().purchaseLocation(location.id)}>Купить<span>{money(location.price)}</span></button>
              </div>
          })}
        </> : <>
          <p className="card-note">{REGIONS[0].description}</p>
          <button className="secondary-button" disabled={!ready || company.company.cash < REGIONS[0].unlockCost} onClick={() => useGameStore.getState().unlockRegion(REGIONS[0].id)}>Открыть регион<span>{money(REGIONS[0].unlockCost)}</span></button>
        </>}
        <p className="card-note">Ориентир: соперник растёт на {percent(competitorGrowth(game, Math.random) / Math.max(company.company.competitor.score, 1))} в день. День {today}.</p>
      </div>
    </div>
  </section>
}
