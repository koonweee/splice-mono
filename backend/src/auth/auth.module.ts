import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { RefreshTokenCleanupScheduledService } from './refresh-token-cleanup.scheduled';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { RefreshTokenEntity } from './refresh-token.entity';
import { PersonalAccessTokenEntity } from './personal-access-token.entity';
import { PersonalAccessTokenService } from './personal-access-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserEntity } from '../user/user.entity';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([
      RefreshTokenEntity,
      PersonalAccessTokenEntity,
      UserEntity,
    ]),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is not set');
        }
        return {
          secret,
          signOptions: { expiresIn: '15m' },
        };
      },
    }),
  ],
  providers: [
    JwtStrategy,
    AuthService,
    PersonalAccessTokenService,
    RefreshTokenCleanupService,
    RefreshTokenCleanupScheduledService,
  ],
  exports: [JwtModule, AuthService, PersonalAccessTokenService],
})
export class AuthModule {}
