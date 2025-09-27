import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoldCurrencyService } from './gold-currency.service';
import { GoldCurrencyController } from './gold-currency.controller';

@Module({
  imports: [HttpModule],
  providers: [GoldCurrencyService],
  exports: [GoldCurrencyService],
  controllers: [GoldCurrencyController],
})
export class GoldCurrencyModule { }