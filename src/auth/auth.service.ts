import { Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import type { Response } from "express";
import { env } from "src/config/env";
import { Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { UsersService } from "../users/users.service";
import { RefreshToken } from "./entities/refresh-token.entity";

const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,          // CSRF-friendly for SPA
    secure: process.env.NODE_ENV === "production",
    path: "/",
};

function setAccessCookie(res: Response, token: string) {
    res.cookie("access_token", token, { ...cookieBase, maxAge: Number(env("JWT_ACCESS_EXPIRATION_TIME")) }); // 10m
}
function setRefreshCookie(res: Response, token: string) {
    res.cookie("refresh_token", token, { ...cookieBase, maxAge: Number(env("JWT_REFRESH_EXPIRATION_TIME")) }); // 30d
}
export function clearAuthCookies(res: Response) {
    res.cookie("access_token", "", { ...cookieBase, maxAge: 0 });
    res.cookie("refresh_token", "", { ...cookieBase, maxAge: 0 });
}

@Injectable()
export class AuthService {
    constructor(
        private jwt: JwtService,
        private users: UsersService,
        @InjectRepository(RefreshToken) private tokensRepo: Repository<RefreshToken>,
    ) { }

    private readonly logger = new Logger(AuthService.name);

    async validateUser(email: string, password: string) {
        const user = await this.users.findByEmail(email);
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        return ok ? user : null;
    }

    private signAccess(user: User) {
        this.logger.warn(Number(env("JWT_ACCESS_EXPIRATION_TIME")))
        return this.jwt.sign(
            { sub: String(user.id), email: user.email, roles: user.roles ?? [] },
            { secret: process.env.JWT_ACCESS_SECRET, expiresIn: Number(env("JWT_ACCESS_EXPIRATION_TIME")) / 1000 },
        );
    }

    private async signRefresh(user: User, jti: string) {
        return this.jwt.sign(
            { sub: String(user.id), jti },
            { secret: process.env.JWT_REFRESH_SECRET, expiresIn: Number(env("JWT_REFRESH_EXPIRATION_TIME")) / 1000 },
        );
    }

    async issuePair(res: Response | null, user: User) {
        const jti = crypto.randomUUID();
        await this.tokensRepo.insert({
            jti,
            userId: user.id,
            revoked: 0,
            expiresAt: new Date(Date.now() + Number(env("JWT_REFRESH_EXPIRATION_TIME"))),
        });
        const accessToken = this.signAccess(user);
        const refreshToken = await this.signRefresh(user, jti);

        if (res) {
            setAccessCookie(res, accessToken);
            setRefreshCookie(res, refreshToken);
            return;
        }

        return { accessToken, refreshToken };
    }

    async rotate(res: Response, payload: { sub: string; jti: string }) {
        const row = await this.tokensRepo.findOne({ where: { jti: payload.jti } });
        if (!row || row.revoked) throw new UnauthorizedException("Invalid refresh token");

        await this.tokensRepo.update({ jti: payload.jti }, { revoked: 1 });

        const user = await this.users.findById(Number(payload.sub));
        if (!user) throw new NotFoundException("User not found");

        await this.issuePair(res, user);
    }
}
