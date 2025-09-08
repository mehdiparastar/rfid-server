import "express";
import type { JwtAccessPayload } from "../auth/jwt.types";

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtAccessPayload;
  }
}
