export const mockCryptoBalanceService = {
  getBalance: jest.fn().mockResolvedValue('1.5'),
  validateAddress: jest.fn().mockReturnValue(true),
};
