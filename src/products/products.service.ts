import { BadRequestException, Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GoldCurrencyService } from 'src/gold-currency/gold-currency.service';
import { calculateGoldPrice } from 'src/helperFunctions/calculateGoldPrice';
import { createSortObject, getByPath, makeSortCondition } from 'src/helperFunctions/createSortObject';
import { uploads_root } from 'src/helperFunctions/paths';
import { conventionalTariffPercent, ItariffENUM } from 'src/sales/entities/sale-item.entity';
import { SalesService } from 'src/sales/sales.service';
import { Tag } from 'src/tags/entities/tag.entity';
import { TagsService } from 'src/tags/tags.service';
import { And, DataSource, In, LessThanOrEqual, Like, MoreThanOrEqual, Raw, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid'; // npm i uuid @types/uuid
import { User } from '../users/entities/user.entity'; // Adjust path
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

export interface Cursor {
  value: string | number | Date; // type depends on your sort field
  createdAt: Date;               // tie-breaker
  id: number;
}

export interface GetAllProductsOptions {
  cursor: Cursor | null
  limit: number;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filters: Record<string, any>;
  tariffType: ItariffENUM
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    private tagsService: TagsService,
    private readonly salesService: SalesService,
    private readonly dataSource: DataSource,
    private readonly goldCurrencyService: GoldCurrencyService
  ) { }

  async create(createProductDto: CreateProductDto, files: { photos?: Express.Multer.File[]; previews?: Express.Multer.File[] }, user: Partial<User>) {
    const product = this.productsRepository.create({
      ...createProductDto,
      createdBy: user,
      inventoryItem: createProductDto.inventoryItem === 'true' ? true : false
    });

    // Handle tags: find or create based on unique EPC.
    const tags: Tag[] = [];
    let tagsExceptions: { ex: string, product: Product }[] = []

    for (const tagDto of createProductDto.tags) {
      // let tag = await this.tagsService.findOne({
      //   where: { epc: tagDto.epc },
      //   relations: { products: { saleItems: true } }
      // });

      // if (!tag) {
      //   tag = await this.tagsService.create({
      //     epc: tagDto.epc,
      //     rssi: tagDto.rssi,
      //     pl: tagDto.pl,
      //     pc: tagDto.pc,
      //     createdBy: user,
      //   });
      // } else {
      //   if (tag.products.length > 0) {
      //     for (const product of tag.products) {
      //       const soldCount = product.saleItems.reduce((p, c) => p + c.quantity, 0)
      //       if (product.quantity > soldCount) {
      //         tagsExceptions.push(`selected tag with EPC of "${tagDto.epc}" is used by product with name of "${product.name}"`)
      //       }
      //     }
      //   }
      // }

      const { status: thisTagCanBeUsed, tag, exceptions } = await this.tagsService.fintTagByEPCAndAssessCanBeUsedThisTag(tagDto.epc)

      const thisTag = (thisTagCanBeUsed && !tag) ? (await this.tagsService.create({ epc: tagDto.epc, rssi: tagDto.rssi, pl: tagDto.pl, pc: tagDto.pc, createdBy: user, })) : tag
      tagsExceptions = [...tagsExceptions, ...exceptions]

      if (thisTag) {
        tags.push(thisTag);
      }
    }

    if (tagsExceptions.length > 0)
      throw new NotAcceptableException(tagsExceptions.join('\n'))

    product.tags = tags;

    // Upload files
    product.photos = await this.uploadFiles(files.photos || [], 'photos');
    product.previews = await this.uploadFiles(files.previews || [], 'previews');

    return await this.productsRepository.save(product);
  }

  private async uploadFiles(files: Express.Multer.File[], folder: string): Promise<string[]> {
    if (files.length === 0) return [];

    const uploadDir = path.join(uploads_root, folder)//path.join(__dirname, '..', '..', 'uploads', folder);
    await fs.mkdir(uploadDir, { recursive: true });

    const paths: string[] = [];
    for (const file of files) {
      // Get the file extension (e.g., '.jpg', '.png')
      const fileExtension = path.extname(file.originalname);

      // Generate a unique filename with the extension
      const uniqueFilename = `${uuidv4()}${fileExtension}`;

      const filePath = path.join(uploadDir, uniqueFilename);

      await fs.writeFile(filePath, file.buffer);

      paths.push(`/uploads/${folder}/${uniqueFilename}`);
    }
    return paths;
  }

  async getAllProducts({
    cursor,
    limit,
    sortField,
    sortDirection,
    filters,
    tariffType,
  }: GetAllProductsOptions) {

    const qFilterValue = filters['q']
    const weightRangeValue = filters['weightRange']
    const makingChargeSellRangeValue = filters['makingChargeSellRange']
    const profitRangeValue = filters['profitRange']
    const priceRangeValue = filters['priceRange']

    const currentCurrency = (await this.goldCurrencyService.getGoldCurrencyData()).gold
    const sortCondition = makeSortCondition(sortField, sortDirection, cursor)

    // const secondSortLevel_ = (sortField !== 'createdAt') ? (sortDirection === 'asc' ? { createdAt: 'ASC' } : { createdAt: 'DESC' }) : {} as any
    const secondSortLevel = (sortDirection === 'asc' ? { id: 'ASC' } : { id: 'DESC' }) as any
    const order = { ...createSortObject(sortField, sortDirection), ...secondSortLevel }

    const currencyCase = `
      CASE Product.subType
        ${currentCurrency.map(c => `WHEN '${c.symbol}' THEN ${c.price}`).join(' ')}
        ELSE 0
      END
    `;

    const karatCase = `
      CASE Product.subType
        ${currentCurrency.map(c => `WHEN '${c.symbol}' THEN ${c.karat}`).join(' ')}
        ELSE 0
      END
    `;

    const minPrice = priceRangeValue?.min
    const maxPrice = priceRangeValue?.max

    const whereQuery = [
      ...sortCondition
        .map(el => ({
          ...el,
          name: el?.["name"] ?
            And(Like(`%${qFilterValue}%`), el?.["name"]) :
            Like(`%${qFilterValue}%`),
          ...(!!weightRangeValue ? { weight: And(LessThanOrEqual(weightRangeValue.max), MoreThanOrEqual(weightRangeValue.min)) } : {}),
          ...(!!makingChargeSellRangeValue ? { makingChargeSell: And(LessThanOrEqual(makingChargeSellRangeValue.max), MoreThanOrEqual(makingChargeSellRangeValue.min)) } : {}),
          ...(!!profitRangeValue ? { profit: And(LessThanOrEqual(profitRangeValue.max), MoreThanOrEqual(profitRangeValue.min)) } : {}),
          ...(!!priceRangeValue ? {
            // calculateGoldPrice
            id: Raw(() => tariffType === "UT" ? `
              :minPrice <= (Product.karat / ${karatCase} * Product.weight * (((1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (Product.vat / 100))) - (Product.vat / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge
              AND Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (Product.vat / 100)) * ${currencyCase} * 10 <= :maxPrice
            `: `
              :minPrice <= (Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (${conventionalTariffPercent} / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge
              AND (Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (2 / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge <= :maxPrice
            `, { minPrice, maxPrice }),
          } : {}),
        })),
      ...sortCondition
        .map(el => ({
          ...el,
          saleItems: {
            invoice: {
              customer: {
                name: el?.["saleItems"]?.["invoice"]?.["customer"]?.["name"] ?
                  And(Like(`%${qFilterValue}%`), el?.["saleItems"]?.["invoice"]?.["customer"]?.["name"]) :
                  Like(`%${qFilterValue}%`)
              }
            }
          },
          ...(!!weightRangeValue ? { weight: And(LessThanOrEqual(weightRangeValue.max), MoreThanOrEqual(weightRangeValue.min)) } : {}),
          ...(!!makingChargeSellRangeValue ? { makingChargeSell: And(LessThanOrEqual(makingChargeSellRangeValue.max), MoreThanOrEqual(makingChargeSellRangeValue.min)) } : {}),
          ...(!!profitRangeValue ? { profit: And(LessThanOrEqual(profitRangeValue.max), MoreThanOrEqual(profitRangeValue.min)) } : {}),
          ...(!!priceRangeValue ? {
            // calculateGoldPrice
            id: Raw(() => tariffType === "UT" ? `
              :minPrice <= (Product.karat / ${karatCase} * Product.weight * (((1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (Product.vat / 100))) - (Product.vat / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge
              AND Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (Product.vat / 100)) * ${currencyCase} * 10 <= :maxPrice
            `: `
              :minPrice <= (Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (${conventionalTariffPercent} / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge
              AND (Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (2 / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge <= :maxPrice
            `, { minPrice, maxPrice }),
          } : {}),
        })),
      ...sortCondition
        .map(el => ({
          ...el,
          tags: {
            epc: el?.["tags"]?.["epc"] ?
              And(Like(`%${qFilterValue}%`), el?.["tags"]?.["epc"]) :
              Like(`%${qFilterValue}%`)
          },
          ...(!!weightRangeValue ? { weight: And(LessThanOrEqual(weightRangeValue.max), MoreThanOrEqual(weightRangeValue.min)) } : {}),
          ...(!!makingChargeSellRangeValue ? { makingChargeSell: And(LessThanOrEqual(makingChargeSellRangeValue.max), MoreThanOrEqual(makingChargeSellRangeValue.min)) } : {}),
          ...(!!profitRangeValue ? { profit: And(LessThanOrEqual(profitRangeValue.max), MoreThanOrEqual(profitRangeValue.min)) } : {}),
          ...(!!priceRangeValue ? {
            // calculateGoldPrice
            id: Raw(() => tariffType === "UT" ? `
              :minPrice <= (Product.karat / ${karatCase} * Product.weight * (((1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (Product.vat / 100))) - (Product.vat / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge
              AND Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (Product.vat / 100)) * ${currencyCase} * 10 <= :maxPrice
            `: `
              :minPrice <= (Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (${conventionalTariffPercent} / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge
              AND (Product.karat / ${karatCase} * Product.weight * (1 + (Product.makingChargeSell / 100)) * (1 + (Product.profit / 100)) * (1 + (2 / 100)) * ${currencyCase} * 10) + Product.accessoriesCharge <= :maxPrice
            `, { minPrice, maxPrice }),
          } : {}),
        })),
    ]

    const [items, total] = await this.productsRepository.findAndCount(
      {
        relations: { saleItems: { invoice: { customer: true } }, tags: true, createdBy: true },
        where: whereQuery,
        order: order,
        take: limit
      }
    )

    const [
      maxWeight,
      minWeight,
      maxProfit,
      minProfit,
      maxMakingChargeSell,
      minMakingChargeSell,
      allProducts
    ] = await Promise.all([
      this.productsRepository.maximum("weight", whereQuery),
      this.productsRepository.minimum("weight", whereQuery),
      this.productsRepository.maximum("profit", whereQuery),
      this.productsRepository.minimum("profit", whereQuery),
      this.productsRepository.maximum("makingChargeSell", whereQuery),
      this.productsRepository.minimum("makingChargeSell", whereQuery),
      this.productsRepository.find({
        relations: { saleItems: { invoice: { customer: true } }, tags: true, createdBy: true },
        where: whereQuery,
        select: { id: true, saleItems: { invoice: { customer: false }, quantity: true }, karat: true, subType: true, profit: true, vat: true, makingChargeSell: true, accessoriesCharge: true, weight: true, tags: false, createdBy: false },
      }),
    ])


    const prices = allProducts.map(el => ({
      karat: el.karat,
      subType: el.subType,
      weight: el.weight,
      profit: el.profit,
      makingChargeSell: el.makingChargeSell,
      vat: el.vat,
      accessoriesCharge: el.accessoriesCharge,
      price: calculateGoldPrice(
        el.karat,
        el.weight,
        el.makingChargeSell,
        el.profit,
        el.vat,
        {
          price: 10 * (currentCurrency.find(it => el.subType === it.symbol)?.price || 0),
          karat: currentCurrency.find(it => el.subType === it.symbol)?.karat || 0,
        },
        el.accessoriesCharge,
        0
      )?.[tariffType] || 0
    })).sort((a, b) => a.price - b.price)

    const minPrices = [prices[0] ?? -1, prices[1] ?? -1]
    const maxPrices = [prices[prices.length - 1] ?? -1, prices[prices.length - 2] ?? -1]

    // Compute next cursor (based on last item's sortField and createdAt)
    const nextCursor =
      items.length === limit && items.length > 0
        ? {
          value: getByPath((items[items.length - 1]), sortField),
          createdAt: items[items.length - 1].createdAt,
          id: items[items.length - 1].id,
        }
        : null;

    return {
      items,
      nextCursor,
      total,
      ranges: {
        weight: { min: minWeight ?? -1, max: maxWeight ?? -1 },
        profit: { min: minProfit ?? -1, max: maxProfit ?? -1 },
        makingChargeSell: { min: minMakingChargeSell ?? -1, max: maxMakingChargeSell ?? -1 },
        price: { min: minPrices, max: maxPrices },
      }
    };
  }

  async getProductsRanges() {
    const maxWeight = await this.productsRepository.maximum("weight")
    const minWeight = await this.productsRepository.minimum("weight")

    const maxProfit = await this.productsRepository.minimum("profit")
    const minProfit = await this.productsRepository.minimum("profit")

    const maxMakingChargeSell = await this.productsRepository.minimum("makingChargeSell")
    const minMakingChargeSell = await this.productsRepository.minimum("makingChargeSell")

    return {
      weight: [minWeight, maxWeight],
      profit: [minProfit, maxProfit],
      makingChargeSell: [minMakingChargeSell, maxMakingChargeSell],
    }

  }

  async getProductsByIds(ids: number[]) {
    return await this.productsRepository.find({ where: { id: In(ids) }, relations: { tags: true, saleItems: true, createdBy: true } })
  }

  async deleteOneProductById(id: number, user: Partial<User>) {
    // 1) Load product with relations we need for checks and cleanup
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: { createdBy: true, tags: true },
    });

    if (!product) {
      // Controller turns falsy into 404, but throwing here is also fine:
      throw new NotFoundException('Product not found');
    }

    // 2) Authorization: owner
    const isOwner = product.createdBy.id === parseInt(user.id as any)
    if (!isOwner) {
      throw new BadRequestException('You are not allowed to delete this product');
    }

    // 3) Referential integrity: block if there are sale items referencing it
    const usedCount = await this.salesService.countByProductId(id)
    if (usedCount > 0) {
      throw new BadRequestException(
        'Cannot delete: product has related sales.',
      );
    }

    // Snapshot file paths before deleting DB row
    const photoPaths = Array.isArray(product.photos) ? product.photos : [];
    const previewPaths = Array.isArray(product.previews) ? product.previews : [];

    // 4) Transaction: detach tags and delete the product
    await this.dataSource.transaction(async (manager) => {
      // remove many-to-many join rows explicitly (safer across DBs)
      if (product.tags?.length) {
        await manager
          .createQueryBuilder()
          .relation(Product, 'tags')
          .of(product)
          .remove(product.tags);
      }

      // delete the product row
      await manager.delete(Product, { id });
    });

    // 5) Best-effort file cleanup (non-fatal if a file is missing)
    await this.deleteFilesSafe([...photoPaths, ...previewPaths]);

    return true;
  }

  async findItemsShouldBeScanned(epcList: string[]) {
    const qb = this.productsRepository
      .createQueryBuilder('p')
      .where('p.inventoryItem = 1')
      .leftJoinAndSelect('p.tags', 'tags')
      .andWhere(`
        p.quantity > (
          SELECT IFNULL(SUM(si.quantity), 0)
          FROM sale_items si
          WHERE si.productId = p.id
        )
      `);

    if (epcList.length > 0) {
      qb.andWhere(`
      EXISTS (
        SELECT 1
        FROM products_tags_tags pt
        JOIN tags t ON t.id = pt.tagsId
        WHERE pt.productsId = p.id
          AND t.epc NOT IN (:...epcList)
      )
    `, { epcList });
    } else {
      // No EPC filter → just ensure it has tags
      qb.andWhere(`
      EXISTS (
        SELECT 1
        FROM products_tags_tags pt
        JOIN tags t ON t.id = pt.tagsId
        WHERE pt.productsId = p.id
      )
    `);
    }

    const product = await qb
      .orderBy('p.id', 'ASC')
      .limit(1)
      .getOne();

    return [product].filter(el => el != null)
  }

  // --- helpers ---

  private async deleteFilesSafe(paths: string[]) {
    const tasks = paths
      .filter(Boolean)
      .map((p) => this.safeUnlink(this.resolveUploadPath(p)));
    await Promise.allSettled(tasks);
  }

  async update(
    id: number,
    updateProductDto: UpdateProductDto,
    files: { photos?: Express.Multer.File[]; previews?: Express.Multer.File[] },
    user: Partial<User>,
  ) {
    // 1) Load existing product with relations
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: { createdBy: true, tags: true, saleItems: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // 2) Authorization: owner only
    const isOwner = product.createdBy.id === parseInt(user.id as any);
    if (!isOwner) {
      throw new BadRequestException('You are not allowed to update this product');
    }

    const isOnlyIncreasedQuantity = (updateProductDto && updateProductDto.quantity && updateProductDto.quantity > product.quantity && Object.keys(updateProductDto).length === 1) || false
    const isOnlyChangeInventoryItem = (updateProductDto && updateProductDto.inventoryItem && Object.keys(updateProductDto).length === 1) || false
    const isOnlyBothChangeInventoryItemAndIncreasedQuantity = (updateProductDto && updateProductDto.inventoryItem && updateProductDto.quantity && updateProductDto.quantity > product.quantity && Object.keys(updateProductDto).length === 2 && Object.keys(updateProductDto).includes("quantity") && Object.keys(updateProductDto).includes("inventoryItem")) || false
    const isOnlyTagChanged = updateProductDto && updateProductDto.tags && Object.keys(updateProductDto).length === 1

    // 3) Referential integrity: block if sold (has sale items) and decrease quantity
    if (updateProductDto && updateProductDto.quantity && (product.quantity > updateProductDto?.quantity)) {
      throw new BadRequestException('Cannot update: product quantity only can be increased.');
    }
    const soldCount = product.saleItems.reduce((p, c) => p + c.quantity, 0);
    if (soldCount > 0 && !(isOnlyIncreasedQuantity || isOnlyChangeInventoryItem || isOnlyBothChangeInventoryItemAndIncreasedQuantity || isOnlyTagChanged)) {
      throw new BadRequestException('Cannot update: product has related sales.');
    }


    // 4) Handle tags if provided in update
    let tags: Tag[] = product.tags || [];
    let tagsExceptions: { ex: string, product: Product }[] = [];

    if (updateProductDto.tags && updateProductDto.tags.length > 0) {
      tags = [];
      for (const tagDto of updateProductDto.tags) {
        // let tag = await this.tagsService.findOne({
        //   where: { epc: tagDto.epc },
        //   relations: { products: { saleItems: true } },
        // });

        // if (!tag) {
        //   tag = await this.tagsService.create({
        //     epc: tagDto.epc,
        //     rssi: tagDto.rssi,
        //     pl: tagDto.pl ?? 0,
        //     pc: tagDto.pc ?? 0,
        //     createdBy: user,
        //   });
        // } else {
        //   // Check if tag is already used by another product
        //   if (tag.products.length > 0 && !tag.products.some(p => p.id === id)) {
        //     for (const p of tag.products) {
        //       const pSoldCount = p.saleItems.reduce((p, c) => p + c.quantity, 0);
        //       if (p.quantity > pSoldCount) {
        //         tagsExceptions.push(`Selected tag with EPC of "${tagDto.epc}" is used by product with name of "${p.name}"`);
        //       }
        //     }
        //   }
        // }

        // tags.push(tag);
        const { status: thisTagCanBeUsed, tag, exceptions } = await this.tagsService.fintTagByEPCAndAssessCanBeUsedThisTag(tagDto.epc)

        const thisTag = (thisTagCanBeUsed && !tag) ? (await this.tagsService.create({ epc: tagDto.epc, rssi: tagDto.rssi, pl: tagDto.pl, pc: tagDto.pc, createdBy: user, })) : tag

        tagsExceptions = [...tagsExceptions, ...exceptions.filter(ex => ex.product.id !== product.id)]

        if (thisTag) {
          tags.push(thisTag);
        }
      }

      if (tagsExceptions.length > 0) {
        throw new NotAcceptableException(tagsExceptions.map(ex => ex.ex).join('\n'));
      }
      updateProductDto.tags = tags
    }

    // 5) Update scalar fields (only if provided)
    Object.assign(product, { tags: updateProductDto.tags?.map(t => product.tags.find(el => el.epc === t.epc) ? product.tags.find(el => el.epc === t.epc) : t) });

    // 6) Handle photos if new files provided
    if (files.photos && files.photos.length > 0) {
      // Delete old photos safely
      await this.deleteFilesSafe(Array.isArray(product.photos) ? product.photos : []);
      // Upload new
      product.photos = await this.uploadFiles(files.photos, 'photos');
    }

    // 7) Handle previews if new files provided
    if (files.previews && files.previews.length > 0) {
      // Delete old previews safely
      await this.deleteFilesSafe(Array.isArray(product.previews) ? product.previews : []);
      // Upload new
      product.previews = await this.uploadFiles(files.previews, 'previews');
    }

    // 8) Transaction: update tags relation and save product
    await this.dataSource.transaction(async (manager) => {
      // Detach old tags if new ones provided
      if (updateProductDto.tags && updateProductDto.tags.length > 0 && product.tags?.length > 0) {
        await manager
          .createQueryBuilder()
          .relation(Product, 'tags')
          .of(product)
          .remove(product.tags);
      }

      // Attach new tags
      if (updateProductDto && updateProductDto.tags && updateProductDto.tags.length > 0 && product.tags.length > 0) {
        await manager
          .createQueryBuilder()
          .relation(Product, 'tags')
          .of(product)
          .add(tags);
      }

      // Save updated product
      await manager.save(Product, { ...product, inventoryItem: updateProductDto.inventoryItem === 'true' ? true : false });
    });

    return product;
  }

  /**
   * Convert DB-stored path (e.g. "/uploads/photos/a.jpg" or "uploads/previews/a.jpg")
   * into an absolute filesystem path under the app root, and ensure it stays inside /uploads.
   */
  private resolveUploadPath(storedPath: string): string {
    // normalize and strip leading slash
    const rel = storedPath.replace(/^\/+/, '');
    const abs = path.join(process.cwd(), rel);

    // Guard: only allow deletion inside /uploads/*
    const uploadsRoot = uploads_root // path.join(process.cwd(), 'uploads');
    const insideUploads = abs.startsWith(uploadsRoot + path.sep) || abs === uploadsRoot;
    if (!insideUploads) {
      // refuse to touch any path outside uploads
      return ''; // will be ignored by safeUnlink
    }
    return abs;
  }

  private async safeUnlink(absPath: string) {
    if (!absPath) return;
    try {
      await fs.unlink(absPath);
    } catch (err: any) {
      // ignore ENOENT (already gone); rethrow other errors if you prefer
      if (err?.code !== 'ENOENT') {
        // You can log this if needed
      }
    }
  }
}
