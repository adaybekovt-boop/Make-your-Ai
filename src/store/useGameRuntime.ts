import { useEffect } from 'react'
import { useGameStore } from './gameStore'

export function useGameRuntime() {
  useEffect(() => {
    void useGameStore.getState().initialize()
    let previous = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = Math.min((now - previous) / 1000, 2)
      previous = now
      if (!document.hidden) useGameStore.getState().tick(delta)
    }, 250)
    const autosave = window.setInterval(() => {
      void useGameStore.getState().persist()
    }, 15_000)
    const visibility = () => {
      previous = performance.now()
      if (document.hidden) void useGameStore.getState().persist()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearInterval(timer)
      window.clearInterval(autosave)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
}
