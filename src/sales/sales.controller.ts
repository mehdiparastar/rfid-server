import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CurrentUser } from 'src/auth/current-user.decorator';
import { User } from 'src/users/entities/user.entity';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';

export type PeriodType = 'day' | 'month' | '6months' | 'year';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) { }

  @Post()
  @UseGuards(JwtAccessGuard) // Protect with auth
  create(@Body() createSaleDto: CreateSaleDto, @CurrentUser() user: Partial<User>) {
    return this.salesService.create(createSaleDto, user);
  }

  @Get()
  findAll() {
    return this.salesService.findAll();
  }

  @Get('stats')
  async getStats(@Query('period') period: PeriodType = 'day') {
    return this.salesService.getStats(period);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findById(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSaleDto: UpdateSaleDto) {
    return this.salesService.update(+id, updateSaleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.salesService.remove(+id);
  }
}
