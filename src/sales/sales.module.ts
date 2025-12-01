import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from 'src/customers/customers.module';
import { Customer } from 'src/customers/entities/customer.entity';
import { GoldCurrencyModule } from 'src/gold-currency/gold-currency.module';
import { Product } from 'src/products/entities/product.entity';
import { TagsModule } from 'src/tags/tags.module';
import { Invoice } from './entities/invoice.entity';
import { SaleItem } from './entities/sale-item.entity';
import { InvoicesService } from './invoice.service';
import { InvoicesController } from './invoices.controller';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [TypeOrmModule.forFeature([SaleItem, Invoice, Product, Customer]), GoldCurrencyModule, CustomersModule, TagsModule],
  controllers: [SalesController, InvoicesController],
  providers: [SalesService, InvoicesService],
  exports: [SalesService]
})
export class SalesModule { }
