import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const output = 'artifacts/economy-validation'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const read = () => page.evaluate(async () => {
  const { useGameStore } = await import('/src/store/gameStore.ts')
  const { calculateCompanyEconomy } = await import('/src/systems/economy.ts')
  const state = useGameStore.getState().game
  return { cash: state.cash, users: state.users, hour: state.elapsedGameHours, revenue: state.totalRevenue, economy: calculateCompanyEconomy(state), orders: state.orders.length, installed: state.locations[0].installedServers?.length ?? 0 }
})
// Advance actual simulation time without waiting for real hours. No revenue, state,
// procurement or renderer implementations are mocked, and no debug API is shipped.
const advance = hours => page.evaluate(async hours => {
  const { useGameStore } = await import('/src/store/gameStore.ts')
  const { advanceSimulation } = await import('/src/systems/simulation.ts')
  const state = useGameStore.getState().game
  const next = advanceSimulation({ ...state, paused: false }, hours * 60 / state.speed, () => 0.99)
  useGameStore.setState({ game: { ...next, paused: true } })
}, hours)
const shots = []
async function capture(name) { await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }); shots.push(name) }
try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.waitForFunction(async () => (await import('/src/store/gameStore.ts')).useGameStore.getState().ready)
  // Pause at exactly the initial state before the first user action.
  await page.evaluate(async () => {
    const { useGameStore } = await import('/src/store/gameStore.ts')
    const { createInitialGame } = await import('/src/systems/simulation.ts')
    useGameStore.setState({ game: { ...createInitialGame(), paused: true } })
  })
  await page.getByRole('button', { name: 'Сделать ассистентом', exact: true }).click()
  await page.getByTestId('building-garage').waitFor({ state: 'visible', timeout: 60000 })
  await page.getByRole('button', { name: 'Открыть здание «Гараж»', exact: true }).click()
  await page.getByRole('button', { name: /Купить локацию/ }).click()
  assert.equal((await read()).cash, 10500)
  assert.equal((await read()).economy.profitPerHour, -80)
  await page.getByRole('button', { name: 'Войти в интерьер', exact: true }).click()
  await page.getByTestId('cell-0-0').waitFor({ state: 'visible', timeout: 60000 })
  await page.getByTestId('cell-0-0').click()
  await page.getByLabel('Канал закупки', { exact: true }).selectOption('official')
  await page.getByRole('button', { name: /Оплатить заказ/ }).click()
  assert.equal((await read()).cash, 5700)
  assert.equal((await read()).orders, 2)
  assert.equal((await read()).installed, 0)
  await advance(6)
  assert.equal((await read()).cash, 5220)
  assert.equal((await read()).orders, 0)
  assert.equal((await read()).installed, 0)
  await page.getByRole('button', { name: 'Смонтировать шасси', exact: true }).click()
  await page.getByRole('button', { name: 'Смонтировать чип', exact: true }).click()
  assert.equal((await read()).installed, 1)
  assert.equal((await read()).cash, 5220)
  assert.equal((await read()).users, 0)
  assert.equal((await read()).economy.profitPerHour, -206)
  await page.keyboard.press('Escape')
  // The generic modal may only close through its explicit close control.
  if (await page.getByRole('button', { name: 'Закрыть окно', exact: true }).count()) await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click()
  await page.locator('.interior-economy summary').click()
  assert.match(await page.getByTestId('interior-profit').innerText(), /Выручка от аудитории/)
  assert.match(await page.getByTestId('roi-forecast').innerText(), /после разгона аудитории/)
  await capture('01-mounted-no-users')
  await advance(1)
  assert.equal((await read()).cash, 5014)
  assert.equal((await read()).revenue, 0)
  await advance(33)
  const ramped = await read()
  assert.equal(ramped.hour, 40)
  assert.ok(Math.abs(ramped.cash - 1859.2) < 1e-6)
  assert.ok(ramped.users > 0)
  assert.ok(ramped.economy.profitPerHour > 0)
  const headerProfit = await page.getByTestId('profit').innerText()
  assert.ok(!headerProfit.includes('−') && !headerProfit.includes('-'))
  await capture('02-audience-positive-profit')
  await page.getByRole('button', { name: 'Открыть экономику компании', exact: true }).click()
  assert.ok(await page.getByText('Токены и подписки', { exact: true }).isVisible())
  assert.ok(await page.getByText('Аренда башен — доход', { exact: true }).isVisible())
  await capture('03-company-revenue-breakdown')
  assert.deepEqual(errors, [])
  const report = { status: 'passed', testedCommit: process.env.GITHUB_SHA, method: 'real UI actions + real simulation time advancement through existing modules; deterministic benign RNG', manualHumanPlaytest: false, screenshots: shots, ramped, runtimeErrors: errors }
  await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2))
  console.log('BROWSER_ECONOMY_RESULT', JSON.stringify(report))
} catch (error) {
  await capture('failure')
  await writeFile(`${output}/browser-failure.json`, JSON.stringify({ message: String(error), errors, body: await page.locator('body').innerText() }, null, 2))
  console.log('BROWSER_FAILURE_BODY', await page.locator('body').innerText())
  throw error
} finally {
  await browser.close()
}
