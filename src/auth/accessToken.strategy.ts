import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { config } from 'dotenv';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolve } from 'path';
import { IJwtPayload } from 'src/types/IJWTTokensPair.interface';
import { UsersService } from 'src/users/users.service';

const envPath = resolve(process.cwd(), `.env.${process.env.NODE_ENV}`);
config({ path: envPath });

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      //   ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || '',
    });
  }

  async validate(payload: IJwtPayload) {
    if (payload.sub) {
      const { password, ...rest } = await this.usersService.findOneById(
        payload.sub,
      );
      return rest;
    }
    return { id: payload.sub, email: payload.email };
  }

  success(user: any, info?: any): void {
    console.log('user');
  }
}
