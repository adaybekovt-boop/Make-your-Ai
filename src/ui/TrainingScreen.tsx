import { useState } from 'react'
import { DATA_LOT_OFFICIAL, DATA_LOT_UNOFFICIAL, HIRE_COST, LICENSE_IQ_THRESHOLD, LICENSE_PAYOUT_PER_DAY, OPEN_SOURCE_IQ_THRESHOLD, OVERWORK_TRAINING_BONUS, SALARY_PER_HOUR, TECH_NODES } from '../systems/config'
import { DOMAINS, getModel, modelIsOnline, portfolioEconomy } from '../systems/models'
import type { DataDomain } from '../systems/models'
import type { DataQuality } from '../systems/types'
import { queueVolume } from '../systems/training'
import { salariesPerHour, safetyLevel } from '../systems/team'
import { useGameStore } from '../store/gameStore'
import { gameClock, money } from './format'
import { Icon } from './Icon'
import { ModelTabs } from './ModelTabs'
import { CompetenceReadout } from './CompetenceReadout'
import { QuantizePanel } from './QuantizePanel'
import { DOMAIN_LABELS, domainGainPreview, domainIqPreview, modelDisplayName, modelIdleStatus } from './modelView'
import { CATEGORIES, CATEGORY_LABELS } from './modelView'

function TrainingRing({ progress, label, name }: { progress: number | null; label: string; name: string }) {
  const radius = 86
  const circumference = 2 * Math.PI * radius
  const dash = progress === null ? circumference : circumference * (1 - progress)
  return (
    <div className="ring-stage" role="img" aria-label={label}>
      <svg className="training-ring" viewBox="0 0 220 220" width={220} height={220}>
        <circle className="ring-track" cx="110" cy="110" r={radius} />
        <circle
          className="ring-progress"
          cx="110" cy="110" r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dash}
          transform="rotate(-90 110 110)"
        />
        <g className="ring-segments">
          {Array.from({ length: 8 }, (_, index) => (
            <line key={index} x1="110" y1="16" x2="110" y2="34" transform={`rotate(${index * 45} 110 110)`} />
          ))}
        </g>
      </svg>
      <div className="ring-core">
        {progress === null
          ? <><strong>—</strong><span>{name} ждёт данных</span></>
          : <><strong>{Math.round(progress * 100)}%</strong><span>загрузка в {name}</span></>}
      </div>
    </div>
  )
}

export function TrainingScreen({ onLeave }: { onLeave: () => void }) {
  const company = useGameStore((state) => state.company)
  const selectedModelId = useGameStore((state) => state.selectedModelId)
  const ready = useGameStore((state) => state.ready)
  const model = getModel(company, selectedModelId)
  const economy = portfolioEconomy(company)
  const rates = economy.models.find((item) => item.modelId === model.id)
  const run = model.state.run
  const queueTotal = queueVolume(model.state.queue)
  const idle = modelIdleStatus(company, model)
  const clock = gameClock(company.company.elapsedGameHours)
  const name = modelDisplayName(model)
  const [domain, setDomain] = useState<DataDomain>('general')
  const [pending, setPending] = useState<DataQuality | null>(null)
  const officialPreview = domainGainPreview(domain, DATA_LOT_OFFICIAL.volume)
  const unofficialPreview = domainGainPreview(domain, DATA_LOT_UNOFFICIAL.volume)
  const preview = pending === 'unofficial' ? unofficialPreview : officialPreview
  const previewVolume = pending === 'unofficial' ? DATA_LOT_UNOFFICIAL.volume : DATA_LOT_OFFICIAL.volume
  const previewPrice = pending === 'unofficial' ? DATA_LOT_UNOFFICIAL.price : DATA_LOT_OFFICIAL.price

  const openSourceDue = model.state.iq >= OPEN_SOURCE_IQ_THRESHOLD && !model.state.openSourceChosen
  const licenseReady = model.state.iq >= LICENSE_IQ_THRESHOLD
  const team = company.company.team

  return <section className="screen" aria-label={`Обучение · ${name}`}>
    <header className="screen-header">
      <div>
        <span className="card-caption">Обучение · {name}</span>
        <h2>Заработанный IQ <strong className="text-green">{Math.round(model.state.iq * 10) / 10}</strong></h2>
      </div>
      <div className="screen-status">
        <span className={`status-pill ${idle.idle ? 'warm' : ''}`}>{idle.label}</span>
        <span className="game-clock">День {clock.day} · {clock.time}</span>
      </div>
      <button className="secondary-button" onClick={onLeave}><Icon name="map" size={16} />К карте</button>
    </header>
    <ModelTabs />

    <CompetenceReadout model={model} />

    <div className="screen-columns">
      <div className="panel-section ring-panel">
        <TrainingRing
          name={name}
          progress={run ? 1 - run.remaining / run.total : null}
          label={run ? `Прогресс обучения ${name}: ${Math.round((1 - run.remaining / run.total) * 100)} процентов` : `${name} не обучается`}
        />
        <p className="card-note">
          Скорость обучения «{name}» считает системный слой по выделенному compute.
          Сейчас {rates ? `${Math.round(rates.trainingVolumePerHour * 10) / 10} ед. данных в час` : 'нет выделенной мощности'}.
        </p>
        <button
          className="primary-button"
          disabled={!ready || !!run || !modelIsOnline(company, model) || queueTotal === 0}
          onClick={() => useGameStore.getState().startTraining()}
        >
          Загрузить в {name}<span>{queueTotal > 0 ? `${queueTotal} ед.` : 'очередь пуста'}</span>
        </button>
        {model.state.dirtyHistory && !model.state.infected && <p className="card-note text-warm">«{name}» уже обучалась на грязных партиях: скандалы с данными могут повторяться.</p>}
      </div>

      <div className="panel-section">
        <h3>Партии данных · {name}</h3>
        <fieldset className="domain-picker" data-testid="data-domain">
          <legend>Домен партии</legend>
          {DOMAINS.map((item) => (
            <label key={item} className="toggle-label">
              <input type="radio" name="data-domain" checked={domain === item} onChange={() => setDomain(item)} />
              {DOMAIN_LABELS[item]}
            </label>
          ))}
        </fieldset>
        <div className="chip-row" data-testid="queue-official">
          <Icon name="check" size={16} />
          <div><strong>Официальные данные</strong><span>Без риска для {name}</span></div>
          <button className="secondary-button" disabled={!ready || company.company.cash < DATA_LOT_OFFICIAL.price} onClick={() => setPending('official')}>Купить партию<span>{money(DATA_LOT_OFFICIAL.price)}</span></button>
        </div>
        <div className="chip-row" data-testid="queue-unofficial">
          <Icon name="alert" size={16} />
          <div><strong>Данные с рынка</strong><span>Тот же вклад в IQ «{name}», но партия может оказаться грязной</span></div>
          <button className="secondary-button" disabled={!ready || company.company.cash < DATA_LOT_UNOFFICIAL.price} onClick={() => setPending('unofficial')}>Купить партию<span>{money(DATA_LOT_UNOFFICIAL.price)}</span></button>
        </div>
        <p className="card-note">В очереди {name}: {model.state.queue.length} шт. Каждый запуск на неофициальных партиях повышает шанс заражения.</p>

        {pending && <div className="decision-row" data-testid="data-forecast">
          <strong>Прогноз прироста · {DOMAIN_LABELS[domain]}</strong>
          <p>Заработанный IQ «{name}»: +{domainIqPreview(previewVolume)}. Купленный стартовый GMI не меняется.</p>
          <div className="gmi-results">
            {CATEGORIES.map((key) => (
              <div key={key}><span>{CATEGORY_LABELS[key]}</span><strong>+{Math.round(preview[key] * 10) / 10}</strong></div>
            ))}
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setPending(null)}>Отмена</button>
            <button className="primary-button" data-testid="confirm-data-lot" onClick={() => { useGameStore.getState().buyDataLot(pending, domain); setPending(null) }}>
              Подтвердить закупку<span>{money(previewPrice)}</span>
            </button>
          </div>
        </div>}

        <h3>Команда · мораль {Math.round(team.morale)}</h3>
        <div className="chip-row">
          <Icon name="users" size={16} />
          <div><strong>Инженер</strong><span>{money(SALARY_PER_HOUR.engineer)}/ч · ускоряет работу офиса</span></div>
          <button className="secondary-button" disabled={!ready || company.company.cash < HIRE_COST.engineer || team.employees.length >= 12} onClick={() => useGameStore.getState().hireEmployee('engineer')}>Нанять<span>{money(HIRE_COST.engineer)}</span></button>
        </div>
        <div className="chip-row">
          <Icon name="users" size={16} />
          <div><strong>Safety-инженер</strong><span>{money(SALARY_PER_HOUR.safety)}/ч · снижает шанс промпт-инъекций</span></div>
          <button className="secondary-button" disabled={!ready || company.company.cash < HIRE_COST.safety || team.employees.length >= 12} onClick={() => useGameStore.getState().hireEmployee('safety')}>Нанять<span>{money(HIRE_COST.safety)}</span></button>
        </div>
        <div className="toggle-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={team.overwork}
              disabled={!ready || team.employees.length === 0}
              onChange={() => useGameStore.getState().toggleOverwork()}
            />
            Переработки: обучение быстрее на {Math.round((OVERWORK_TRAINING_BONUS - 1) * 100)}%, мораль падает каждый день
          </label>
        </div>
        <p className="card-note">Штат: {team.employees.length} чел., зарплаты {money(salariesPerHour(useGameStore.getState().game))}/ч. В команде {safetyLevel(useGameStore.getState().game)} safety-инженер(а). Выгоревшая команда уходит сама.</p>
      </div>
    </div>

    <QuantizePanel model={model} />

    <div className="panel-section">
      <h3>Архитектура · {name}</h3>
      <div className="tech-grid">
        {TECH_NODES.map((node) => {
          const done = model.state.tech.includes(node.id)
          const available = model.state.iq >= node.iqThreshold
          return <div className="tech-node" key={node.id}>
            <strong>{node.name}</strong>
            <p>{node.description}</p>
            <span className="tech-req">Порог заработанного IQ {node.iqThreshold}</span>
            {done
              ? <span className="status-pill">Внедрено</span>
              : <button className="secondary-button" disabled={!ready || !available || company.company.cash < node.cost} onClick={() => useGameStore.getState().unlockTech(node.id)}>Внедрить<span>{money(node.cost)}</span></button>}
          </div>
        })}
      </div>
    </div>

    <div className="panel-section">
      <h3>Лицензии и открытый код · {name}</h3>
      <div className="chip-row">
        <Icon name="wallet" size={16} />
        <div>
          <strong>Партнёрские лицензии</strong>
          <span>{licenseReady ? `${money(LICENSE_PAYOUT_PER_DAY)} в день, пока лицензии продаются` : `Откроется на заработанном IQ ${LICENSE_IQ_THRESHOLD}`}</span>
        </div>
        <button className="secondary-button" disabled={!ready || !licenseReady} onClick={() => useGameStore.getState().toggleLicense()}>
          {model.state.licensed ? 'Свернуть лицензии' : 'Продавать лицензии'}
        </button>
      </div>
      {openSourceDue && (
        <div className="decision-row" data-testid="opensource-choice">
          <p>Заработанный IQ «{name}» {Math.round(model.state.iq)}: можно открыть код. Сообщество ответит ростом репутации, но доход с токенов снизится на четверть — навсегда.</p>
          <div className="modal-actions">
            <button className="secondary-button" disabled={!ready} onClick={() => useGameStore.getState().chooseOpenSource(false)}>Оставить закрытой</button>
            <button className="primary-button" disabled={!ready} onClick={() => useGameStore.getState().chooseOpenSource(true)}>Открыть код</button>
          </div>
        </div>
      )}
      {model.state.openSource && <p className="card-note">«{name}» открытая: репутация выросла, доход с токенов снижен на 25%.</p>}
    </div>
  </section>
}
