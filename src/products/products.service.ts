import { Injectable, NotAcceptableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GoldCurrencyService } from 'src/gold-currency/gold-currency.service';
import { Tag } from 'src/tags/entities/tag.entity';
import { TagsService } from 'src/tags/tags.service';
import { In, LessThan, Like, MoreThan, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid'; // npm i uuid @types/uuid
import { User } from '../users/entities/user.entity'; // Adjust path
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';

export interface Cursor {
  value: string | number | Date; // type depends on your sort field
  createdAt: Date;               // tie-breaker
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
    private readonly goldCurrencyService: GoldCurrencyService
  ) { }

  async create(createProductDto: CreateProductDto, files: { photos?: Express.Multer.File[]; previews?: Express.Multer.File[] }, user: Partial<User>) {
    const product = this.productsRepository.create({
      ...createProductDto,
      createdBy: user,
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
    const sortCondition = !!cursor ? {
      [sortField]: sortDirection === 'asc' ?
        MoreThan(sortField === "createdAt" ? new Date(cursor?.value) : cursor?.value) :
        LessThan(sortField === "createdAt" ? new Date(cursor?.value) : cursor?.value)
    } : {}

    const secondSortLevel = (sortField !== 'createdAt') ? { createdAt: 'DESC' } : {} as any

    const [items, total] = await this.productsRepository.findAndCount(
      {
        where: [
          { ...sortCondition, name: Like(`%${qFilterValue}%`) },
          { ...sortCondition, saleItems: { invoice: { customer: { name: Like(`%${qFilterValue}%`) } } } },
        ],
        relations: { saleItems: { invoice: { customer: true } }, tags: true, createdBy: true },
        order: { [sortField]: sortDirection.toUpperCase(), ...secondSortLevel },
        take: limit
      }
    )

    // Compute next cursor (based on last item's sortField and createdAt)
    const nextCursor =
      items.length === limit && items.length > 0
        ? {
          value: (items[items.length - 1] as any)[sortField],
          createdAt: items[items.length - 1].createdAt,
        }
        : null;

    return { items, nextCursor, total };
  }

  async getProductsByIds(ids: number[]) {
    return await this.productsRepository.find({ where: { id: In(ids) }, relations: { tags: true, saleItems: true, createdBy: true } })
  }

}
