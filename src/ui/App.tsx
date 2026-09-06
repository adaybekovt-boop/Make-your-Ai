import { OFFICE_PRICE } from '../systems/city'
import { ProcurementModal } from './ProcurementModal'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ELECTRICITY_PRICE_PER_KWH, SERVER, STARTING_CASH } from '../systems/config'
import { calculateCompanyEconomy } from '../systems/economy'
import { useGameStore } from '../store/gameStore'
import { useGameRuntime } from '../store/useGameRuntime'
import { Icon } from './Icon'
import { gameClock, money, signedMoney } from './format'
import { MapView, type MapControls } from './MapView'
import { Modal } from './Modal'
import { TrainingScreen } from './TrainingScreen'
import { TestingScreen } from './TestingScreen'
import { OfficeScreen } from './OfficeScreen'
import { InteriorScreen } from './InteriorScreen'
import type { LocationId } from '../systems/types'

type Dialog = 'help' | 'settings' | 'economy' | 'reset' | 'restore' | 'office-purchase' | null
type Screen = 'map' | 'training' | 'testing' | 'interior' | 'office'

export function App() {
  useGameRuntime()
  const state = useGameStore()
  const economy = calculateCompanyEconomy(state.game)
  const clock = gameClock(state.game.elapsedGameHours)
  const map = useRef<MapControls>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [screen, setScreen] = useState<Screen>('map')
  const [interiorId, setInteriorId] = useState<LocationId>('garage')
  const enterInterior = useCallback((id: LocationId) => { setInteriorId(id); setScreen('interior') }, [])
  const leaveInterior = useCallback(() => setScreen('map'), [])
  const openDialog = (next: Dialog) => { map.current?.closeCard(); setDialog(next) }
  const goScreen = (next: Screen) => { map.current?.closeCard(); setScreen(next) }

  useEffect(() => {
    if (!state.notice || state.notice.kind === 'error') return
    const timer = window.setTimeout(state.dismissNotice, 4500)
    return () => window.clearTimeout(timer)
  }, [state.notice, state.dismissNotice])

  useEffect(() => {
    if (!import.meta.env.DEV || !state.ready) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('reviewFunds') !== '100000000') return
    url.searchParams.delete('reviewFunds')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    const current = useGameStore.getState()
    useGameStore.setState({ game: { ...current.game, cash: Math.max(current.game.cash, 100_000_000) } })
    if (current.storageEnabled) void useGameStore.getState().persist(true)
  }, [state.ready])

  const personality = state.game.model.personality
  const contract = state.game.contracts.pending
  const ending = state.game.ending

  return <div className="app-shell">
    <header className="global-bar" aria-label="Глобальное управление">
      <div className="brand" title="Создай свой ИИ"><span className="brand-icon"><Icon name="logo" size={24} /></span><strong>Neuron<span>.</span></strong></div>
      <div className="global-metrics" aria-label="Показатели компании">
        <div className="global-metric"><span>Капитал</span><strong className={state.game.cash < 0 ? 'text-warm' : ''} data-testid="cash">{money(state.game.cash)}</strong></div>
        <button className="global-metric profit-button" aria-label="Открыть экономику компании" onClick={() => openDialog('economy')}><span>Прибыль в час</span><strong className={economy.profitPerHour < 0 ? 'text-warm' : 'text-green'} data-testid="profit">{signedMoney(economy.profitPerHour)}</strong></button>
      </div>
      <div className="time-controls" aria-label="Управление временем"><span className="game-clock">День {clock.day}<b>{clock.time}</b></span><button className={`icon-button ${state.game.paused ? 'active' : ''}`} aria-label={state.game.paused ? 'Продолжить симуляцию' : 'Приостановить симуляцию'} onClick={state.togglePause} disabled={!state.ready}><Icon name={state.game.paused ? 'play' : 'pause'} size={15} /></button>{([1, 3] as const).map((speed) => <button className={`speed-button ${state.game.speed === speed ? 'active' : ''}`} key={speed} aria-label={`Скорость ${speed}×`} aria-pressed={state.game.speed === speed} onClick={() => state.setSpeed(speed)} disabled={!state.ready}>{speed}×</button>)}</div>
      <div className="global-actions"><button className="secondary-button" aria-label="Открыть офис HQ" onClick={() => state.game.officeOwned ? goScreen('office') : openDialog('office-purchase')} disabled={!state.ready}>HQ</button>
        <button className={`icon-button ${screen === 'training' ? 'active' : ''}`} aria-label="Обучение модели" title="Обучение модели" data-testid="open-training" onClick={() => goScreen('training')} disabled={!state.ready}><Icon name="model" size={20} /></button>
        <button className={`icon-button ${screen === 'testing' ? 'active' : ''}`} aria-label="Тестирование и рынок" title="Тестирование и рынок" data-testid="open-testing" onClick={() => goScreen('testing')} disabled={!state.ready}><Icon name="flask" size={20} /></button>
        <button className={`icon-button save-button ${!state.storageEnabled ? 'text-warm' : ''}`} aria-label="Сохранить компанию" title={state.saving ? 'Сохраняем…' : state.savedAt ? 'Сохранить ещё раз · автосохранение включено' : 'Сохранить компанию'} onClick={() => void state.persist(true)} disabled={!state.ready || state.saving}><Icon name="save" /><i className={state.storageEnabled ? 'green-dot' : 'warm-dot'} /></button>
        <button className="icon-button" aria-label="Помощь" title="Как играть" onClick={() => openDialog('help')}><Icon name="help" size={21} /></button>
        <button className="icon-button" aria-label="Настройки" title="Настройки и управление картой" onClick={() => openDialog('settings')}><Icon name="settings" size={20} /></button>
      </div>
    </header>

    {screen === 'office' && state.game.officeOwned && <OfficeScreen onLeave={leaveInterior} />}
    {screen === 'map' && <MapView ref={map} onEnterInterior={enterInterior} />}
    {screen === 'interior' && <InteriorScreen key={interiorId} locationId={interiorId} onLeave={leaveInterior} />}
    {screen === 'training' && <TrainingScreen onLeave={() => goScreen('map')} />}
    {screen === 'testing' && <TestingScreen onLeave={() => goScreen('map')} />}

    {dialog === 'office-purchase' && <Modal title="Головной офис" onClose={() => setDialog(null)}><span className="card-caption">Недвижимость компании</span><p className="card-description">Собственный ресепшен, переговорная и рабочее место руководителя. Офис покупается отдельно от серверных площадок.</p><div className="office-purchase-visual"><span>NEURON</span><strong>HEADQUARTERS</strong><small>Ресепшен · переговорная · кабинет</small></div><button className="primary-button wide" disabled={!state.ready || state.game.cash < OFFICE_PRICE || !!state.game.ending} onClick={() => { state.purchaseOffice(); if (useGameStore.getState().game.officeOwned) { setDialog(null); goScreen('office') } }}>Купить офис<span>{money(OFFICE_PRICE)}</span></button></Modal>}
    {state.notice && <div className={`toast ${state.notice.kind}`} role={state.notice.kind === 'error' ? 'alert' : 'status'}><Icon name={state.notice.kind === 'error' ? 'help' : 'check'} size={17} /><span>{state.notice.message.replaceAll('GPU', 'Gpu')}</span><button className="icon-button" aria-label="Скрыть уведомление" onClick={state.dismissNotice}><Icon name="close" size={15} /></button></div>}

    {personality === null && !ending && <Modal title="Какой будет ваша модель?" onClose={() => useGameStore.getState().setPersonality('friendly')} data-testid="personality-modal">
      <p>Решение принимается один раз и остаётся с компанией до конца партии.</p>
      <div className="decision-row" data-testid="personality-friendly">
        <strong>Дружелюбный ассистент</strong>
        <p>Бережно ведёт диалог. Пользователи остаются дольше: +15% к ёмкости аудитории. Контракты чаще приходят официальные.</p>
        <button className="primary-button" onClick={() => useGameStore.getState().setPersonality('friendly')}>Сделать ассистентом</button>
      </div>
      <div className="decision-row" data-testid="personality-raw">
        <strong>Чистая мощность</strong>
        <p>Ничего лишнего между пользователем и моделью. Аудитория капризнее: −5% к ёмкости, зато +10% к доходу с токенов. Контракты чаще серые.</p>
        <button className="secondary-button" onClick={() => useGameStore.getState().setPersonality('raw')}>Сделать мощнее</button>
      </div>
    </Modal>}

    {contract && <Modal title={`Предложение от «${contract.clientName}»`} onClose={() => useGameStore.getState().declineContract()} data-testid="contract-modal">
      <p>Разовый контракт: работа на данные клиента в течение следующего обучения. Варианты одного предложения:</p>
      <div className="decision-row">
        <strong>Официальный вариант · {money(contract.officialPayout)}</strong>
        <p>Следующее обучение — только на официальных партиях, и до дня {gameClock((contract.expiresDay + 8) * 24).day} — без манипуляций с бенчмарками. Выполнение укрепит репутацию. {state.game.reputation < 35 && 'Недоступно: репутация слишком низка.'}</p>
        <button className="primary-button" data-testid="accept-official" disabled={state.game.reputation < 35} onClick={() => useGameStore.getState().acceptContract('official')}>Подписать официальный<span>{money(contract.officialPayout)}</span></button>
      </div>
      <div className="decision-row">
        <strong>Серый вариант · {money(contract.greyPayout)}</strong>
        <p>Без обязательств, деньги сразу. Через несколько дней после подписи чаще случаются негативные события.</p>
        <button className="secondary-button" data-testid="accept-grey" onClick={() => useGameStore.getState().acceptContract('grey')}>Подписать серый<span>{money(contract.greyPayout)}</span></button>
      </div>
      {contract.enterprise && <div className="decision-row">
        <strong>Энтерпрайз-формат · {money(contract.enterprisePayout)}</strong>
        <p>Корпоративный доступ для клиента. Без обязательств по данным, зато платят по счёту.</p>
        <button className="secondary-button" onClick={() => useGameStore.getState().acceptContract('enterprise')}>Подписать энтерпрайз<span>{money(contract.enterprisePayout)}</span></button>
      </div>}
      <div className="modal-actions"><button className="secondary-button" onClick={() => useGameStore.getState().declineContract()}>Отказаться</button></div>
    </Modal>}

    {state.game.acquisitionOffered && !state.game.acquisitionDeclined && !ending && <Modal title="Вам звонят из большого холдинга" onClose={() => useGameStore.getState().declineAcquisition()}>
      <p>Холдинг хочет купить компанию целиком — {money(2_500_000)} сразу. После продажи симуляция остановится: это финал вашей истории, равноправный остальным.</p>
      <div className="modal-actions">
        <button className="secondary-button" onClick={() => useGameStore.getState().declineAcquisition()}>Отказаться</button>
        <button className="primary-button" data-testid="accept-acquisition" onClick={() => useGameStore.getState().acceptAcquisition()}>Продать компанию<span>{money(2_500_000)}</span></button>
      </div>
    </Modal>}

    {ending === 'acquired' && <Modal title="Компания продана" onClose={() => {}}>
      <p>Холдинг заплатил {money(2_500_000)}. Ваша модель продолжит жить под чужим брендом, а команда разошлась по проектам. Это финал: поглощение — одна из концовок игры.</p>
      <div className="economy-summary">
        <div><span>Всего заработано</span><strong>{money(state.game.totalRevenue)}</strong></div>
        <div><span>Model IQ на момент продажи</span><strong>{Math.round(state.game.model.iq)}</strong></div>
        <div><span>Пользователей</span><strong>{money(state.game.users)}</strong></div>
        <div><span>Репутация</span><strong>{Math.round(state.game.reputation)}</strong></div>
      </div>
      <button className="primary-button" onClick={() => void state.reset()}>Начать новую историю</button>
    </Modal>}

    {state.procurement && <ProcurementModal key={`${state.procurement.locationId}-${state.procurement.position?.row}-${state.procurement.position?.col}`} />}
    {dialog === 'help' && <Modal title="Всё начинается с одного здания" onClose={() => setDialog(null)}>
      <p>Перед вами вся ваша будущая сеть. Панелей сбоку больше нет — выбирайте здания и действуйте прямо на карте.</p>
      <ol className="help-steps"><li>Нажмите на <strong>гараж</strong>. В карточке рядом со зданием купите площадку.</li><li>Нажмите на купленное здание, чтобы войти в интерьер. Выберите пустую ячейку, закажите шасси и чип. После доставки смонтируйте их со склада. Базовая цена Terra T1 — {money(SERVER.price)}, шасси оплачивается отдельно.</li><li>Нажмите на сервер в сетке, чтобы изменить разгон, улучшить или продать именно его.</li><li>Установка требует свободной ячейки и мощности сети. Разгон доступен от 50 до 150%; превышение мощности при разгоне вызывает троттлинг.</li><li>Иконка модели в верхней панели ведёт на обучение: купите партию данных и загрузите её в модель.</li></ol>
      <div className="help-callout"><Icon name="map" /><p>Перетаскивайте свободное место для перемещения, прокручивайте колесо для масштаба. На сенсорном экране — один палец для перемещения, два для масштаба. Сброс вида находится в настройках.</p></div>
      <h3>Время и сохранения</h3><p>1 секунда = 1 игровая минута на скорости 1×. В скрытой вкладке время не идёт. Автосохранение — каждые 15 секунд и при скрытии вкладки. Сохранение привязано к браузеру и адресу сайта.</p>
      <button className="primary-button" onClick={() => setDialog(null)}>Вернуться на карту<Icon name="arrow" size={16} /></button>
    </Modal>}
    {dialog === 'settings' && <Modal title="Устройтесь поудобнее" onClose={() => setDialog(null)}>
      <h3>Вид карты</h3><div className="settings-row"><button className="secondary-button" onClick={() => { map.current?.zoomBy(1.2); setDialog(null) }}><Icon name="plus" size={16} />Приблизить</button><button className="secondary-button" onClick={() => { map.current?.zoomBy(1 / 1.2); setDialog(null) }}><Icon name="minus" size={16} />Отдалить</button></div><button className="secondary-button wide" onClick={() => { map.current?.resetView(); setDialog(null) }}><Icon name="target" size={16} />Показать всю карту</button>
      <h3>Ваша компания</h3><p>{state.storageEnabled ? 'Сохранение хранится только в этом браузере.' : 'Автосохранение отключено, исходный сейв не изменён. Можно повторить загрузку.'}</p><button className="secondary-button wide" onClick={() => setDialog('restore')} disabled={!state.ready || state.saving}><Icon name="load" size={16} />Загрузить сохранение</button><button className="secondary-button wide" onClick={() => setDialog('reset')} disabled={!state.ready || state.saving}><Icon name="reset" size={16} />Новая компания</button>
      <p className="card-note">Клавиатура: Tab — здания и слоты на карте, Enter — действие, Esc — закрыть карточку. Когда карта в фокусе, + / − меняют масштаб, Home возвращает общий вид.</p>
    </Modal>}
    {dialog === 'economy' && <Modal title="Как идут дела" onClose={() => setDialog(null)}>
      <div className="economy-summary"><div><span>Выручка в час</span><strong className="text-green">+{money(economy.revenuePerHour)}</strong></div><div><span>Электричество · {money(ELECTRICITY_PRICE_PER_KWH)}/кВт·ч</span><strong>−{money(economy.electricityPerHour)}</strong></div><div><span>Обслуживание серверов</span><strong>−{money(economy.maintenancePerHour)}</strong></div><div><span>Аренда помещений</span><strong>−{money(economy.rentPerHour)}</strong></div><div className="summary-total"><span>Чистая прибыль в час</span><strong className={economy.profitPerHour < 0 ? 'text-warm' : 'text-green'}>{signedMoney(economy.profitPerHour)}</strong></div></div><h3>За всё время</h3><div className="economy-summary"><div><span>Стартовый капитал</span><strong>{money(STARTING_CASH)}</strong></div><div><span>Получено выручки</span><strong>{money(state.game.totalRevenue)}</strong></div><div><span>Операционные расходы</span><strong>{money(state.game.totalExpenses)}</strong></div><div><span>Покупки минус продажи</span><strong>{money(state.game.totalCapex)}</strong></div></div>
    </Modal>}
    {dialog === 'restore' && <Modal title="Вернуться к сохранению?" onClose={() => setDialog(null)}><p>Текущая компания будет заменена последним сохранением. Изменения, которые ещё не сохранились, будут потеряны.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog('settings')}>Отмена</button><button className="primary-button" onClick={() => { setDialog(null); void state.restore() }}>Загрузить</button></div></Modal>}
    {dialog === 'reset' && <Modal title="Начать новую историю?" onClose={() => setDialog(null)}><p>Текущая компания и её сохранение будут заменены. Вы начнёте с {money(STARTING_CASH)}, без площадок и серверов. Это обычный сброс, без бонусов перерождения.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDialog('settings')}>Оставить компанию</button><button className="danger-button" onClick={() => { setDialog(null); void state.reset() }}>Начать заново</button></div></Modal>}
  </div>
}
