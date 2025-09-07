import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { env } from "src/config/env";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req: any) => req?.cookies?.refresh_token]),
      secretOrKey: env("JWT_REFRESH_SECRET"),
      ignoreExpiration: false,
    });
  }
  validate(payload: any) {
    // { sub: userId, jti: string }
    return payload;
  }
}
