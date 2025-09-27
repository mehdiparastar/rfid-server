import { Controller, Get } from '@nestjs/common';
import { GoldCurrencyService } from './gold-currency.service';

@Controller('gold-currency')
export class GoldCurrencyController {
  constructor(private readonly goldCurrencyService: GoldCurrencyService) {}

  @Get()
  async getGoldCurrency() {
    return this.goldCurrencyService.getGoldCurrencyData();
  }
}