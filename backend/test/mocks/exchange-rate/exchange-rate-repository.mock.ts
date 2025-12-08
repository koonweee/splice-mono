import { mockExchangeRate } from './exchange-rate.mock';

const mockExchangeRateEntity = {
  id: 'rate-uuid-123',
  baseCurrency: 'EUR',
  targetCurrency: 'USD',
  rate: 1.08,
  rateDate: '2024-01-15',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  toObject: jest.fn().mockReturnValue(mockExchangeRate),
};

export const mockExchangeRateRepository = {
  save: jest.fn().mockResolvedValue(mockExchangeRateEntity),
  findOne: jest.fn().mockResolvedValue(mockExchangeRateEntity),
  find: jest.fn().mockResolvedValue([mockExchangeRateEntity]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};
