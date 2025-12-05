import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Cursor } from 'src/products/products.service';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { GetCustomersDto } from './dto/get-customers-querystring.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) { }

  @Get('search')
  async search(@Query('q') q: string) {
    if (!q || q.length < 2) return [];
    return this.customersService.searchCustomers(q);
  }

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.findOrCreate(createCustomerDto);
  }

  @Get()
  findAll() {
    return this.customersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(+id, updateCustomerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(+id);
  }

  @Get('find/all')
  async getAllCustomers(@Query() query: GetCustomersDto) {
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

    return this.customersService.getAllCustomers({
      cursor: parsedCursor,
      limit,
      sortField,
      sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
      filters: parsedFilters,
    });
  }
}
