import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Response } from 'express';
import { AuthService, clearAuthCookies } from "./auth.service";
import { JwtAccessGuard } from "./guards/jwt-access.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { RegisterDto } from "./dto/register.dto";
import { UsersService } from "src/users/users.service";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
    constructor(private authService: AuthService, private users: UsersService,) { }


    @Post("register")
    async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
        // Decide the default role for self-registered users:
        const user = await this.users.create(dto.email, dto.password);

        // Optional: auto-login right after register
        await this.authService.issuePair(res, user);

        return { user: { id: user.id, email: user.email, roles: user.roles ?? [] } };
    }

    @Post("login")
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const user = await this.authService.validateUser(dto.email, dto.password);
        if (!user) throw new UnauthorizedException("Invalid credentials");
        await this.authService.issuePair(res, user);
        return { user: { id: user.id, email: user.email, roles: user.roles ?? [] } };
    }

    @UseGuards(JwtRefreshGuard)
    @Post("refresh")
    async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
        await this.authService.rotate(res, req.user); // { sub, jti }
        return { ok: true };
    }

    @Post("logout")
    async logout(@Res({ passthrough: true }) res: Response) {
        clearAuthCookies(res);
        return { ok: true };
    }

    @UseGuards(JwtAccessGuard)
    @Get("me")
    me(@Req() req: any) {
        const u = req.user;
        return { user: { id: u.sub, email: u.email, roles: u.roles ?? [] } };
    }
}
