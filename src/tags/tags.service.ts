import { Injectable } from '@nestjs/common';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TagsService {
  constructor(@InjectRepository(Tag) private repo: Repository<Tag>) { }

  async saveTag(epc: string, rssi: number, pc: string, module: string) {
    const tag = this.repo.create({ epc, rssi, pc, module });
    return this.repo.save(tag);
  }

  findAll() {
    return this.repo.find();
  }

  create(createTagDto: CreateTagDto) {
    return 'This action adds a new tag';
  }

  findOne(id: number) {
    return `This action returns a #${id} tag`;
  }

  update(id: number, updateTagDto: UpdateTagDto) {
    return `This action updates a #${id} tag`;
  }

  remove(id: number) {
    return `This action removes a #${id} tag`;
  }
}
