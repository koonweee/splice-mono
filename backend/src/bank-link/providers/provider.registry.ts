import { Injectable, NotFoundException } from '@nestjs/common';
import { IBankLinkProvider } from './bank-link-provider.interface';
import { PlaidProvider } from './plaid/plaid.provider';

/**
 * Registry for managing all bank link providers
 * Provides lookup and access to providers by name
 */
@Injectable()
export class ProviderRegistry {
  private providers = new Map<string, IBankLinkProvider>();

  constructor(private plaidProvider: PlaidProvider) {
    // Auto-register all injected providers
    this.registerProvider(plaidProvider);
  }

  /**
   * Register a provider in the registry
   * @param provider Provider to register
   */
  private registerProvider(provider: IBankLinkProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  /**
   * Get provider by name
   * @param providerName Name of the provider (e.g., 'plaid', 'simplefin')
   * @throws NotFoundException if provider not found
   * @returns The provider instance
   */
  getProvider(providerName: string): IBankLinkProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new NotFoundException(
        `Provider '${providerName}' not found. Available providers: ${this.getAllProviderNames().join(', ')}`,
      );
    }
    return provider;
  }

  /**
   * Get all available provider names
   * @returns Array of provider names
   */
  getAllProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }
}
