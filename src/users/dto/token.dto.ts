import { Expose } from 'class-transformer';

export class JWTTokenDto {
  @Expose()
  accessToken: string;

  @Expose()
  refreshToken: string;
}
