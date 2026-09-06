import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'
import { Modal } from './Modal'
import { NoticeToast } from './NoticeToast'

export function MainMenu() {
  const ready = useGameStore((state) => state.ready)
  const hasSave = useGameStore((state) => state.hasSave)
  const storageEnabled = useGameStore((state) => state.storageEnabled)
  const [settings, setSettings] = useState(false)
  return (
    <section className="menu-screen" aria-label="Главное меню" data-testid="main-menu">
      <div className="menu-card">
        <div className="brand" title="Создай свой ИИ">
          <span className="brand-icon"><Icon name="logo" size={28} /></span>
          <strong>Neuron<span>.</span></strong>
        </div>
        <p className="menu-lead">Лаборатория, серверы и модели — в одном городе. Выбор стратегии делается один раз.</p>
        <button className="primary-button wide" data-testid="new-game" disabled={!ready} onClick={() => useGameStore.getState().beginSetup()}>
          Новая игра
        </button>
        <button className="secondary-button wide" data-testid="continue-game" disabled={!ready || !hasSave} onClick={() => void useGameStore.getState().continueGame()}>
          Продолжить
        </button>
        <button className="secondary-button wide" data-testid="open-menu-settings" disabled={!ready} onClick={() => setSettings(true)}>
          Настройки
        </button>
        {!hasSave && <p className="card-note">Сохранения в этом браузере нет. Начните новую игру.</p>}
      </div>
      <NoticeToast />
      {settings && (
        <Modal title="Настройки" onClose={() => setSettings(false)}>
          <h3>Ваша компания</h3>
          <p>{storageEnabled ? 'Сохранение хранится только в этом браузере и привязано к адресу сайта.' : 'Автосохранение отключено. Можно повторить загрузку после новой игры.'}</p>
          <p className="card-note">Клавиатура: Tab — здания и слоты на карте, Enter — действие, Esc — закрыть карточку. Когда карта в фокусе, + / − меняют масштаб, Home возвращает общий вид.</p>
          <button className="primary-button" onClick={() => setSettings(false)}>Закрыть</button>
        </Modal>
      )}
    </section>
  )
}
