import { useState } from 'react'
import type { Strategy } from '../systems/models'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'
import { NoticeToast } from './NoticeToast'

export function NewGameScreen() {
  const ready = useGameStore((state) => state.ready)
  const saving = useGameStore((state) => state.saving)
  const [strategy, setStrategy] = useState<Strategy>('flagship')
  const [name, setName] = useState('')
  const trimmed = name.trim()
  return (
    <section className="menu-screen" aria-label="Новая игра" data-testid="new-game-screen">
      <div className="menu-card setup-card">
        <span className="card-caption">Создание компании</span>
        <h2>Стратегия партии</h2>
        <div className="strategy-lockout" role="alert" data-testid="strategy-lock-warning">
          <Icon name="lock" size={18} />
          <p>
            <strong>Этот выбор нельзя изменить посреди партии.</strong>
            Это архитектурный запрет системного слоя, а не настройка сложности и не мелкая деталь.
          </p>
        </div>
        <div className="decision-row">
          <label className="toggle-label">
            <input
              type="radio"
              name="strategy"
              value="flagship"
              checked={strategy === 'flagship'}
              data-testid="strategy-flagship"
              onChange={() => setStrategy('flagship')}
            />
            <span>
              <strong>Один флагман</strong>
              <span>Одна модель владеет всем вычислительным бюджетом. Так устроена текущая игра.</span>
            </span>
          </label>
        </div>
        <div className="decision-row">
          <label className="toggle-label">
            <input
              type="radio"
              name="strategy"
              value="portfolio"
              checked={strategy === 'portfolio'}
              data-testid="strategy-portfolio"
              onChange={() => setStrategy('portfolio')}
            />
            <span>
              <strong>Портфель моделей</strong>
              <span>До четырёх моделей с явным разделением мощности. Новые базы покупаются отдельно и стартуют без квоты.</span>
            </span>
          </label>
        </div>
        <label className="name-field">
          Название {strategy === 'flagship' ? 'флагмана' : 'первой модели'}
          <input
            type="text"
            maxLength={48}
            value={name}
            placeholder="Например, Аврора"
            data-testid="model-name-input"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p className="card-note">
          {strategy === 'portfolio'
            ? 'У каждой следующей купленной модели будет своё имя. Стартовая модель уже требует названия.'
            : 'Это имя будет на экранах обучения, бенчмарков, контрактов и в ленте событий.'}
        </p>
        <div className="modal-actions">
          <button className="secondary-button" onClick={() => useGameStore.getState().cancelSetup()}>Назад</button>
          <button
            className="primary-button"
            data-testid="confirm-new-game"
            disabled={!ready || saving || !trimmed}
            onClick={() => void useGameStore.getState().startNewGame(strategy, trimmed)}
          >
            Начать партию
          </button>
        </div>
      </div>
      <NoticeToast />
    </section>
  )
}
