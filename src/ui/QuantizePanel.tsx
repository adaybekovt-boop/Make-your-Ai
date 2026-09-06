import { useState } from 'react'
import type { ManagedModel, QuantizationStep } from '../systems/models'
import { useGameStore } from '../store/gameStore'
import { meanProfile } from '../systems/models'
import { CATEGORY_LABELS, QUANTIZATION_LABELS, modelDisplayName, quantizationPreview } from './modelView'
import { percent } from './format'

const STEPS: QuantizationStep[] = [0, 1, 2]

export function QuantizePanel({ model }: { model: ManagedModel }) {
  const ready = useGameStore((state) => state.ready)
  const [step, setStep] = useState<QuantizationStep>(model.quantization)
  const busy = Boolean(model.state.run || model.benchmark.testing)
  const preview = quantizationPreview(model, step)
  const name = modelDisplayName(model)
  return (
    <div className="panel-section" data-testid={`quantize-${model.id}`}>
      <h3>Квантование · {name}</h3>
      <p className="card-note">
        Действие обратимо: полные веса и баллы не уничтожаются. Повторные переключения не накапливают ошибку округления.
        Во время обучения или теста сменить ступень нельзя.
      </p>
      <div className="chip-actions quantize-steps">
        {STEPS.map((value) => (
          <button
            key={value}
            className={`secondary-button ${step === value ? 'active' : ''}`}
            data-testid={`quantize-step-${value}`}
            disabled={!ready}
            onClick={() => setStep(value)}
          >
            {QUANTIZATION_LABELS[value]}
          </button>
        ))}
      </div>
      <div className="gmi-results">
        <div><span>Эффективный GMI</span><strong>{Math.round(meanProfile(preview.currentGmi) * 10) / 10} → {Math.round(meanProfile(preview.gmi) * 10) / 10}</strong></div>
        <div><span>Заработанный IQ (после сжатия)</span><strong>{Math.round(preview.currentLearnedIq * 10) / 10} → {Math.round(preview.learnedIq * 10) / 10}</strong></div>
        <div><span>Качество</span><strong>{percent(preview.currentQuality)} → {percent(preview.quality)}</strong></div>
        <div><span>Пропускная способность</span><strong>×{preview.currentThroughput.toFixed(2)} → ×{preview.throughput.toFixed(2)}</strong></div>
      </div>
      <p className="card-note">Текущий GMI по категориям после подтверждения считается системным слоем, не экраном.</p>
      <div className="gmi-results">
        {(['reasoning', 'coding', 'safety', 'multimodal'] as const).map((key) => (
          <div key={key}>
            <span>{CATEGORY_LABELS[key]}</span>
            <strong>{Math.round(preview.currentGmi[key] * 10) / 10} → {Math.round(preview.gmi[key] * 10) / 10}</strong>
          </div>
        ))}
      </div>
      {busy && <p className="card-note text-warm">Нельзя менять квантование, пока «{name}» обучается или проходит тест.</p>}
      <button
        className="primary-button"
        data-testid={`confirm-quantize-${model.id}`}
        disabled={!ready || busy || step === model.quantization}
        onClick={() => useGameStore.getState().setModelQuantization(model.id, step)}
      >
        Применить {QUANTIZATION_LABELS[step]}
      </button>
    </div>
  )
}
