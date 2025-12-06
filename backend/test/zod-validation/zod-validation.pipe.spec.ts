import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../../src/zod-validation/zod-validation.pipe';
import { CreateAccountDtoSchema } from '../../src/types/Account';
import { z } from 'zod';

describe('ZodValidationPipe', () => {
  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(CreateAccountDtoSchema);
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
            amount: 1000,
          },
          sign: 'credit',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: 1000,
          },
          sign: 'credit',
        },
        type: 'depository',
        subType: null,
        bankLinkId: null,
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
            amount: 1000,
          },
          sign: 'credit',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: 1000,
          },
          sign: 'credit',
        },
        type: 'depository',
        subType: null,
        bankLinkId: null,
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
            amount: 1000,
          },
          sign: 'credit',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: 1000,
          },
          sign: 'credit',
        },
        type: 'invalid-type',
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
            amount: 1000,
          },
          sign: 'credit',
        },
        type: 'depository',
      };

      expect(() => pipe.transform(invalidDto)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when money amount is not a number', () => {
      const invalidDto = {
        name: 'Test Account',
        availableBalance: {
          money: {
            currency: 'USD',
            amount: 'not-a-number',
          },
          sign: 'credit',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: 1000,
          },
          sign: 'credit',
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
            amount: 10.99, // Decimal not allowed - must be integer cents (1099)
          },
          sign: 'credit',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: 1000,
          },
          sign: 'credit',
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
            amount: 1000,
          },
          sign: 'invalid-sign',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: 1000,
          },
          sign: 'credit',
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
          sign: 'credit',
        },
        currentBalance: {
          money: {
            currency: 'USD',
            amount: 1000,
          },
          sign: 'credit',
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
