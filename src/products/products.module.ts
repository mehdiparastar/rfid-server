import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagsModule } from 'src/tags/tags.module';
import { Product } from './entities/product.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { GoldCurrencyModule } from 'src/gold-currency/gold-currency.module';
import { SalesModule } from 'src/sales/sales.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), TagsModule, GoldCurrencyModule, SalesModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule { }
