export { money, signedMoney } from '../shared/currency'

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })

export const quantity = (value: number) => decimal.format(value)
export const percent = (value: number) => `${number.format(value * 100)}%`
export const hours = (value: number | null) => value === null ? 'не окупится' : `${quantity(value)} игр. ч`

export function serversText(count: number) {
  const lastTwo = count % 100
  const ending = lastTwo >= 11 && lastTwo <= 14 ? 'серверов' : count % 10 === 1 ? 'сервер' : count % 10 >= 2 && count % 10 <= 4 ? 'сервера' : 'серверов'
  return `${count} ${ending}`
}

export function gameClock(elapsed: number) {
  const minutes = Math.floor(elapsed * 60)
  const hour = (8 + Math.floor(minutes / 60)) % 24
  return {
    day: Math.floor((elapsed + 8) / 24) + 1,
    time: `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  }
}
