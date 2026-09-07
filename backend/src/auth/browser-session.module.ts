import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrowserSessionEntity } from './browser-session.entity';
import { BrowserSessionService } from './browser-session.service';
import { RefreshTokenEntity } from './refresh-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BrowserSessionEntity, RefreshTokenEntity]),
  ],
  providers: [BrowserSessionService],
  exports: [BrowserSessionService],
})
export class BrowserSessionModule {}
