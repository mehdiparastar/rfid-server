import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createSortObject, getByPath, makeSortCondition } from 'src/helperFunctions/createSortObject';
import { Cursor } from 'src/products/products.service';
import { And, ILike, Like, Repository } from 'typeorm';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer } from './entities/customer.entity';


export interface GetAllCustomersOptions {
  cursor: Cursor | null
  limit: number;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filters: Record<string, any>;
}


@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customersRepository: Repository<Customer>
  ) { }

  async findOrCreate(createCustomerDto: CreateCustomerDto) {
    const customer = await this.customersRepository.findOne({
      where: [{ name: createCustomerDto.name }, { phone: createCustomerDto.phone }],
    }) ?? this.customersRepository.create(createCustomerDto);

    if (!customer.id) await this.customersRepository.save(customer);

    return customer
  }

  async searchCustomers(q: string) {
    return this.customersRepository.find({
      where: [
        { name: ILike(`%${q}%`) },
        { phone: ILike(`%${q}%`) },
        { nid: ILike(`%${q}%`) },
      ],
      take: 10,
      order: { name: 'ASC' },
    });
  }

  findAll() {
    return `This action returns all customers`;
  }

  findOne(id: number) {
    return `This action returns a #${id} customer`;
  }

  update(id: number, updateCustomerDto: UpdateCustomerDto) {
    return `This action updates a #${id} customer`;
  }

  remove(id: number) {
    return `This action removes a #${id} customer`;
  }

  async getAllCustomers({
    cursor,
    limit,
    sortField,
    sortDirection,
    filters,
  }: GetAllCustomersOptions) {

    const qFilterValue = filters['q']

    const sortCondition = makeSortCondition(sortField, sortDirection, cursor)

    // const secondSortLevel_ = (sortField !== 'createdAt') ? (sortDirection === 'asc' ? { createdAt: 'ASC' } : { createdAt: 'DESC' }) : {} as any
    const secondSortLevel = (sortDirection === 'asc' ? { id: 'ASC' } : { id: 'DESC' }) as any
    const order = { ...createSortObject(sortField, sortDirection), ...secondSortLevel }


    const [items, total] = await this.customersRepository.findAndCount(
      {
        relations: { createdBy: true },
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
              nid: el?.["nid"] ?
                And(Like(`%${qFilterValue}%`), el?.["nid"]) :
                Like(`%${qFilterValue}%`)
            })),
          ...sortCondition
            .map(el => ({
              ...el,
              phone: el?.["phone"] ?
                And(Like(`%${qFilterValue}%`), el?.["phone"]) :
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
}
