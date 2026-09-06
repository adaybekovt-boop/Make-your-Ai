import { useEffect, useRef, useState } from 'react'
import type { InteriorScene } from '../render/InteriorScene'
import { useGameStore } from '../store/gameStore'
import { money } from './format'
export function OfficeScreen({ onLeave }: { onLeave: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const game = useGameStore(state => state.game)
  useEffect(() => {
    if (!host.current || !game.officeOwned) return
    const element = host.current
    let scene: InteriorScene | null = null, cancelled = false
    void import('../render/InteriorScene').then(({ InteriorScene }) => {
      if (!cancelled) scene = new InteriorScene(element, { rows: 0, cols: 0 }, () => {}, () => {}, 'hq', setError)
    }).catch(() => setError('Не удалось загрузить офис.'))
    return () => { cancelled = true; scene?.destroy() }
  }, [game.officeOwned])
  if (!game.officeOwned) return null
  return <main className="interior-screen" aria-label="Офис HQ">
    <header className="interior-toolbar"><button className="secondary-button" onClick={onLeave}>Назад к карте</button><div className="interior-title"><span>Ресепшен · переговорная</span><h1>Офис HQ</h1></div></header>
    <div className="interior-workspace"><section className="interior-floor" aria-label="Интерьер офиса"><div className="interior-canvas" ref={host} />{error && <div className="map-message" role="alert">{error}</div>}</section>
      <aside className="interior-inspector"><span className="card-caption">Neuron · головной офис</span><h2>Ваша компания</h2><p className="card-note">Ресепшен встречает гостей, переговорная — партнёров. Свидетельство компании занимает своё место на стене.</p><div className="card-facts"><span>Капитал<strong>{money(game.cash)}</strong></span><span>Площадки<strong>{game.locations.filter(l => l.owned).length}</strong></span></div></aside>
    </div>
  </main>
}
