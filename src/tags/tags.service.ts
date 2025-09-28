import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, In, Repository } from 'typeorm';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { Tag } from './entities/tag.entity';

@Injectable()
export class TagsService {
  constructor(@InjectRepository(Tag) private tagsRepository: Repository<Tag>) { }

  async findtagsByTagEPC(epc: string[]) {
    return this.tagsRepository.find({ where: { epc: In(epc) }, relations: { products: { tags: true, createdBy: true, saleItems: { invoice: { customer: true } } }, createdBy: true } })
  }

  async saveTag(epc: string, rssi: number, pc: string, module: string) {
    // const tag = this.repo.create({ epc:epc, rssi:rssi, pc:'', module:'',products:'' });
    // return this.repo.save(tag);

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

  update(id: number, updateTagDto: UpdateTagDto) {
    return `This action updates a #${id} tag`;
  }

  remove(id: number) {
    return `This action removes a #${id} tag`;
  }
}
