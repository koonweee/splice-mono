import { normalizeMcpMoney, toMcpMoney } from '../../src/mcp/mcp-money';
import { MoneySign } from '../../src/types/MoneyWithSign';

describe('mcp-money', () => {
  it('converts serialized money into major units', () => {
    expect(
      toMcpMoney({
        money: { amount: '12345', currency: 'USD' },
        sign: MoneySign.POSITIVE,
      }),
    ).toEqual({
      amount: '123.45',
      currency: 'USD',
      sign: MoneySign.POSITIVE,
    });
  });

  it('normalizes nested serialized money values', () => {
    expect(
      normalizeMcpMoney({
        balance: {
          money: { amount: '12345', currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        transactions: [
          {
            amount: {
              money: { amount: '1599', currency: 'USD' },
              sign: MoneySign.NEGATIVE,
            },
          },
        ],
      }),
    ).toEqual({
      balance: {
        amount: '123.45',
        currency: 'USD',
        sign: MoneySign.POSITIVE,
      },
      transactions: [
        {
          amount: {
            amount: '15.99',
            currency: 'USD',
            sign: MoneySign.NEGATIVE,
          },
        },
      ],
    });
  });
});
