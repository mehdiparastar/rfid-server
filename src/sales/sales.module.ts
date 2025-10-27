import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoldCurrencyModule } from 'src/gold-currency/gold-currency.module';
import { Invoice } from './entities/invoice.entity';
import { SaleItem } from './entities/sale-item.entity';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { CustomersModule } from 'src/customers/customers.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoice.service';

@Module({
  imports: [TypeOrmModule.forFeature([SaleItem, Invoice]), GoldCurrencyModule, CustomersModule],
  controllers: [SalesController, InvoicesController],
  providers: [SalesService, InvoicesService],
  exports: [SalesService]
})
export class SalesModule { }
