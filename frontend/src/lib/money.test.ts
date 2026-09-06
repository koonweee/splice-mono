import { describe, expect, it } from 'vitest'
import { formatMajorMoneyString, formatMoneyWithSign } from './format'
import {
  compareIntegers,
  moneyFromSignedMinorUnits,
  moneyToMajorString,
  parseMinorUnits,
  parseMoneyDraft,
  ratioPercent,
  signedMinorUnits,
  toggleMoneyDraftSign,
} from './money'

describe('exact money', () => {
  it.each([
    ['USD', '0.01', '1'],
    ['JPY', '1234', '1234'],
    ['BTC', '0.00000001', '1'],
    ['ETH', '1.000000000000000001', '1000000000000000001'],
    ['ETH', '10', '10000000000000000000'],
    ['USD', '9007199254740993.01', '900719925474099301'],
  ])(
    'round-trips %s decimal text without numeric conversion',
    (currency, draft, minor) => {
      const money = parseMoneyDraft(draft, currency)
      expect(money.money.amount).toBe(minor)
      expect(moneyToMajorString(money)).toBe(draft)
      expect(JSON.parse(JSON.stringify(money))).toEqual(money)
      expect(moneyToMajorString(parseMoneyDraft('-' + draft, currency))).toBe(
        '-' + draft,
      )
    },
  )

  it('preserves the full permitted integer and rejects overflow', () => {
    const maximum = '9'.repeat(78)
    expect(parseMoneyDraft(maximum, 'JPY').money.amount).toBe(maximum)
    expect(() => parseMoneyDraft('1' + '0'.repeat(78), 'JPY')).toThrow()
    expect(() => parseMinorUnits('01')).toThrow()
  })

  it.each(['', '-', '.', 'NaN', 'Infinity', '1e3', '1,000', '1.001'])(
    'rejects invalid or excessive USD precision: %s',
    (draft) => {
      expect(() => parseMoneyDraft(draft, 'USD')).toThrow()
    },
  )

  it('normalizes zero and draft padding while preserving exact fractional units', () => {
    expect(parseMoneyDraft('-0.00', 'USD')).toEqual({
      money: { amount: '0', currency: 'USD' },
      sign: 'positive',
    })
    expect(parseMoneyDraft('0001.20', 'USD').money.amount).toBe('120')
    expect(parseMoneyDraft('.01', 'USD').money.amount).toBe('1')
    expect(() => parseMoneyDraft('1.1', 'JPY')).toThrow()
  })

  it('changes signs by editing text, retaining every fractional digit', () => {
    expect(toggleMoneyDraftSign('1.000000000000000001')).toBe(
      '-1.000000000000000001',
    )
    expect(toggleMoneyDraftSign('-1.000000000000000001')).toBe(
      '1.000000000000000001',
    )
    expect(toggleMoneyDraftSign('')).toBe('-')
  })

  it('compares and cancels large values before deriving display percentages', () => {
    const left = parseMoneyDraft('9007199254740993.01', 'USD')
    const right = parseMoneyDraft('-9007199254740993', 'USD')
    const difference = signedMinorUnits(left) + signedMinorUnits(right)
    expect(moneyFromSignedMinorUnits(difference, 'USD').money.amount).toBe('1')
    expect(
      compareIntegers(signedMinorUnits(left), -signedMinorUnits(right)),
    ).toBe(1)
    expect(ratioPercent(1n, 4n)).toBe(25)
  })

  it('formats exact large values, negative fractions and rounding ties', () => {
    expect(
      formatMoneyWithSign({
        value: parseMoneyDraft('9007199254740993.01', 'USD'),
      }),
    ).toBe('$9,007,199,254,740,993.01')
    expect(
      formatMoneyWithSign({ value: parseMoneyDraft('-0.01', 'USD') }),
    ).toBe('-$0.01')
    expect(formatMajorMoneyString({ value: '1.005', currency: 'USD' })).toBe(
      '$1.01',
    )
    expect(formatMajorMoneyString({ value: '-1.005', currency: 'USD' })).toBe(
      '-$1.01',
    )
    expect(
      formatMoneyWithSign({ value: parseMoneyDraft('9'.repeat(78), 'JPY') }),
    ).toBe('¥' + '999,'.repeat(25) + '999')
  })
})
