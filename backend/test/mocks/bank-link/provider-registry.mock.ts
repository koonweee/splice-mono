import { NotFoundException } from '@nestjs/common';
import { mockPlaidProvider } from './provider.mock';

export const mockProviderRegistry = {
  getProvider: jest.fn((providerName: string) => {
    if (providerName === 'plaid') {
      return mockPlaidProvider;
    }
    throw new NotFoundException(`Provider '${providerName}' not found`);
  }),
  getAllProviderNames: jest.fn().mockReturnValue(['plaid', 'simplefin']),
};
