import { useGameStore } from '../store/gameStore'
import { modelDisplayName } from './modelView'

export function ModelTabs() {
  const models = useGameStore((state) => state.company.models)
  const strategy = useGameStore((state) => state.company.strategy)
  const selectedModelId = useGameStore((state) => state.selectedModelId)
  if (strategy !== 'portfolio' || models.length < 2) return null
  return (
    <div className="model-tabs" role="tablist" aria-label="Модели компании" data-testid="model-tabs">
      {models.map((model) => (
        <button
          key={model.id}
          role="tab"
          aria-selected={model.id === selectedModelId}
          className={`model-tab ${model.id === selectedModelId ? 'active' : ''}`}
          data-testid={`select-model-${model.id}`}
          onClick={() => useGameStore.getState().selectModel(model.id)}
        >
          {modelDisplayName(model)}
        </button>
      ))}
    </div>
  )
}
