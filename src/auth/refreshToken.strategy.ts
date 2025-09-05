import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { config } from 'dotenv';
import { Request as ExpressReq } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolve } from 'path';
import { IJwtPayload } from 'src/types/IJWTTokensPair.interface';
import { UsersService } from 'src/users/users.service';

const envPath = resolve(process.cwd(), `.env.${process.env.NODE_ENV}`);
config({ path: envPath });

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly usersService: UsersService,
  ) {
    super({
      //   ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_REFRESH_SECRET || '',
      passReqToCallback: true,

    });
  }

  async validate(req: ExpressReq, payload: IJwtPayload) {
    const refreshToken = (req.get('Authorization') || '').replace('Bearer', '').trim();
    if (payload.sub) {
      const { password, ...rest } = await this.usersService.findOneById(
        payload.sub,
      );
      return { ...rest, refreshToken };
    }
    return { id: payload.sub, email: payload.email, refreshToken };
  }
}
