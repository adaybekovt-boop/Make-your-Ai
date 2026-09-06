import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const reports = JSON.parse(readFileSync('artifacts/economy-validation/progression.json', 'utf8'))
const [passive, official, grey] = reports
assert.equal(passive.day10.misses, 1, 'A passive single-server start must not pass the board check')
assert.equal(official.day10.misses, 0, 'The reference official development policy should be able to pass')
assert.equal(grey.day10.misses, 1, 'A larger early contract payout must not guarantee passing the board')
for (const report of [official, grey]) {
  assert.ok(report.minimumCash > 0, 'Reference policy must remain solvent')
  assert.ok(report.realMinutes3x >= 120 && report.realMinutes3x <= 180, `Reference 3x finale outside 2–3 hours: ${report.realMinutes3x}`)
}
console.log('PACING_ACCEPTANCE', JSON.stringify({ calibratedSpeed: 3, universalDurationGuarantee: false, officialMinutes: official.realMinutes3x, greyMinutes: grey.realMinutes3x, officialDay10: official.day10, greyDay10: grey.day10 }))
