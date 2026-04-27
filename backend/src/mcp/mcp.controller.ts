import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { PersonalAccessTokenOnly } from '../auth/decorators/personal-access-token-only.decorator';
import { SpliceMcpService } from './mcp.service';

@Controller('mcp')
@PersonalAccessTokenOnly()
export class McpController {
  constructor(private readonly mcpService: SpliceMcpService) {}

  @Post()
  @HttpCode(200)
  async handlePost(
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!user?.userId) {
      throw new UnauthorizedException();
    }

    const server = this.mcpService.createServer(user.userId);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message:
              error instanceof Error ? error.message : 'Internal server error',
          },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  }

  @Get()
  @Delete()
  handleUnsupportedMethod(@Res() response: Response): void {
    response.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  }
}
