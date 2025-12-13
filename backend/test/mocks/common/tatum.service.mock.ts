export const mockTatumService = {
  getEthereumBalance: jest.fn().mockResolvedValue('1.5'),
  getBitcoinBalance: jest.fn().mockResolvedValue('0.025'),
  getExchangeRate: jest.fn().mockResolvedValue(2500),
  validateAddress: jest.fn().mockReturnValue(true),
};
