import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { env } from "src/config/env";

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req: any) => req?.cookies?.access_token]),
      secretOrKey: env("JWT_ACCESS_SECRET"),
      ignoreExpiration: false,
    });
  }
  validate(payload: any) {
    return payload; // { sub, email, roles? }
  }
}
