import { MODULE_METADATA } from '@nestjs/common/constants';
import { CurrencyExchangeModule } from '../../src/currency-exchange/currency-exchange.module';
import { TransactionModule } from '../../src/transaction/transaction.module';

describe('TransactionModule', () => {
  it('imports CurrencyExchangeModule for controller currency conversion', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      TransactionModule,
    ) as unknown[];

    expect(imports).toContain(CurrencyExchangeModule);
  });
});
