import { BadRequestException } from '@nestjs/common';
import { generateSchemaComponents } from '../../src/common/zod-api-response';
import { ZodValidationPipe } from '../../src/zod-validation/zod-validation.pipe';
import { UpdateBalanceBodySchema } from '../../src/account/account.controller';
import {
  CreateManualAccountDtoSchema,
  UpdateAccountMetadataDtoSchema,
} from '../../src/types/Account';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  UpdateTransactionCategoryDtoSchema,
  UpdateTransactionReportingDateDtoSchema,
} from '../../src/types/Transaction';
import { z } from 'zod';

describe('ZodValidationPipe', () => {
  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(CreateManualAccountDtoSchema);
  });

  it('rejects provider-managed fields on public account writes', () => {
    const manualAccount = {
      name: 'Cash',
      type: 'depository',
      subType: null,
      availableBalance: {
        money: { amount: '10000', currency: 'USD' },
        sign: MoneySign.POSITIVE,
      },
      currentBalance: {
        money: { amount: '10000', currency: 'USD' },
        sign: MoneySign.POSITIVE,
      },
    };

    expect(() =>
      CreateManualAccountDtoSchema.parse({
        ...manualAccount,
        bankLinkId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow();
    expect(() =>
      CreateManualAccountDtoSchema.parse({
        ...manualAccount,
        externalAccountId: 'provider-account-id',
      }),
    ).toThrow();
    expect(() =>
      UpdateAccountMetadataDtoSchema.parse({
        notes: 'User note',
        currentBalance: manualAccount.currentBalance,
      }),
    ).toThrow();
  });

  it('rejects negative money magnitudes', () => {
    expect(() =>
      CreateManualAccountDtoSchema.parse({
        name: 'Cash',
        type: 'depository',
        subType: null,
        availableBalance: {
          money: { amount: '-10000', currency: 'USD' },
          sign: MoneySign.NEGATIVE,
        },
        currentBalance: {
          money: { amount: '-10000', currency: 'USD' },
          sign: MoneySign.NEGATIVE,
        },
      }),
    ).toThrow();
  });

  it('allows only reportingDateOverride on the narrow transaction update', () => {
    expect(
      UpdateTransactionReportingDateDtoSchema.parse({
        reportingDateOverride: '2026-08-15',
      }),
    ).toEqual({ reportingDateOverride: '2026-08-15' });
    expect(() =>
      UpdateTransactionReportingDateDtoSchema.parse({
        reportingDateOverride: '2026-08-15',
        amount: {
          money: { amount: '100', currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
      }),
    ).toThrow();
  });

  it('rejects provider-managed fields on other retained narrow writes', () => {
    expect(() =>
      UpdateBalanceBodySchema.parse({
        balance: {
          money: { amount: '100', currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        bankLinkId: '00000000-0000-4000-8000-000000000001',
      }),
    ).toThrow();
    expect(() =>
      UpdateTransactionCategoryDtoSchema.parse({
        categoryId: null,
        externalTransactionId: 'provider-transaction-id',
      }),
    ).toThrow();
  });

  it('publishes the manual balance body as a concrete OpenAPI component', () => {
    const components = generateSchemaComponents();

    expect(components.UpdateBalanceBody).toEqual(
      expect.objectContaining({
        type: 'object',
        required: ['balance'],
        properties: {
          balance: { $ref: '#/components/schemas/MoneyWithSign' },
        },
      }),
    );
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  describe('transform', () => {
    it('should successfully validate and return valid data', () => {
      const validDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'depository',
        subType: null,
      };

      const result = pipe.transform(validDto);

      expect(result).toEqual(validDto);
    });

    it('should successfully validate data with null values for nullable fields', () => {
      const validDto = {
        name: null,
        availableBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'depository',
        subType: null,
      };

      const result = pipe.transform(validDto);

      expect(result).toEqual(validDto);
    });

    it('should throw BadRequestException when required fields are missing', () => {
      const invalidDto = {
        name: 'Test Account',
        // missing availableBalance, currentBalance, and type
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when type is invalid', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'invalid-type',
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when type is manual', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'manual',
        subType: null,
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when balance structure is invalid', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: 'not-a-valid-balance',
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'depository',
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when money amount is not canonical integer text', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            amount: 'not-a-number',
          },
          sign: 'positive',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'depository',
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when money amount is a decimal (must be integer cents)', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            amount: '10.99', // Decimal not allowed - must be integer cents (1099)
          },
          sign: 'positive',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'depository',
        subType: null,
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when sign is invalid', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'invalid-sign',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'depository',
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when money object is missing required fields', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            // missing amount
          },
          sign: 'positive',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: '1000',
          },
          sign: 'positive',
        },
        type: 'depository',
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should work with different schemas', () => {
      const simpleSchema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const simplePipe = new ZodValidationPipe(simpleSchema);

      const validData = { name: 'John', age: 30 };
      const result = simplePipe.transform(validData);

      expect(result).toEqual(validData);
    });

    it('should throw BadRequestException with validation error details', () => {
      const invalidDto = {
        name: 'Test Account',
        type: 'depository',
        // missing required balance fields
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);

      try {
        pipe.transform(invalidDto);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (error instanceof BadRequestException) {
          expect(error.message).toBe('Validation failed');
        }
      }
    });
  });
});
