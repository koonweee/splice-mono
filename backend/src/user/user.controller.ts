import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  CreateUserDto,
  LoginDto,
  LoginResponse,
  User,
} from '../types/User';
import {
  CreateUserDtoSchema,
  LoginDtoSchema,
  LoginResponseSchema,
  UserSchema,
} from '../types/User';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { UserService } from './user.service';

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Public()
  @Post('register')
  @ApiOperation({ description: 'Register a new user' })
  @ZodApiBody({ schema: CreateUserDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'User registered successfully',
    schema: UserSchema,
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(
    @Body(new ZodValidationPipe(CreateUserDtoSchema))
    createUserDto: CreateUserDto,
  ): Promise<User> {
    return this.userService.create(createUserDto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ description: 'Login and get JWT token' })
  @ZodApiBody({ schema: LoginDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Login successful',
    schema: LoginResponseSchema,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body(new ZodValidationPipe(LoginDtoSchema))
    loginDto: LoginDto,
  ): Promise<LoginResponse> {
    return this.userService.login(loginDto);
  }

  @Get('me')
  @ApiOperation({ description: 'Get current user profile' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns current user',
    schema: UserSchema,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() currentUser: JwtUser): Promise<User> {
    const user = await this.userService.findOne(currentUser.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
