import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify';
import type { Response } from 'express';
import { z } from 'zod';
import { AccountService } from '../account/account.service';
import * as currentUserDecorator from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodApiResponse } from '../common/zod-api-response';
import {
  BalanceSnapshotType,
  CreateBalanceSnapshotDto,
} from '../types/BalanceSnapshot';
import { MoneySign, MoneyWithSign } from '../types/MoneyWithSign';
import { BalanceSnapshotService } from './balance-snapshot.service';
import { AccountType } from 'plaid';
import { CryptoAccountType } from 'src/types/AccountType';

const ImportResponseSchema = z.object({
  imported: z.number(),
});

function isMulterFile(file: unknown): file is Express.Multer.File {
  return (
    typeof file === 'object' &&
    file !== null &&
    'buffer' in file &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    Buffer.isBuffer((file as any).buffer)
  );
}

@ApiTags('Balance Snapshots')
@Controller('balance-snapshot')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BalanceSnapshotController {
  constructor(
    private readonly balanceSnapshotService: BalanceSnapshotService,
    private readonly accountService: AccountService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('template')
  @ApiOperation({ summary: 'Download CSV template for manual backfill' })
  async getTemplate(
    @currentUserDecorator.CurrentUser() user: currentUserDecorator.JwtUser,
    @Res() res: Response,
  ) {
    const accounts = await this.accountService.findAll(user.userId);
    const columns = [
      'Account Name',
      'Account UUID',
      'Account Type',
      'Currency',
      '2025-01-01',
      '2025-01-15',
    ];

    const data = accounts.map((account) => [
      account.customName || account.name,
      account.id,
      account.type,
      account.currentBalance.money.currency,
      '',
      '',
    ]);

    // Add instructions/example row
    data.unshift([
      'EXAMPLE ROW (Delete or ignore)',
      'uuid-placeholder',
      'depository',
      'USD',
      '1234.56',
      '-150.00',
    ]);

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="balance-template.csv"',
    });

    const stream = stringify([columns, ...data]);
    stream.pipe(res);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import balance snapshots from CSV' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ZodApiResponse({
    status: 201,
    schema: ImportResponseSchema,
    description: 'Number of imported snapshots',
  })
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @currentUserDecorator.CurrentUser() user: currentUserDecorator.JwtUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file || !isMulterFile(file)) {
      throw new BadRequestException('No file uploaded');
    }

    const accounts = await this.accountService.findAll(user.userId);
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const records = parse(file.buffer, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (records.length < 2) {
      throw new BadRequestException('CSV file is empty or missing headers');
    }

    const headerRow = records[0];
    // Expected headers: Account Name, Account UUID, Account Type, Currency, Date1, Date2, ...
    const dateColumns = headerRow.slice(4);

    // Validate date columns
    for (const dateStr of dateColumns) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new BadRequestException(`Invalid date column header: ${dateStr}`);
      }
    }

    const snapshotsToCreate: CreateBalanceSnapshotDto[] = [];

    // Process data rows (skip header)
    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      // Skip empty rows
      if (row.length === 0) continue;

      const accountId = row[1];
      const currency = row[3];

      // Skip example row if user left it in (detected by placeholder UUID or invalid UUID)
      if (
        accountId === 'uuid-placeholder' ||
        !accountId ||
        !/^[0-9a-fA-F-]{36}$/.test(accountId)
      )
        continue;

      const account = accountMap.get(accountId);
      if (!account) {
        // Skip accounts that don't belong to user
        continue;
      }

      if (account.currentBalance.money.currency !== currency) {
        throw new BadRequestException(
          `Currency mismatch for account ${accountId}. Expected ${account.currentBalance.money.currency}, got ${currency}`,
        );
      }

      for (let j = 0; j < dateColumns.length; j++) {
        const dateStr = dateColumns[j];
        const valueStr = row[4 + j];

        if (!valueStr || valueStr.trim() === '') continue;

        const amount = parseFloat(valueStr);
        if (isNaN(amount)) {
          throw new BadRequestException(
            `Invalid amount value at row ${i + 1}, date ${dateStr}: ${valueStr}`,
          );
        }

        const sign = amount < 0 ? MoneySign.NEGATIVE : MoneySign.POSITIVE;
        const absAmount = Math.abs(amount);

        const moneyWithSign = MoneyWithSign.fromFloat(
          currency,
          absAmount,
          sign,
        ).toSerialized();

        const zeroMoneyWithSign = MoneyWithSign.fromFloat(
          currency,
          0,
          MoneySign.POSITIVE,
        ).toSerialized();

        snapshotsToCreate.push({
          accountId,
          snapshotDate: dateStr,
          currentBalance: moneyWithSign,
          availableBalance:
            account.type === AccountType.Brokerage ||
            account.type === CryptoAccountType.CRYPTO_WALLET
              ? zeroMoneyWithSign
              : moneyWithSign,
          snapshotType: BalanceSnapshotType.USER_UPDATE,
        });
      }
    }

    const count = await this.balanceSnapshotService.bulkUpsert(
      snapshotsToCreate,
      user.userId,
    );

    return { imported: count };
  }
}
