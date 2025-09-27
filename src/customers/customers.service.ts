import { Injectable } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customersRepository: Repository<Customer>
  ) { }

  async findOrCreate(createCustomerDto: CreateCustomerDto) {
    const customer = await this.customersRepository.findOne({
      where: [{ nid: createCustomerDto.nid }, { phone: createCustomerDto.phone }],
    }) ?? this.customersRepository.create(createCustomerDto);

    if (!customer.id) await this.customersRepository.save(customer);

    return customer

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
}
