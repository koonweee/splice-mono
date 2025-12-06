import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import { AccountSchema, type Account } from '../types/Account';
import type {
  InitiateLinkRequest,
  InitiateLinkResponse,
} from '../types/BankLink';
import {
  InitiateLinkRequestSchema,
  InitiateLinkResponseSchema,
} from '../types/BankLink';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { BankLinkService } from './bank-link.service';

@ApiTags('bank-link')
@Controller('bank-link')
export class BankLinkController {
  constructor(private bankLinkService: BankLinkService) {}

  @Post('initiate/:provider')
  @ApiOperation({
    description: 'Initiate bank account linking with specified provider',
  })
  @ZodApiBody({ schema: InitiateLinkRequestSchema })
  @ZodApiResponse({
    status: 201,
    description:
      'Returns link URL/token and pending LinkedAccount ID for frontend',
    schema: InitiateLinkResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found',
  })
  async initiateLinking(
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(InitiateLinkRequestSchema))
    body: InitiateLinkRequest,
    @CurrentUser() currentUser: JwtUser,
  ): Promise<InitiateLinkResponse> {
    return this.bankLinkService.initiateLinking(
      body.accountId,
      provider,
      currentUser.userId,
      body.redirectUri,
    );
  }

  @Public()
  @Post('webhook/:provider')
  @HttpCode(200)
  @ApiOperation({
    description: 'Handle webhook from provider (called by external service)',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook received and processed',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid webhook signature',
  })
  @ApiResponse({
    status: 404,
    description: 'Provider or LinkedAccount not found',
  })
  async handleWebhook(
    @Param('provider') provider: string,
    @Req() req: Request,
  ): Promise<{ received: boolean }> {
    // Get raw body string for signature verification (enabled via rawBody: true in main.ts)
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
    // Convert headers to simple string record
    const headers: Record<string, string> = Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : (value ?? ''),
      ]),
    );

    await this.bankLinkService.handleWebhook(
      provider,
      rawBody,
      headers,
      req.body as Record<string, unknown>,
    );
    return { received: true };
  }

  @Post('sync-all')
  @ApiOperation({
    description: 'Sync accounts for all bank links',
  })
  @ZodApiResponse({
    status: 201,
    description: 'Returns all synced accounts from all bank links',
    schema: AccountSchema,
    isArray: true,
  })
  async syncAllAccounts(@CurrentUser() user: JwtUser): Promise<Account[]> {
    return this.bankLinkService.syncAllAccounts(user.userId);
  }
}
