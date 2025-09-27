import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseArrayPipe, Post, Query, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { User } from 'src/users/entities/user.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { Cursor, ProductsService } from './products.service';
import { ValidateProductFilesPipe } from './validate-product-files.pipe';
import { GetProductsDto } from './dto/get-products-querystring.dto';

const MAX_FILES_PER_FIELD = 12;
const MAX_FILE_SIZE = 400 * 1024 * 1024; // 400 MB


@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) { }

  @Post('new')
  @UseGuards(JwtAccessGuard) // Protect with auth
  @UseInterceptors(FileFieldsInterceptor([{ name: 'photos' }, { name: 'previews' }]))
  async create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFiles(
      new ValidateProductFilesPipe({
        maxPerField: MAX_FILES_PER_FIELD,
        maxSize: MAX_FILE_SIZE,
        mime: /^image\//,
      })
    )
    files: { photos?: Express.Multer.File[]; previews?: Express.Multer.File[] },
    @CurrentUser() user: Partial<User>,
  ) {
    return this.productsService.create(createProductDto, files, user);
  }

  @Get('all')
  async getAllProducts(@Query() query: GetProductsDto) {
    const { limit = 20, sort = 'createdAt:desc', filters = {}, cursor = null } = query;
    const [sortField, sortDirection] = sort.split(':');
    // const parsedFilters = (filters && typeof filters === 'string') ? JSON.parse(filters) : {};

    // Parse filters JSON string
    let parsedFilters: Record<string, any> = {};
    try {
      parsedFilters = (filters && typeof filters === 'string') ? JSON.parse(filters) : {};
    } catch (e) {
      throw new Error('Invalid filters format');
    }

    // Parse cursor JSON string
    let parsedCursor: Cursor | null = null;
    if (cursor) {
      try {
        parsedCursor = JSON.parse(cursor) as Cursor;
        parsedCursor.createdAt = new Date(parsedCursor.createdAt);
      } catch (e) {
        throw new Error('Invalid cursor format');
      }
    }

    return this.productsService.getAllProducts({
      cursor: parsedCursor,
      limit,
      sortField,
      sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
      filters: parsedFilters,
    });
  }

  @Get()
  async getProductsByIds(
    @Query('ids', new ParseArrayPipe({ items: Number, separator: ',' })) ids: number[],
  ) {
    if (!ids?.length) throw new BadRequestException('ids is required');
    if (ids.length > 100) throw new BadRequestException('Max 100 ids');

    // de-dup
    ids = Array.from(new Set(ids));

    const products = await this.productsService.getProductsByIds(ids); // SELECT ... WHERE id IN (...)
    return products;
  }

}