export interface SecurityPricePoint {
  date: string;
  closePrice: number;
  priceCurrency: string;
}

export interface SecurityPriceProvider {
  readonly providerName: string;

  getHistoricalPrices(
    providerSymbol: string,
    startDate: string,
    endDate: string,
  ): Promise<SecurityPricePoint[]>;
}
