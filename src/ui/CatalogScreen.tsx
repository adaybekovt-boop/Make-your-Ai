import { useState } from 'react'
import { purchasesRestricted } from '../systems/market'
import { BASE_MODELS, MAX_PORTFOLIO_MODELS, baseDefinition } from '../systems/models'
import { useGameStore } from '../store/gameStore'
import { Icon } from './Icon'
import { money } from './format'
import { CATEGORIES, CATEGORY_LABELS, catalogWeightGb, flagshipReplaceBlockers, modelDisplayName } from './modelView'
import { Modal } from './Modal'
import type { BaseModelId } from '../systems/models'

export function CatalogScreen({ onLeave }: { onLeave: () => void }) {
  const company = useGameStore((state) => state.company)
  const ready = useGameStore((state) => state.ready)
  const [draft, setDraft] = useState<{ id: BaseModelId; name: string } | null>(null)
  const cash = company.company.cash
  const restricted = useGameStore((state) => purchasesRestricted(state.game))
  const blockers = flagshipReplaceBlockers(company)
  const atLimit = company.strategy === 'portfolio' && company.models.length >= MAX_PORTFOLIO_MODELS
  const current = company.models[0]

  return (
    <section className="screen" aria-label="Каталог базовых моделей" data-testid="catalog-screen">
      <header className="screen-header">
        <div>
          <span className="card-caption">Каталог баз</span>
          <h2>{company.strategy === 'flagship' ? 'Замена флагмана' : 'Новые модели портфеля'}</h2>
        </div>
        <button className="secondary-button" onClick={onLeave}><Icon name="map" size={16} />К карте</button>
      </header>
      <p className="card-note">
        Цена, размер и стартовый GMI читаются из каталога системного слоя. Купленный стартовый GMI и заработанный IQ — разные величины: покупка не выдаёт прогресс компании.
      </p>
      {company.strategy === 'flagship' && (
        <div className="strategy-lockout" role="alert">
          <Icon name="alert" size={18} />
          <p>
            <strong>Замена флагмана необратима.</strong>
            Аудитория, обучение и очередь «{modelDisplayName(current)}» не переносятся. Деньги за старую лицензию не возвращаются.
          </p>
        </div>
      )}
      <div className="catalog-table-wrap">
        <table className="catalog-table" data-testid="catalog-table">
          <thead>
            <tr>
              <th>База</th>
              <th>Цена</th>
              <th>Размер</th>
              {CATEGORIES.map((key) => <th key={key}>Стартовый GMI · {CATEGORY_LABELS[key]}</th>)}
              <th>Заработанный IQ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {BASE_MODELS.map((spec) => {
              const owned = company.purchasedBases.includes(spec.id)
              const unaffordable = cash < spec.licensePrice
              const disabled = !ready || owned || restricted || unaffordable || atLimit
                || (company.strategy === 'flagship' && blockers.length > 0)
                || Boolean(company.company.ending)
              const reason = owned
                ? 'Лицензия уже куплена. Клонирование не поддерживается.'
                : company.company.ending
                  ? 'Компания уже продана.'
                  : restricted
                    ? 'Совет директоров ограничил крупные траты.'
                    : atLimit
                      ? 'Достигнут лимит в четыре модели.'
                      : unaffordable
                        ? `Нужно ещё ${money(spec.licensePrice - cash)}.`
                        : company.strategy === 'flagship' && blockers.length
                          ? blockers.join(' ')
                          : ''
              return (
                <tr key={spec.id} data-testid={`catalog-row-${spec.id}`}>
                  <td>
                    <strong>{spec.name}</strong>
                    <small>{spec.parametersB} млрд параметров</small>
                  </td>
                  <td>{money(spec.licensePrice)}</td>
                  <td>{spec.parametersB} млрд · {catalogWeightGb(spec.id)} ГБ FP16</td>
                  {CATEGORIES.map((key) => <td key={key}>{spec.gmi[key]}</td>)}
                  <td>0</td>
                  <td>
                    <button
                      className="secondary-button"
                      data-testid={`buy-base-${spec.id}`}
                      disabled={disabled}
                      title={reason}
                      onClick={() => setDraft({ id: spec.id, name: spec.name })}
                    >
                      {company.strategy === 'flagship' ? 'Заменить флагман' : 'Купить базу'}
                    </button>
                    {disabled && reason && <p className="card-note text-warm">{reason}</p>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {draft && (
        <Modal title={company.strategy === 'flagship' ? 'Необратимая замена флагмана' : 'Новая модель портфеля'} onClose={() => setDraft(null)}>
          <p>
            {company.strategy === 'flagship'
              ? `«${modelDisplayName(current)}» будет уничтожена как продукт компании. Новая база ${baseDefinition(draft.id).name} начнёт с нулевой аудитории и нулевым заработанным IQ.`
              : `Модель на базе ${baseDefinition(draft.id).name} получит нулевую квоту мощности. Перераспределите compute на экране портфеля.`}
          </p>
          <label className="name-field">
            Имя модели
            <input
              type="text"
              maxLength={48}
              value={draft.name}
              data-testid="purchase-model-name"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setDraft(null)}>Отмена</button>
            <button
              className="danger-button"
              data-testid="confirm-purchase-base"
              disabled={!draft.name.trim()}
              onClick={() => {
                useGameStore.getState().purchaseBase(draft.id, draft.name.trim(), company.strategy === 'flagship')
                setDraft(null)
              }}
            >
              {company.strategy === 'flagship' ? 'Подтвердить замену' : 'Купить'}
              <span>{money(BASE_MODELS.find((item) => item.id === draft.id)!.licensePrice)}</span>
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
