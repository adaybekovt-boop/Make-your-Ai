import { describe, expect, it } from 'vitest'
import { money, signedMoney } from './currency'

const normalizeSpaces = (value: string) => value.replace(/\s/g, ' ')

describe('USD display formatting', () => {
  it.each([
    [0, '0 $'],
    [1500, '1 500 $'],
    [12000, '12 000 $'],
    [-80, '-80 $'],
    [754.4, '754 $'],
    [754.6, '755 $'],
  ])('formats %s dollars without conversion or fractional cents', (value, expected) => {
    expect(normalizeSpaces(money(value))).toBe(expected)
  })

  it.each([
    [754, '+754 $'],
    [-80, '-80 $'],
    [0, '0 $'],
  ])('preserves the profit sign for %s dollars', (value, expected) => {
    expect(normalizeSpaces(signedMoney(value))).toBe(expected)
  })
})
