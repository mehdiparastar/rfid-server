import { Expose } from 'class-transformer';

export class UserDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  provider: string;

  @Expose()
  providerId: string;

  @Expose()
  name: string;

  @Expose()
  roles: string[];
}

export class UserIdDto {
  @Expose()
  id: number;
}

export class UserCompressDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  name: string;
}
