import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import {
  CategorySchema,
  BulkCategoryActionResponseSchema,
  BulkCustomCategoryActionDtoSchema,
  CategoryManagementItemSchema,
  CreateCustomCategoryDtoSchema,
  UpdateCustomCategoryDtoSchema,
  type BulkCategoryActionResponse,
  type BulkCustomCategoryActionDto,
  type Category,
  type CategoryManagementItem,
  type CreateCustomCategoryDto,
  type UpdateCustomCategoryDto,
} from '../types/Category';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { CategoryService } from './category.service';

@ApiTags('category')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ description: 'Get all transaction categories' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns all transaction categories',
    schema: CategorySchema,
    isArray: true,
  })
  async findAll(@CurrentUser() user: JwtUser): Promise<Category[]> {
    return this.categoryService.findAll(user.userId);
  }

  @Get('search')
  @ApiOperation({
    description: "Search the current user's active transaction categories",
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Search query',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns matching visible categories',
    schema: CategorySchema,
    isArray: true,
  })
  async search(
    @CurrentUser() user: JwtUser,
    @Query('q') query = '',
  ): Promise<Category[]> {
    return this.categoryService.search(user.userId, query);
  }

  @Get('filter-options')
  @ApiOperation({
    description:
      "Get the current user's categories suitable for transaction filters",
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns transaction category filter options',
    schema: CategorySchema,
    isArray: true,
  })
  async findFilterOptions(@CurrentUser() user: JwtUser): Promise<Category[]> {
    return this.categoryService.findFilterOptions(user.userId);
  }

  @Get('manage')
  @ApiOperation({
    description:
      'Get the current user category management inventory with usage metadata',
  })
  @ApiQuery({
    name: 'archived',
    required: false,
    description: 'When true, returns archived custom categories only',
    type: Boolean,
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns category management rows',
    schema: CategoryManagementItemSchema,
    isArray: true,
  })
  async findManagement(
    @CurrentUser() user: JwtUser,
    @Query('archived') archived?: string,
  ): Promise<CategoryManagementItem[]> {
    return this.categoryService.findManagement(user.userId, {
      archivedMode: archived === 'true',
    });
  }

  @Get('custom')
  @ApiOperation({
    description: "Get the current user's custom transaction categories",
  })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    description: 'When true, includes archived custom categories',
    type: Boolean,
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns current user custom categories',
    schema: CategorySchema,
    isArray: true,
  })
  async findCustom(
    @CurrentUser() user: JwtUser,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<Category[]> {
    return this.categoryService.findCustom(user.userId, {
      includeArchived: includeArchived === 'true',
    });
  }

  @Post('custom')
  @ApiOperation({ description: 'Create a custom transaction category' })
  @ZodApiBody({ schema: CreateCustomCategoryDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Custom category created successfully',
    schema: CategorySchema,
  })
  @ApiResponse({
    status: 409,
    description: 'A matching visible category already exists',
  })
  async createCustom(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateCustomCategoryDtoSchema))
    createDto: CreateCustomCategoryDto,
  ): Promise<Category> {
    return this.categoryService.createCustom(user.userId, createDto);
  }

  @Patch('custom/bulk')
  @ApiOperation({
    description:
      'Bulk archive, restore, duplicate, or update primary labels for custom categories',
  })
  @ZodApiBody({ schema: BulkCustomCategoryActionDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Custom category bulk action completed',
    schema: BulkCategoryActionResponseSchema,
  })
  async bulkUpdateCustom(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(BulkCustomCategoryActionDtoSchema))
    dto: BulkCustomCategoryActionDto,
  ): Promise<BulkCategoryActionResponse> {
    return this.categoryService.bulkUpdateCustom(user.userId, dto);
  }

  @Patch('custom/:id')
  @ApiOperation({
    description: 'Update, archive, or restore a custom category',
  })
  @ZodApiBody({ schema: UpdateCustomCategoryDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Custom category updated successfully',
    schema: CategorySchema,
  })
  @ApiResponse({ status: 404, description: 'Custom category not found' })
  @ApiResponse({
    status: 409,
    description: 'A matching visible category already exists',
  })
  async updateCustom(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateCustomCategoryDtoSchema))
    updateDto: UpdateCustomCategoryDto,
  ): Promise<Category> {
    const category = await this.categoryService.updateCustom(
      id,
      user.userId,
      updateDto,
    );
    if (!category) {
      throw new NotFoundException(`Custom category with id ${id} not found`);
    }
    return category;
  }
}
