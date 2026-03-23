import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { AskService } from './ask.service';

const AskChatRequestSchema = z.object({
  messages: z.array(z.any()),
});

type AskChatRequest = z.infer<typeof AskChatRequestSchema>;

@Controller('ask')
export class AskController {
  constructor(private readonly askService: AskService) {}

  @Post('messages')
  async createMessage(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(AskChatRequestSchema)) body: AskChatRequest,
    @Res() response: Response,
  ): Promise<void> {
    await this.askService.streamChat(user.userId, body, response);
  }
}
