import { DATA_LOT_OFFICIAL, DATA_LOT_UNOFFICIAL, HIRE_COST, LICENSE_IQ_THRESHOLD, LICENSE_PAYOUT_PER_DAY, OPEN_SOURCE_IQ_THRESHOLD, OVERWORK_TRAINING_BONUS, SALARY_PER_HOUR, TECH_NODES, TRAINING_VOLUME_PER_COMPUTE_HOUR } from '../systems/config'
import { calculateCompanyEconomy } from '../systems/economy'
import { queueVolume } from '../systems/training'
import { isModelOnline } from '../systems/market'
import { salariesPerHour, safetyLevel } from '../systems/team'
import { useGameStore } from '../store/gameStore'
import { gameClock, money } from './format'
import { Icon } from './Icon'

function TrainingRing({ progress, label }: { progress: number | null; label: string }) {
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
          ? <><strong>—</strong><span>модель ждёт данных</span></>
          : <><strong>{Math.round(progress * 100)}%</strong><span>загрузка в модель</span></>}
      </div>
    </div>
  )
}

export function TrainingScreen({ onLeave }: { onLeave: () => void }) {
  const game = useGameStore((state) => state.game)
  const ready = useGameStore((state) => state.ready)
  const economy = calculateCompanyEconomy(game)
  const { model, team } = game
  const run = model.run
  const queueTotal = queueVolume(model.queue)
  const offline = !isModelOnline(game)
  const clock = gameClock(game.elapsedGameHours)

  const openSourceDue = model.iq >= OPEN_SOURCE_IQ_THRESHOLD && !model.openSourceChosen
  const licenseReady = model.iq >= LICENSE_IQ_THRESHOLD

  return <section className="screen" aria-label="Обучение модели">
    <header className="screen-header">
      <div>
        <span className="card-caption">Обучение</span>
        <h2>Model IQ <strong className="text-green">{Math.round(model.iq * 10) / 10}</strong></h2>
      </div>
      <div className="screen-status">
        {offline
          ? <span className="status-pill warm">Модель остановлена до {gameClock(model.offlineUntil ?? 0).time}</span>
          : model.infected
            ? <span className="status-pill warm">Заражена: ждите инцидента</span>
            : run
              ? <span className="status-pill">Идёт обучение</span>
              : <span className="status-pill">Модель работает</span>}
        <span className="game-clock">День {clock.day} · {clock.time}</span>
      </div>
      <button className="secondary-button" onClick={onLeave}><Icon name="map" size={16} />К карте</button>
    </header>

    <div className="screen-columns">
      <div className="panel-section ring-panel">
        <TrainingRing
          progress={run ? 1 - run.remaining / run.total : null}
          label={run ? `Прогресс обучения: ${Math.round((1 - run.remaining / run.total) * 100)} процентов` : 'Обучение не запущено'}
        />
        <p className="card-note">
          Скорость зависит от вычислений серверов: {TRAINING_VOLUME_PER_COMPUTE_HOUR} ед. данных в час за каждую единицу compute.
          Сейчас парк даёт {economy.effectiveCompute} ед. compute.
        </p>
        <button
          className="primary-button"
          disabled={!ready || !!run || offline || queueTotal === 0}
          onClick={() => useGameStore.getState().startTraining()}
        >
          Загрузить в модель<span>{queueTotal > 0 ? `${queueTotal} ед.` : 'очередь пуста'}</span>
        </button>
        {model.dirtyHistory && !model.infected && <p className="card-note text-warm">Модель уже обучалась на грязных партиях: скандалы с данными могут повторяться.</p>}
      </div>

      <div className="panel-section">
        <h3>Партии данных</h3>
        <div className="chip-row" data-testid="queue-official">
          <Icon name="check" size={16} />
          <div><strong>Официальные данные</strong><span>Без риска для модели</span></div>
          <button className="secondary-button" disabled={!ready || game.cash < DATA_LOT_OFFICIAL.price} onClick={() => useGameStore.getState().buyDataLot('official')}>Купить партию<span>{money(DATA_LOT_OFFICIAL.price)}</span></button>
        </div>
        <div className="chip-row" data-testid="queue-unofficial">
          <Icon name="alert" size={16} />
          <div><strong>Данные с рынка</strong><span>Тот же вклад в IQ, но партия может оказаться грязной</span></div>
          <button className="secondary-button" disabled={!ready || game.cash < DATA_LOT_UNOFFICIAL.price} onClick={() => useGameStore.getState().buyDataLot('unofficial')}>Купить партию<span>{money(DATA_LOT_UNOFFICIAL.price)}</span></button>
        </div>
        <p className="card-note">В очереди {model.queue.length} шт. Каждый запуск обучения на неофициальных партиях повышает шанс заражения — шанс растёт вместе с долей грязных данных в партии.</p>

        <h3>Команда · мораль {Math.round(team.morale)}</h3>
        <div className="chip-row">
          <Icon name="users" size={16} />
          <div><strong>Инженер</strong><span>{money(SALARY_PER_HOUR.engineer)}/ч · ускоряет работу офиса</span></div>
          <button className="secondary-button" disabled={!ready || game.cash < HIRE_COST.engineer || team.employees.length >= 12} onClick={() => useGameStore.getState().hireEmployee('engineer')}>Нанять<span>{money(HIRE_COST.engineer)}</span></button>
        </div>
        <div className="chip-row">
          <Icon name="users" size={16} />
          <div><strong>Safety-инженер</strong><span>{money(SALARY_PER_HOUR.safety)}/ч · снижает шанс промпт-инъекций</span></div>
          <button className="secondary-button" disabled={!ready || game.cash < HIRE_COST.safety || team.employees.length >= 12} onClick={() => useGameStore.getState().hireEmployee('safety')}>Нанять<span>{money(HIRE_COST.safety)}</span></button>
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
        <p className="card-note">Штат: {team.employees.length} чел., зарплаты {money(salariesPerHour(game))}/ч. В команде {safetyLevel(game)} safety-инженер(а). Выгоревшая команда уходит сама.</p>
      </div>
    </div>

    <div className="panel-section">
      <h3>Архитектура модели</h3>
      <div className="tech-grid">
        {TECH_NODES.map((node) => {
          const done = model.tech.includes(node.id)
          const available = model.iq >= node.iqThreshold
          return <div className="tech-node" key={node.id}>
            <strong>{node.name}</strong>
            <p>{node.description}</p>
            <span className="tech-req">Порог Model IQ {node.iqThreshold}</span>
            {done
              ? <span className="status-pill">Внедрено</span>
              : <button className="secondary-button" disabled={!ready || !available || game.cash < node.cost} onClick={() => useGameStore.getState().unlockTech(node.id)}>Внедрить<span>{money(node.cost)}</span></button>}
          </div>
        })}
      </div>
    </div>

    <div className="panel-section">
      <h3>Лицензии и открытый код</h3>
      <div className="chip-row">
        <Icon name="wallet" size={16} />
        <div>
          <strong>Партнёрские лицензии</strong>
          <span>{licenseReady ? `${money(LICENSE_PAYOUT_PER_DAY)} в день, пока лицензии продаются` : `Откроется на Model IQ ${LICENSE_IQ_THRESHOLD}`}</span>
        </div>
        <button className="secondary-button" disabled={!ready || !licenseReady} onClick={() => useGameStore.getState().toggleLicense()}>
          {model.licensed ? 'Свернуть лицензии' : 'Продавать лицензии'}
        </button>
      </div>
      {openSourceDue && (
        <div className="decision-row" data-testid="opensource-choice">
          <p>Model IQ {Math.round(model.iq)}: можно открыть код модели. Сообщество ответит ростом репутации, но доход с токенов снизится на четверть — навсегда.</p>
          <div className="modal-actions">
            <button className="secondary-button" disabled={!ready} onClick={() => useGameStore.getState().chooseOpenSource(false)}>Оставить закрытой</button>
            <button className="primary-button" disabled={!ready} onClick={() => useGameStore.getState().chooseOpenSource(true)}>Открыть код</button>
          </div>
        </div>
      )}
      {model.openSource && <p className="card-note">Модель открытая: репутация выросла, доход с токенов снижен на 25%.</p>}
    </div>
  </section>
}
