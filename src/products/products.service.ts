import { BadRequestException, ForbiddenException, Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GoldCurrencyService } from 'src/gold-currency/gold-currency.service';
import { Tag } from 'src/tags/entities/tag.entity';
import { TagsService } from 'src/tags/tags.service';
import { And, DataSource, In, LessThan, Like, MoreThan, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid'; // npm i uuid @types/uuid
import { User } from '../users/entities/user.entity'; // Adjust path
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { createSortObject, getByPath, makeSortCondition } from 'src/helperFunctions/createSortObject';
import { SalesService } from 'src/sales/sales.service';
import { UpdateProductDto } from './dto/update-product.dto';

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
    const tagsExceptions: string[] = []

    for (const tagDto of createProductDto.tags) {
      let tag = await this.tagsService.findOne({
        where: { epc: tagDto.epc },
        relations: { products: { saleItems: true } }
      });

      if (!tag) {
        tag = await this.tagsService.create({
          epc: tagDto.epc,
          rssi: tagDto.rssi,
          pl: tagDto.pl,
          pc: tagDto.pc,
          createdBy: user,
        });
      } else {
        if (tag.products.length > 0) {
          for (const product of tag.products) {
            const soldCount = product.saleItems.reduce((p, c) => p + c.quantity, 0)
            if (product.quantity > soldCount) {
              tagsExceptions.push(`selected tag with EPC of "${tagDto.epc}" is used by product with name of "${product.name}"`)
            }
          }
        }
      }

      tags.push(tag);
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

    const uploadDir = path.join(__dirname, '..', '..', 'uploads', folder);
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
  }: GetAllProductsOptions) {

    const qFilterValue = filters['q']

    const sortCondition = makeSortCondition(sortField, sortDirection, cursor)

    // const secondSortLevel_ = (sortField !== 'createdAt') ? (sortDirection === 'asc' ? { createdAt: 'ASC' } : { createdAt: 'DESC' }) : {} as any
    const secondSortLevel = (sortDirection === 'asc' ? { id: 'ASC' } : { id: 'DESC' }) as any
    const order = { ...createSortObject(sortField, sortDirection), ...secondSortLevel }


    const [items, total] = await this.productsRepository.findAndCount(
      {
        relations: { saleItems: { invoice: { customer: true } }, tags: true, createdBy: true },
        where: [
          ...sortCondition
            .map(el => ({
              ...el,
              name: el?.["name"] ?
                And(Like(`%${qFilterValue}%`), el?.["name"]) :
                Like(`%${qFilterValue}%`)

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
              }
            })),
        ],
        order: order,
        take: limit
      }
    )

    // Compute next cursor (based on last item's sortField and createdAt)
    const nextCursor =
      items.length === limit && items.length > 0
        ? {
          value: getByPath((items[items.length - 1]), sortField),
          createdAt: items[items.length - 1].createdAt,
          id: items[items.length - 1].id,
        }
        : null;

    return { items, nextCursor, total };
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
      throw new ForbiddenException('You are not allowed to delete this product');
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
      throw new ForbiddenException('You are not allowed to update this product');
    }

    const isOnlyIncreasedQuantity = (updateProductDto && updateProductDto.quantity && updateProductDto.quantity > product.quantity && Object.keys(updateProductDto).length === 1) || false
    const isOnlyChangeInventoryItem = (updateProductDto && updateProductDto.inventoryItem && Object.keys(updateProductDto).length === 1) || false
    const isOnlyBothChangeInventoryItemAndIncreasedQuantity = (updateProductDto && updateProductDto.inventoryItem && updateProductDto.quantity && updateProductDto.quantity > product.quantity && Object.keys(updateProductDto).length === 2 && Object.keys(updateProductDto).includes("quantity") && Object.keys(updateProductDto).includes("inventoryItem")) || false

    // 3) Referential integrity: block if sold (has sale items) and decrease quantity
    if (updateProductDto && updateProductDto.quantity && (product.quantity > updateProductDto?.quantity)) {
      throw new BadRequestException('Cannot update: product quantity only can be increased.');
    }
    const soldCount = product.saleItems.reduce((p, c) => p + c.quantity, 0);
    if (soldCount > 0 && !(isOnlyIncreasedQuantity || isOnlyChangeInventoryItem || isOnlyBothChangeInventoryItemAndIncreasedQuantity)) {
      throw new BadRequestException('Cannot update: product has related sales.');
    }


    // 4) Handle tags if provided in update
    let tags: Tag[] = product.tags || [];
    const tagsExceptions: string[] = [];

    if (updateProductDto.tags && updateProductDto.tags.length > 0) {
      tags = [];
      for (const tagDto of updateProductDto.tags) {
        let tag = await this.tagsService.findOne({
          where: { epc: tagDto.epc },
          relations: { products: { saleItems: true } },
        });

        if (!tag) {
          tag = await this.tagsService.create({
            epc: tagDto.epc,
            rssi: tagDto.rssi,
            pl: tagDto.pl || 0,
            pc: tagDto.pc || 0,
            createdBy: user,
          });
        } else {
          // Check if tag is already used by another product
          if (tag.products.length > 0 && !tag.products.some(p => p.id === id)) {
            for (const p of tag.products) {
              const pSoldCount = p.saleItems.reduce((p, c) => p + c.quantity, 0);
              if (p.quantity > pSoldCount) {
                tagsExceptions.push(`Selected tag with EPC of "${tagDto.epc}" is used by product with name of "${p.name}"`);
              }
            }
          }
        }

        tags.push(tag);
      }

      if (tagsExceptions.length > 0) {
        throw new NotAcceptableException(tagsExceptions.join('\n'));
      }
    }

    // 5) Update scalar fields (only if provided)
    Object.assign(product, updateProductDto);

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
    const uploadsRoot = path.join(process.cwd(), 'uploads');
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
