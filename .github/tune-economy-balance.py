from pathlib import Path
import subprocess

p = Path('src/systems/config.ts')
expected = '7d148c1acf8b8e44ef15bc0bffb62baa66e6cf61'
assert subprocess.check_output(['git', 'hash-object', str(p)], text=True).strip() == expected, 'Unexpected balance source revision'
content = p.read_text()
changes = {
 'export const BALANCE_VERSION = 1': 'export const BALANCE_VERSION = 2',
 'export const INVESTOR_TARGET_PROFIT_PER_HOUR = 2_500': 'export const INVESTOR_TARGET_PROFIT_PER_HOUR = 1_000',
 'export const ACQUISITION_REVENUE_THRESHOLD = 1_500_000': 'export const ACQUISITION_REVENUE_THRESHOLD = 1_000_000',
 '    cost: 500_000,': '    cost: 150_000,',
}
for old, new in changes.items():
    assert content.count(old) == 1, old
    content = content.replace(old, new)
p.write_text(content)
# Vitest interpolates "$12" in it.each names; avoid a misleading log title.
p = Path('src/systems/economy-regression.test.ts')
p.write_text(p.read_text().replace('the full $12,000 start', 'the full 12,000-dollar start'))
print('Balance v2: users 220, board 1000/hour, acquisition 1000000 + IQ 110, voice 150000. Other contract/tech prices unchanged.')
