import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { CustomersService } from 'src/customers/customers.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { GoldCurrencyService } from 'src/gold-currency/gold-currency.service';
import { Product } from 'src/products/entities/product.entity';
import { TagsService } from 'src/tags/tags.service';
import { User } from 'src/users/entities/user.entity';
import { Between, DataSource, Repository } from 'typeorm';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Invoice } from './entities/invoice.entity';
import { SaleItem } from './entities/sale-item.entity';
import { PeriodType } from './sales.controller';

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
    private readonly tagsService: TagsService,
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
        discount: it.discount,
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
        sum(weight * productQuantity) totalWeight, sum(weightPlusMakingChargeBuy * productQuantity) totalWeightPlusMakingChargeBuy, 
        sum(sumSoldWeight) totalSoldWeight, sum(sumSoldWeightPlusMakingChargeBuy) totalSoldWeightPlusMakingChargeBuy, sum(sumAvailableWeight) totalAvailableWeight, sum(sumAvailableWeightPlusMakingChargeBuy) totalAvailableWeightPlusMakingChargeBuy, 
        sum(sumSoldPrice) totalSoldPrice, sum(sumSoldWeightPrice) totalSoldWeightPrice, sum(sumSoldVatPrice) totalSoldVatPrice, sum(sumSoldProfitPrice) totalSoldProfitPrice, 
        sum(sumSoldMakingChargeBuyPrice) totalSoldMakingChargeBuyPrice
      from(
        select 
          productID, weight, weightPlusMakingChargeBuy, type, subType, productQuantity, vat, profit, makingChargeBuy, count(distinct itemID) soldItemCount, 
          ifnull(sum(soldQuantity),0) sumSoldQuantity, ifnull(sum(soldWeight),0) sumSoldWeight, ifnull(sum(soldWeightPlusMakingChargeBuy),0) sumSoldWeightPlusMakingChargeBuy, 
          ifnull(sum(soldPrice),0) sumSoldPrice, 
          ifnull(sum(soldWeightPrice),0) sumSoldWeightPrice, ifnull(sum(soldVatPrice),0) sumSoldVatPrice, ifnull(sum(soldProfitPrice),0) sumSoldProfitPrice, 
          ifnull(sum(soldMakingChargeBuyPrice),0) sumSoldMakingChargeBuyPrice, (productQuantity - ifnull(sum(soldQuantity),0)) availableQuantity, 
          ((productQuantity * weight) - ifnull(sum(soldWeight),0)) sumAvailableWeight,
          ((productQuantity * weightPlusMakingChargeBuy) - ifnull(sum(soldWeightPlusMakingChargeBuy),0)) sumAvailableWeightPlusMakingChargeBuy
        from(
          SELECT 
            products.id productID, 
            weight,
            (((100 + makingChargeBuy) / 100) * weight) weightPlusMakingChargeBuy,
            type,
            subType,
            products.quantity productQuantity,
            vat,
            profit,
            makingChargeBuy,
            sale_items.id itemID, 
            spotPrice,
            soldPrice,
            (weight * sale_items.quantity) soldWeight,
            (((100 + makingChargeBuy) / 100) * weight * sale_items.quantity) soldWeightPlusMakingChargeBuy,
            (weight * sale_items.quantity * spotPrice) soldWeightPrice,
            (vat / 100 * sale_items.quantity * spotPrice * weight) soldVatPrice,
            (profit / 100 * sale_items.quantity * spotPrice * weight) soldProfitPrice,
            (makingChargeBuy / 100 * sale_items.quantity * spotPrice * weight) soldMakingChargeBuyPrice,
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
        sum(weight * productQuantity) totalWeight, sum(weightPlusMakingChargeBuy * productQuantity) totalWeightPlusMakingChargeBuy, 
        sum(sumSoldWeight) totalSoldWeight, sum(sumSoldWeightPlusMakingChargeBuy) totalSoldWeightPlusMakingChargeBuy, sum(sumAvailableWeight) totalAvailableWeight, sum(sumAvailableWeightPlusMakingChargeBuy) totalAvailableWeightPlusMakingChargeBuy, 
        sum(sumSoldPrice) totalSoldPrice, sum(sumSoldWeightPrice) totalSoldWeightPrice, sum(sumSoldVatPrice) totalSoldVatPrice, sum(sumSoldProfitPrice) totalSoldProfitPrice, 
        sum(sumSoldMakingChargeBuyPrice) totalSoldMakingChargeBuyPrice
      from(
        select 
          productID, weight, weightPlusMakingChargeBuy, type, subType, productQuantity, vat, profit, makingChargeBuy, count(distinct itemID) soldItemCount, 
          ifnull(sum(soldQuantity),0) sumSoldQuantity, ifnull(sum(soldWeight),0) sumSoldWeight, ifnull(sum(soldWeightPlusMakingChargeBuy),0) sumSoldWeightPlusMakingChargeBuy, 
          ifnull(sum(soldPrice),0) sumSoldPrice, 
          ifnull(sum(soldWeightPrice),0) sumSoldWeightPrice, ifnull(sum(soldVatPrice),0) sumSoldVatPrice, ifnull(sum(soldProfitPrice),0) sumSoldProfitPrice, 
          ifnull(sum(soldMakingChargeBuyPrice),0) sumSoldMakingChargeBuyPrice, (productQuantity - ifnull(sum(soldQuantity),0)) availableQuantity, 
          ((productQuantity * weight) - ifnull(sum(soldWeight),0)) sumAvailableWeight,
          ((productQuantity * weightPlusMakingChargeBuy) - ifnull(sum(soldWeightPlusMakingChargeBuy),0)) sumAvailableWeightPlusMakingChargeBuy
        from(
          SELECT 
            products.id productID, 
            weight,
            (((100 + makingChargeBuy) / 100) * weight) weightPlusMakingChargeBuy,
            type,
            subType,
            products.quantity productQuantity,
            vat,
            profit,
            makingChargeBuy,
            sale_items.id itemID, 
            spotPrice,
            soldPrice,
            (weight * sale_items.quantity) soldWeight,
            (((100 + makingChargeBuy) / 100) * weight * sale_items.quantity) soldWeightPlusMakingChargeBuy,
            (weight * sale_items.quantity * spotPrice) soldWeightPrice,
            (vat / 100 * sale_items.quantity * spotPrice * weight) soldVatPrice,
            (profit / 100 * sale_items.quantity * spotPrice * weight) soldProfitPrice,
            (makingChargeBuy / 100 * sale_items.quantity * spotPrice * weight) soldMakingChargeBuyPrice,
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
        sum(weight * productQuantity) totalWeight, sum(weightPlusMakingChargeBuy * productQuantity) totalWeightPlusMakingChargeBuy, 
        sum(sumSoldWeight) totalSoldWeight, sum(sumSoldWeightPlusMakingChargeBuy) totalSoldWeightPlusMakingChargeBuy, sum(sumAvailableWeight) totalAvailableWeight, sum(sumAvailableWeightPlusMakingChargeBuy) totalAvailableWeightPlusMakingChargeBuy, 
        sum(sumSoldPrice) totalSoldPrice, sum(sumSoldWeightPrice) totalSoldWeightPrice, sum(sumSoldVatPrice) totalSoldVatPrice, sum(sumSoldProfitPrice) totalSoldProfitPrice, 
        sum(sumSoldMakingChargeBuyPrice) totalSoldMakingChargeBuyPrice
      from(
        select 
          productID, weight, weightPlusMakingChargeBuy, type, subType, productQuantity, vat, profit, makingChargeBuy, count(distinct itemID) soldItemCount, 
          ifnull(sum(soldQuantity),0) sumSoldQuantity, ifnull(sum(soldWeight),0) sumSoldWeight, ifnull(sum(soldWeightPlusMakingChargeBuy),0) sumSoldWeightPlusMakingChargeBuy, 
          ifnull(sum(soldPrice),0) sumSoldPrice, 
          ifnull(sum(soldWeightPrice),0) sumSoldWeightPrice, ifnull(sum(soldVatPrice),0) sumSoldVatPrice, ifnull(sum(soldProfitPrice),0) sumSoldProfitPrice, 
          ifnull(sum(soldMakingChargeBuyPrice),0) sumSoldMakingChargeBuyPrice, (productQuantity - ifnull(sum(soldQuantity),0)) availableQuantity, 
          ((productQuantity * weight) - ifnull(sum(soldWeight),0)) sumAvailableWeight,
          ((productQuantity * weightPlusMakingChargeBuy) - ifnull(sum(soldWeightPlusMakingChargeBuy),0)) sumAvailableWeightPlusMakingChargeBuy
        from(
          SELECT 
            products.id productID, 
            weight,
            (((100 + makingChargeBuy) / 100) * weight) weightPlusMakingChargeBuy,
            type,
            subType,
            products.quantity productQuantity,
            vat,
            profit,
            makingChargeBuy,
            sale_items.id itemID, 
            spotPrice,
            soldPrice,
            (weight * sale_items.quantity) soldWeight,
            (((100 + makingChargeBuy) / 100) * weight * sale_items.quantity) soldWeightPlusMakingChargeBuy,
            (weight * sale_items.quantity * spotPrice) soldWeightPrice,
            (vat / 100 * sale_items.quantity * spotPrice * weight) soldVatPrice,
            (profit / 100 * sale_items.quantity * spotPrice * weight) soldProfitPrice,
            (makingChargeBuy / 100 * sale_items.quantity * spotPrice * weight) soldMakingChargeBuyPrice,
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
        totalSoldWeightPlusMakingChargeBuy: Number(totals?.totalSoldWeightPlusMakingChargeBuy || 0),
        totalAvailableWeight: Number(totals?.totalAvailableWeight || 0),
        totalSoldPrice: Number(totals?.totalSoldPrice || 0),
        totalSoldWeightPrice: Number(totals?.totalSoldWeightPrice || 0),
        totalSoldVatPrice: Number(totals?.totalSoldVatPrice || 0),
        totalSoldProfitPrice: Number(totals?.totalSoldProfitPrice || 0),
        totalSoldMakingChargeBuyPrice: Number(totals?.totalSoldMakingChargeBuyPrice || 0),
        totalAvailableWeightPlusMakingChargeBuy: Number(totals?.totalAvailableWeightPlusMakingChargeBuy || 0),
        totalWeightPlusMakingChargeBuy: Number(totals?.totalWeightPlusMakingChargeBuy || 0),
      },
      groupByTypes: groupByTypes.map(el => ({
        type: el.type,
        productsCount: Number(el.productsCount || 0),
        totalSoldUniqueItem: Number(el.totalSoldUniqueItem || 0),
        totalSoldQuantity: Number(el.totalSoldQuantity || 0),
        totalWeight: Number(el.totalWeight || 0),
        totalSoldWeight: Number(el.totalSoldWeight || 0),
        totalSoldWeightPlusMakingChargeBuy: Number(el.totalSoldWeightPlusMakingChargeBuy || 0),
        totalAvailableWeight: Number(el.totalAvailableWeight || 0),
        totalSoldPrice: Number(el.totalSoldPrice || 0),
        totalSoldWeightPrice: Number(el.totalSoldWeightPrice || 0),
        totalSoldVatPrice: Number(el.totalSoldVatPrice || 0),
        totalSoldProfitPrice: Number(el.totalSoldProfitPrice || 0),
        totalSoldMakingChargeBuyPrice: Number(el.totalSoldMakingChargeBuyPrice || 0),
        totalAvailableWeightPlusMakingChargeBuy: Number(el.totalAvailableWeightPlusMakingChargeBuy || 0),
        totalWeightPlusMakingChargeBuy: Number(el.totalWeightPlusMakingChargeBuy || 0),
      })),
      groupBySubTypes: groupBySubTypes.map(el => ({
        subType: el.subType,
        productsCount: Number(el.productsCount || 0),
        totalSoldUniqueItem: Number(el.totalSoldUniqueItem || 0),
        totalSoldQuantity: Number(el.totalSoldQuantity || 0),
        totalWeight: Number(el.totalWeight || 0),
        totalSoldWeight: Number(el.totalSoldWeight || 0),
        totalSoldWeightPlusMakingChargeBuy: Number(el.totalSoldWeightPlusMakingChargeBuy || 0),
        totalAvailableWeight: Number(el.totalAvailableWeight || 0),
        totalSoldPrice: Number(el.totalSoldPrice || 0),
        totalSoldWeightPrice: Number(el.totalSoldWeightPrice || 0),
        totalSoldVatPrice: Number(el.totalSoldVatPrice || 0),
        totalSoldProfitPrice: Number(el.totalSoldProfitPrice || 0),
        totalSoldMakingChargeBuyPrice: Number(el.totalSoldMakingChargeBuyPrice || 0),
        totalAvailableWeightPlusMakingChargeBuy: Number(el.totalAvailableWeightPlusMakingChargeBuy || 0),
        totalWeightPlusMakingChargeBuy: Number(el.totalWeightPlusMakingChargeBuy || 0),
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

  async canReUseThisInvoiceTags(invoiceId: number) {
    const saleItems = await this.saleItemsRepository.find({
      where: { invoice: { id: invoiceId } },
      relations: { product: { tags: true } }
    })
    const thisInvoiceProducts = saleItems.map(si => si.product)
    const thisInvoiceTags = saleItems.map(si => si.product.tags.map(t => t.epc)).flat()

    const res = await Promise.all(thisInvoiceTags.map(epc => this.tagsService.fintTagByEPCAndAssessCanBeUsedThisTag(epc)))


    const tagsExceptions = res.map(item => item.exceptions).flat()

    return {
      status: tagsExceptions.length === 0,
      tagsExceptions
    }
  }
}
