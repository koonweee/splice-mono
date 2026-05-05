import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GoogleOAuthService } from '../auth/google-oauth.service';
import { UserController } from './user.controller';
import { UserEntity } from './user.entity';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    AuthModule, // Import AuthModule to access JwtService
  ],
  controllers: [UserController],
  providers: [UserService, GoogleOAuthService],
  exports: [UserService],
})
export class UserModule {}
