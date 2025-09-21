import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { JwtAccessPayload } from "./jwt.types";

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): JwtAccessPayload | undefined => {
        const req = ctx.switchToHttp().getRequest();
        return { ...req.user, id: req.user.sub } as JwtAccessPayload & { id: number } | undefined;

    },
);

export const CurrentUserId = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): number | undefined => {
        const req = ctx.switchToHttp().getRequest();
        const sub = (req.user as JwtAccessPayload | undefined)?.sub;
        return sub ? Number(sub) : undefined;
    },
);
