import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateTagDto } from './dto/create-tag.dto';
import { TagsService } from './tags.service';
import { Cursor } from 'src/products/products.service';
import { GetTagsDto } from './dto/get-tags-querystring.dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) { }

  @Post()
  create(@Body() createTagDto: CreateTagDto) {
    return this.tagsService.create(createTagDto);
  }

  @Get('')
  findAll() {
    return this.tagsService.findAll();
  }

  @Get('find/:id')
  findOne(@Param('id') id: string) {
    return this.tagsService.findOne({ where: { id: +id } });
  }

  @Get('all')
  async getAllTags(@Query() query: GetTagsDto) {
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

    return this.tagsService.getAllTags({
      cursor: parsedCursor,
      limit,
      sortField,
      sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
      filters: parsedFilters,
    });
  }
}
