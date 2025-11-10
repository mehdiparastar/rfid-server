import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CustomersService } from 'src/customers/customers.service';
import { GoldCurrencyService } from 'src/gold-currency/gold-currency.service';
import { User } from 'src/users/entities/user.entity';
import { Between, DataSource, Repository } from 'typeorm';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Invoice } from './entities/invoice.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from 'src/products/entities/product.entity';
import { PeriodType } from './sales.controller';
import dayjs from 'dayjs';
import { Customer } from 'src/customers/entities/customer.entity';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SaleItem) private saleItemsRepository: Repository<SaleItem>,
    @InjectRepository(Invoice) private invoicesRepository: Repository<Invoice>,
    @InjectRepository(Product) private productsRepository: Repository<Product>,
    @InjectRepository(Customer) private customersRepository: Repository<Customer>,
    private readonly dataSource: DataSource,
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
        createdBy: user,
        product: { id: it.productId } as Product,
      });
      return item;
    });

    return this.invoicesRepository.save(invoice);
  }


  async getStats(period: PeriodType) {
    const { start, end } = this.getDateRange(period);


    const totalSQL = `
      select 
        count(distinct productID) productsCount, sum(soldItemCount) totalSoldUniqueItem, sum(sumSoldQuantity) totalSoldQuantity,
        sum(weight * productQuantity) totalWeight, sum(weightPlusMakingCharge * productQuantity) totalWeightPlusMakingCharge, 
        sum(sumSoldWeight) totalSoldWeight, sum(sumSoldWeightPlusMakingCharge) totalSoldWeightPlusMakingCharge, sum(sumAvailableWeight) totalAvailableWeight, sum(sumAvailableWeightPlusMakingCharge) totalAvailableWeightPlusMakingCharge, 
        sum(sumSoldPrice) totalSoldPrice, sum(sumSoldWeightPrice) totalSoldWeightPrice, sum(sumSoldVatPrice) totalSoldVatPrice, sum(sumSoldProfitPrice) totalSoldProfitPrice, 
        sum(sumSoldMakingChargePrice) totalSoldMakingChargePrice
      from(
        select 
          productID, weight, weightPlusMakingCharge, type, subType, productQuantity, vat, profit, makingCharge, count(distinct itemID) soldItemCount, 
          ifnull(sum(soldQuantity),0) sumSoldQuantity, ifnull(sum(soldWeight),0) sumSoldWeight, ifnull(sum(soldWeightPlusMakingCharge),0) sumSoldWeightPlusMakingCharge, 
          ifnull(sum(soldPrice),0) sumSoldPrice, 
          ifnull(sum(soldWeightPrice),0) sumSoldWeightPrice, ifnull(sum(soldVatPrice),0) sumSoldVatPrice, ifnull(sum(soldProfitPrice),0) sumSoldProfitPrice, 
          ifnull(sum(soldMakingChargePrice),0) sumSoldMakingChargePrice, (productQuantity - ifnull(sum(soldQuantity),0)) availableQuantity, 
          ((productQuantity * weight) - ifnull(sum(soldWeight),0)) sumAvailableWeight,
          ((productQuantity * weightPlusMakingCharge) - ifnull(sum(soldWeightPlusMakingCharge),0)) sumAvailableWeightPlusMakingCharge
        from(
          SELECT 
            products.id productID, 
            weight,
            (((100 + makingCharge) / 100) * weight) weightPlusMakingCharge,
            type,
            subType,
            products.quantity productQuantity,
            vat,
            profit,
            makingCharge,
            sale_items.id itemID, 
            spotPrice,
            soldPrice,
            (weight * sale_items.quantity) soldWeight,
            (((100 + makingCharge) / 100) * weight * sale_items.quantity) soldWeightPlusMakingCharge,
            (weight * sale_items.quantity * spotPrice) soldWeightPrice,
            (vat / 100 * sale_items.quantity * spotPrice * weight) soldVatPrice,
            (profit / 100 * sale_items.quantity * spotPrice * weight) soldProfitPrice,
            (makingCharge / 100 * sale_items.quantity * spotPrice * weight) soldMakingChargePrice,
            sale_items.quantity soldQuantity,
            invoiceId
          FROM products
          left join sale_items
          on products.id=sale_items.productId AND sale_items.createdAt BETWEEN ? AND ?
        ) tbl
      group by productID
      ) basetbl
    `

    const groupByTypeSQL = `
      select 
        type,
        count(distinct productID) productsCount, sum(soldItemCount) totalSoldUniqueItem, sum(sumSoldQuantity) totalSoldQuantity,
        sum(weight * productQuantity) totalWeight, sum(weightPlusMakingCharge * productQuantity) totalWeightPlusMakingCharge, 
        sum(sumSoldWeight) totalSoldWeight, sum(sumSoldWeightPlusMakingCharge) totalSoldWeightPlusMakingCharge, sum(sumAvailableWeight) totalAvailableWeight, sum(sumAvailableWeightPlusMakingCharge) totalAvailableWeightPlusMakingCharge, 
        sum(sumSoldPrice) totalSoldPrice, sum(sumSoldWeightPrice) totalSoldWeightPrice, sum(sumSoldVatPrice) totalSoldVatPrice, sum(sumSoldProfitPrice) totalSoldProfitPrice, 
        sum(sumSoldMakingChargePrice) totalSoldMakingChargePrice
      from(
        select 
          productID, weight, weightPlusMakingCharge, type, subType, productQuantity, vat, profit, makingCharge, count(distinct itemID) soldItemCount, 
          ifnull(sum(soldQuantity),0) sumSoldQuantity, ifnull(sum(soldWeight),0) sumSoldWeight, ifnull(sum(soldWeightPlusMakingCharge),0) sumSoldWeightPlusMakingCharge, 
          ifnull(sum(soldPrice),0) sumSoldPrice, 
          ifnull(sum(soldWeightPrice),0) sumSoldWeightPrice, ifnull(sum(soldVatPrice),0) sumSoldVatPrice, ifnull(sum(soldProfitPrice),0) sumSoldProfitPrice, 
          ifnull(sum(soldMakingChargePrice),0) sumSoldMakingChargePrice, (productQuantity - ifnull(sum(soldQuantity),0)) availableQuantity, 
          ((productQuantity * weight) - ifnull(sum(soldWeight),0)) sumAvailableWeight,
          ((productQuantity * weightPlusMakingCharge) - ifnull(sum(soldWeightPlusMakingCharge),0)) sumAvailableWeightPlusMakingCharge
        from(
          SELECT 
            products.id productID, 
            weight,
            (((100 + makingCharge) / 100) * weight) weightPlusMakingCharge,
            type,
            subType,
            products.quantity productQuantity,
            vat,
            profit,
            makingCharge,
            sale_items.id itemID, 
            spotPrice,
            soldPrice,
            (weight * sale_items.quantity) soldWeight,
            (((100 + makingCharge) / 100) * weight * sale_items.quantity) soldWeightPlusMakingCharge,
            (weight * sale_items.quantity * spotPrice) soldWeightPrice,
            (vat / 100 * sale_items.quantity * spotPrice * weight) soldVatPrice,
            (profit / 100 * sale_items.quantity * spotPrice * weight) soldProfitPrice,
            (makingCharge / 100 * sale_items.quantity * spotPrice * weight) soldMakingChargePrice,
            sale_items.quantity soldQuantity,
            invoiceId
          FROM products
          left join sale_items
          on products.id=sale_items.productId AND sale_items.createdAt BETWEEN ? AND ?
        ) tbl
      group by productID
      ) basetbl
      group by type
    `

    const groupBySubTypeSQL = `
      select 
        subType,
        count(distinct productID) productsCount, sum(soldItemCount) totalSoldUniqueItem, sum(sumSoldQuantity) totalSoldQuantity,
        sum(weight * productQuantity) totalWeight, sum(weightPlusMakingCharge * productQuantity) totalWeightPlusMakingCharge, 
        sum(sumSoldWeight) totalSoldWeight, sum(sumSoldWeightPlusMakingCharge) totalSoldWeightPlusMakingCharge, sum(sumAvailableWeight) totalAvailableWeight, sum(sumAvailableWeightPlusMakingCharge) totalAvailableWeightPlusMakingCharge, 
        sum(sumSoldPrice) totalSoldPrice, sum(sumSoldWeightPrice) totalSoldWeightPrice, sum(sumSoldVatPrice) totalSoldVatPrice, sum(sumSoldProfitPrice) totalSoldProfitPrice, 
        sum(sumSoldMakingChargePrice) totalSoldMakingChargePrice
      from(
        select 
          productID, weight, weightPlusMakingCharge, type, subType, productQuantity, vat, profit, makingCharge, count(distinct itemID) soldItemCount, 
          ifnull(sum(soldQuantity),0) sumSoldQuantity, ifnull(sum(soldWeight),0) sumSoldWeight, ifnull(sum(soldWeightPlusMakingCharge),0) sumSoldWeightPlusMakingCharge, 
          ifnull(sum(soldPrice),0) sumSoldPrice, 
          ifnull(sum(soldWeightPrice),0) sumSoldWeightPrice, ifnull(sum(soldVatPrice),0) sumSoldVatPrice, ifnull(sum(soldProfitPrice),0) sumSoldProfitPrice, 
          ifnull(sum(soldMakingChargePrice),0) sumSoldMakingChargePrice, (productQuantity - ifnull(sum(soldQuantity),0)) availableQuantity, 
          ((productQuantity * weight) - ifnull(sum(soldWeight),0)) sumAvailableWeight,
          ((productQuantity * weightPlusMakingCharge) - ifnull(sum(soldWeightPlusMakingCharge),0)) sumAvailableWeightPlusMakingCharge
        from(
          SELECT 
            products.id productID, 
            weight,
            (((100 + makingCharge) / 100) * weight) weightPlusMakingCharge,
            type,
            subType,
            products.quantity productQuantity,
            vat,
            profit,
            makingCharge,
            sale_items.id itemID, 
            spotPrice,
            soldPrice,
            (weight * sale_items.quantity) soldWeight,
            (((100 + makingCharge) / 100) * weight * sale_items.quantity) soldWeightPlusMakingCharge,
            (weight * sale_items.quantity * spotPrice) soldWeightPrice,
            (vat / 100 * sale_items.quantity * spotPrice * weight) soldVatPrice,
            (profit / 100 * sale_items.quantity * spotPrice * weight) soldProfitPrice,
            (makingCharge / 100 * sale_items.quantity * spotPrice * weight) soldMakingChargePrice,
            sale_items.quantity soldQuantity,
            invoiceId
          FROM products
          left join sale_items
          on products.id=sale_items.productId AND sale_items.createdAt BETWEEN ? AND ?
        ) tbl
      group by productID
      ) basetbl
      group by subType
    `

    const [totals] = await this.dataSource.query(totalSQL, [start, end]);
    const groupByTypes = await this.dataSource.query(groupByTypeSQL, [start, end]);
    const groupBySubTypes = await this.dataSource.query(groupBySubTypeSQL, [start, end]);



    // --- New customers in this period ---
    const newCustomersCount = await this.customersRepository.count({
      where: { createdAt: Between(start, end) },
    });

    // --- Top customers by total spent ---
    const topCustomers = await this.invoicesRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.customer', 'customer')
      .innerJoin('invoice.items', 'item')
      .where('invoice.createdAt BETWEEN :start AND :end', { start, end })
      .select('customer.id', 'id')
      .addSelect('customer.name', 'name')
      .addSelect('SUM(item.soldPrice)', 'totalSpent')
      .groupBy('customer.id')
      .orderBy('totalSpent', 'DESC')
      .limit(5)
      .getRawMany();

    // --- Return formatted data ---
    return {
      totals: {
        productsCount: Number(totals?.productsCount || 0),
        totalSoldUniqueItem: Number(totals?.totalSoldUniqueItem || 0),
        totalSoldQuantity: Number(totals?.totalSoldQuantity || 0),
        totalWeight: Number(totals?.totalWeight || 0),
        totalSoldWeight: Number(totals?.totalSoldWeight || 0),
        totalSoldWeightPlusMakingCharge: Number(totals?.totalSoldWeightPlusMakingCharge || 0),
        totalAvailableWeight: Number(totals?.totalAvailableWeight || 0),
        totalSoldPrice: Number(totals?.totalSoldPrice || 0),
        totalSoldWeightPrice: Number(totals?.totalSoldWeightPrice || 0),
        totalSoldVatPrice: Number(totals?.totalSoldVatPrice || 0),
        totalSoldProfitPrice: Number(totals?.totalSoldProfitPrice || 0),
        totalSoldMakingChargePrice: Number(totals?.totalSoldMakingChargePrice || 0),
        totalAvailableWeightPlusMakingCharge: Number(totals?.totalAvailableWeightPlusMakingCharge || 0),
        totalWeightPlusMakingCharge: Number(totals?.totalWeightPlusMakingCharge || 0),
      },
      groupByTypes: groupByTypes.map(el => ({
        type: el.type,
        productsCount: Number(el.productsCount || 0),
        totalSoldUniqueItem: Number(el.totalSoldUniqueItem || 0),
        totalSoldQuantity: Number(el.totalSoldQuantity || 0),
        totalWeight: Number(el.totalWeight || 0),
        totalSoldWeight: Number(el.totalSoldWeight || 0),
        totalSoldWeightPlusMakingCharge: Number(el.totalSoldWeightPlusMakingCharge || 0),
        totalAvailableWeight: Number(el.totalAvailableWeight || 0),
        totalSoldPrice: Number(el.totalSoldPrice || 0),
        totalSoldWeightPrice: Number(el.totalSoldWeightPrice || 0),
        totalSoldVatPrice: Number(el.totalSoldVatPrice || 0),
        totalSoldProfitPrice: Number(el.totalSoldProfitPrice || 0),
        totalSoldMakingChargePrice: Number(el.totalSoldMakingChargePrice || 0),
        totalAvailableWeightPlusMakingCharge: Number(el.totalAvailableWeightPlusMakingCharge || 0),
        totalWeightPlusMakingCharge: Number(el.totalWeightPlusMakingCharge || 0),
      })),
      groupBySubTypes: groupBySubTypes.map(el => ({
        subType: el.subType,
        productsCount: Number(el.productsCount || 0),
        totalSoldUniqueItem: Number(el.totalSoldUniqueItem || 0),
        totalSoldQuantity: Number(el.totalSoldQuantity || 0),
        totalWeight: Number(el.totalWeight || 0),
        totalSoldWeight: Number(el.totalSoldWeight || 0),
        totalSoldWeightPlusMakingCharge: Number(el.totalSoldWeightPlusMakingCharge || 0),
        totalAvailableWeight: Number(el.totalAvailableWeight || 0),
        totalSoldPrice: Number(el.totalSoldPrice || 0),
        totalSoldWeightPrice: Number(el.totalSoldWeightPrice || 0),
        totalSoldVatPrice: Number(el.totalSoldVatPrice || 0),
        totalSoldProfitPrice: Number(el.totalSoldProfitPrice || 0),
        totalSoldMakingChargePrice: Number(el.totalSoldMakingChargePrice || 0),
        totalAvailableWeightPlusMakingCharge: Number(el.totalAvailableWeightPlusMakingCharge || 0),
        totalWeightPlusMakingCharge: Number(el.totalWeightPlusMakingCharge || 0),
      })),
      newCustomersCount,
      topCustomers: topCustomers.map(el => ({
        id: Number(el.id),
        name: `${el.name}`,
        totalSpent: Number(el.totalSpent || 0)
      })),
      period,
    };
  }

  private getDateRange(period: PeriodType) {
    const end = dayjs().endOf('day');
    let start: dayjs.Dayjs;

    switch (period) {
      case 'day':
        start = dayjs().startOf('day');
        break;
      case 'month':
        start = dayjs().subtract(30, 'day').startOf('day');
        break;
      case '6months':
        start = dayjs().subtract(6, 'month').startOf('day');
        break;
      case 'year':
        start = dayjs().subtract(1, 'year').startOf('day');
        break;
      default:
        start = dayjs().startOf('day');
    }

    return { start: start.toDate(), end: end.toDate() };
  }

  findAll() {
    return this.saleItemsRepository.find({ relations: { createdBy: true, product: true, invoice: true } });
  }

  findById(id: number) {
    return this.saleItemsRepository.find({ where: { id } });
  }

  countById(id: number) {
    return this.saleItemsRepository.count({ where: { id } });
  }

  findByProductId(id: number) {
    return this.saleItemsRepository.find({ where: { product: { id } }, relations: { product: true } });
  }

  countByProductId(id: number) {
    return this.saleItemsRepository.count({ where: { product: { id } }, relations: { product: true } });
  }

  update(id: number, updateSaleDto: UpdateSaleDto) {
    return `This action updates a #${id} sale`;
  }

  remove(id: number) {
    return `This action removes a #${id} sale`;
  }
}
