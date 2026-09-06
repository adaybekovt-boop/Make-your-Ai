import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const directory = 'artifacts/economy-validation'
const reports = JSON.parse(readFileSync(`${directory}/progression.json`, 'utf8'))
const stress = JSON.parse(readFileSync(`${directory}/stochastic-1x.json`, 'utf8'))
const [passive, official, grey] = reports
assert.equal(reports.length, 3)
assert.equal(passive.day10.misses, 1)
assert.equal(passive.realMinutes1x, null)
for (const report of reports) {
  assert.equal(report.measurement.speed, 1)
  assert.equal(report.measurement.primaryMetric, 'realMinutes1x')
  assert.equal(report.measurement.humanPlaytest, false)
  assert.equal(report.measurement.wallClockPlaytest, false)
  assert.equal(report.realMinutes1x, report.firstOfferHour)
}
for (const report of [official, grey]) {
  assert.ok(report.minimumCash > 0)
  assert.ok(report.acceptedContracts > 1, 'Completed contracts must no longer lock the offer slot')
}
assert.equal(stress.primarySpeed, 1)
assert.equal(stress.cohorts.reduce((sum, c) => sum + c.runs.length, 0), 300)
for (const cohort of stress.cohorts) {
  assert.equal(cohort.summary.n, cohort.summary.offered + cohort.summary.negativeBalance + cohort.summary.timeLimit)
}
// Previous 3x duration and policy-specific board expectations are superseded by
// the contract fix. Measure the actual 1x result; do not silently accept 3x again.
const targetMet = [official, grey].every(r => r.realMinutes1x >= 120 && r.realMinutes1x <= 180)
const report = {
  primarySpeed: 1, targetMinutes1x: [120, 180], referencePacingWithinTarget: targetMet,
  officialMinutes1x: official.realMinutes1x, greyMinutes1x: grey.realMinutes1x,
  humanPlaytest: false, humanEvidence: null, approvedForOfficeTaxes: false,
  blockers: [
    ...(!targetMet ? ['The 1x reference pacing is outside the 2–3 hour target.'] : []),
    'A human realtime playtest and its evidence have not been provided.',
    ...(stress.cohorts.some(c => c.summary.blockedTrainingAfterDowntime > 0) ? ['An expired offlineUntil still blocks starting new training (separate defect).'] : []),
  ],
}
writeFileSync(`${directory}/acceptance-gate.json`, JSON.stringify(report, null, 2))
console.log('PRIMARY_1X_MEASUREMENT', JSON.stringify(report))
// Functional CI and release acceptance are intentionally distinct. This gate
// cannot certify human evidence from generated scenarios or flip humanPlaytest.
if (process.argv.includes('--enforce')) {
  assert.equal(report.approvedForOfficeTaxes, true, report.blockers.join(' '))
}
