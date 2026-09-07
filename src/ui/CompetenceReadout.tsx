import { effectiveProfile } from '../systems/models'
import type { ManagedModel } from '../systems/models'
import { CATEGORIES, CATEGORY_LABELS, earnedIq, startingGmi } from './modelView'

export function CompetenceReadout({ model, compact = false }: { model: ManagedModel; compact?: boolean }) {
  const purchased = startingGmi(model)
  const live = effectiveProfile(model)
  return (
    <div className={`competence-readout ${compact ? 'compact' : ''}`} data-testid={`competence-${model.id}`}>
      <div className="competence-iq">
        <span>Заработанный IQ</span>
        <strong data-testid={`earned-iq-${model.id}`}>{Math.round(earnedIq(model) * 10) / 10}</strong>
      </div>
      <div className="gmi-results competence-gmi">
        {CATEGORIES.map((key) => (
          <div key={key}>
            <span>{CATEGORY_LABELS[key]}</span>
            <strong data-testid={`live-gmi-${model.id}-${key}`}>{Math.round(live[key] * 10) / 10}</strong>
            <small>купленный стартовый GMI {Math.round(purchased[key] * 10) / 10}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
