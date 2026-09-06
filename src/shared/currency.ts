const dollars = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export const money = (value: number) => dollars.format(value)
export const signedMoney = (value: number) => `${value > 0 ? '+' : ''}${money(value)}`
