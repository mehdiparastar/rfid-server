import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Response } from 'express';
import { AuthService, clearAuthCookies } from "./auth.service";
import { JwtAccessGuard } from "./guards/jwt-access.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";

@Controller("auth")
export class AuthController {
    constructor(private auth: AuthService) { }

    @Post("login")
    async login(@Body() dto: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
        const user = await this.auth.validateUser(dto.email, dto.password);
        if (!user) throw new UnauthorizedException("Invalid credentials");
        await this.auth.issuePair(res, user);
        return { user: { id: user.id, email: user.email, roles: user.roles ?? [] } };
    }

    @UseGuards(JwtRefreshGuard)
    @Post("refresh")
    async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
        await this.auth.rotate(res, req.user); // { sub, jti }
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

    // @Patch('change-user-roles/:id')
    // @UseGuards(AccessTokenGuard, RolesGuard)
    // @Roles(UserRoles.superUser, UserRoles.admin)
    // @Serialize(UserDto)
    // approveUserRoles(
    //     @Param('id') id: string,
    //     @Body() body: ApproveUserRolesDto,
    // ): Promise<User> {
    //     return this.usersService.changeUserRoles(parseInt(id), body);
    // }
}
