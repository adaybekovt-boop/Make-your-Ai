import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { play, type ScenarioOptions } from './balanceScenario'

// Automated stress evidence only. Never a replacement for a human realtime session.
describe('1x stochastic measurement after contract lifecycle fix', () => {
  it('records every seed 1..100 for each policy, including debt and censored runs', () => {
    const policies: ScenarioOptions[] = [
      { contractKind: 'official', expand: true },
      { contractKind: 'grey', expand: true },
      { contractKind: 'grey', expand: true, quality: 'unofficial' },
    ]
    const cohorts = policies.map(policy => {
      const runs = Array.from({ length: 100 }, (_, index) => play({ ...policy, seed: index + 1 }))
      expect(runs).toHaveLength(100)
      expect(runs.map(run => run.measurement.seed)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1))
      for (const run of runs) {
        expect(run.measurement.speed).toBe(1)
        expect(run.measurement.humanPlaytest).toBe(false)
        expect(Number.isFinite(run.minimumCash)).toBe(true)
        expect(run.realMinutes1x).toBe(run.firstOfferHour)
        if (run.outcome === 'negative-balance') expect(run.minimumCash).toBeLessThan(0)
      }
      // Replay identity verifies reproducibility, not that the policy is good.
      expect(play({ ...policy, seed: 1 })).toEqual(runs[0])
      const endings = runs.filter(run => run.realMinutes1x !== null).map(run => run.realMinutes1x!).sort((a, b) => a - b)
      const quantile = (p: number) => endings.length ? endings[Math.round((endings.length - 1) * p)] : null
      const allEvents = runs.flatMap(run => run.incidents)
      const counts = Object.fromEntries([
        ['fire', 'Пожар на сервере'], ['court', 'Суд за нелегальные'], ['equipmentFailure', 'Оборудование отказало'],
        ['injection', 'Промпт-инъекция'], ['malware', 'Обнаружен вредоносный'],
      ].map(([key, text]) => [key, allEvents.filter(event => event.message.includes(text)).length]))
      return { policy, summary: {
        n: runs.length, offered: endings.length, negativeBalance: runs.filter(run => run.outcome === 'negative-balance').length,
        timeLimit: runs.filter(run => run.outcome === 'time-limit').length,
        boardPasses: runs.filter(run => run.day10?.misses === 0).length,
        reachedDay10: runs.filter(run => run.day10 !== null).length,
        blockedTrainingAfterDowntime: runs.filter(run => run.trainingBlockedAfterDowntime).length,
        conditionalFinaleMinutes1x: { min: endings[0] ?? null, median: quantile(.5), p90: quantile(.9), max: endings.at(-1) ?? null },
        events: counts,
      }, runs }
    })
    mkdirSync('artifacts/economy-validation', { recursive: true })
    const result = { humanPlaytest: false, primarySpeed: 1, method: 'automated sequential seeds; hourly decisions; no seed filtering; stop at first negative balance, acquisition offer, or 960 game hours', cohorts }
    writeFileSync('artifacts/economy-validation/stochastic-1x.json', JSON.stringify(result, null, 2))
    console.log('STOCHASTIC_1X', JSON.stringify(cohorts.map(({ policy, summary }) => ({ policy, summary }))))
    expect(cohorts.reduce((sum, c) => sum + c.summary.n, 0)).toBe(300)
    expect(cohorts.some(c => c.summary.events.fire > 0)).toBe(true)
    expect(cohorts.some(c => c.summary.events.equipmentFailure > 0)).toBe(true)
    expect(cohorts[2].summary.events.court).toBeGreaterThan(0)
  }, 120_000)
})
