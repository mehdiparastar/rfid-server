import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CustomersService } from 'src/customers/customers.service';
import { GoldCurrencyService } from 'src/gold-currency/gold-currency.service';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Invoice } from './entities/invoice.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from 'src/products/entities/product.entity';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SaleItem) private saleItemsRepository: Repository<SaleItem>,
    @InjectRepository(Invoice) private invoicesRepository: Repository<Invoice>,
    private readonly goldCurrencyService: GoldCurrencyService,
    private readonly customersService: CustomersService,
  ) { }

  async create(createSaleDto: CreateSaleDto, user: Partial<User>) {
    const { customer: cDto, items, ...rest } = createSaleDto;

    const customer = await this.customersService.findOrCreate(cDto)

    const invoice = this.invoicesRepository.create({
      ...rest,
      sellDate: new Date(),
      customer,
      createdBy: user,
    });

    // attach items
    invoice.items = items.map(it => {
      const item = this.saleItemsRepository.create({
        quantity: it.quantity,
        soldPrice: it.soldPrice,
        spotPrice: it.spotPrice,
        product: { id: it.productId } as Product,
      });
      return item;
    });

    return this.invoicesRepository.save(invoice);
  }

  findAll() {
    return `This action returns all sales`;
  }

  findOne(id: number) {
    return `This action returns a #${id} sale`;
  }

  update(id: number, updateSaleDto: UpdateSaleDto) {
    return `This action updates a #${id} sale`;
  }

  remove(id: number) {
    return `This action removes a #${id} sale`;
  }
}
