import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createSortObject, getByPath, makeSortCondition } from 'src/helperFunctions/createSortObject';
import { Cursor } from 'src/products/products.service';
import { And, FindOneOptions, In, Like, Repository } from 'typeorm';
import { CreateTagDto } from './dto/create-tag.dto';
import { Tag } from './entities/tag.entity';

export interface GetAllTagsOptions {
  cursor: Cursor | null
  limit: number;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filters: Record<string, any>;
}

@Injectable()
export class TagsService {
  constructor(@InjectRepository(Tag) private tagsRepository: Repository<Tag>) { }

  async findtagsByTagEPC(epc: string[]) {
    return this.tagsRepository.find({ where: { epc: In(epc) }, relations: { products: { tags: true, createdBy: true, saleItems: { invoice: { customer: true } } }, createdBy: true } })
  }

  findByIds(ids: number[]) {
    return this.tagsRepository.findBy({ id: In(ids) });
  }

  findAll() {
    return this.tagsRepository.find();
  }

  async create(createTagDto: CreateTagDto) {
    const tag = this.tagsRepository.create(createTagDto)
    return await this.tagsRepository.save(tag);
  }

  async findOne(options: FindOneOptions) {
    return await this.tagsRepository.findOne(options);
  }


  async getAllTags({
    cursor,
    limit,
    sortField,
    sortDirection,
    filters,
  }: GetAllTagsOptions) {

    const qFilterValue = filters['q']

    const sortCondition = makeSortCondition(sortField, sortDirection, cursor)

    // const secondSortLevel_ = (sortField !== 'createdAt') ? (sortDirection === 'asc' ? { createdAt: 'ASC' } : { createdAt: 'DESC' }) : {} as any
    const secondSortLevel = (sortDirection === 'asc' ? { id: 'ASC' } : { id: 'DESC' }) as any
    const order = { ...createSortObject(sortField, sortDirection), ...secondSortLevel }


    const [items, total] = await this.tagsRepository.findAndCount(
      {
        relations: { products: true, createdBy: true },
        where: [
          ...sortCondition
            .map(el => ({
              ...el,
              epc: el?.["epc"] ?
                And(Like(`%${qFilterValue}%`), el?.["epc"]) :
                Like(`%${qFilterValue}%`)
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

  async getTagsByIds(ids: number[]) {
    return await this.tagsRepository.find({ where: { id: In(ids) }, relations: { products: true, createdBy: true } })
  }
}
