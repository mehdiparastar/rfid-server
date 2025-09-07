import { PartialType } from '@nestjs/mapped-types';
import { Expose } from 'class-transformer';
import { CreateLocalUserDto } from './create-local-user.dto';

export class UpdateLocalUserDto extends PartialType(CreateLocalUserDto) {
  @Expose()
  roles?: string[];
}