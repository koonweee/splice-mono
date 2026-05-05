import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodApiResponse } from '../common/zod-api-response';
import { Category, CategorySchema } from '../types/Category';
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
  async findAll(): Promise<Category[]> {
    return this.categoryService.findAll();
  }
}
