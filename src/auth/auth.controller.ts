import { Controller, Post, UseGuards, Req, Body, Get, Logger, Patch, Param, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';
import { IJWTTokensPair } from 'src/types/IJWTTokensPair.interface';
import type { Request, Response } from 'express';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { JWTTokenDto } from 'src/users/dto/token.dto';
import { CreateLocalUserDto } from 'src/users/dto/create-local-user.dto';
import { AccessTokenGuard } from './accessToken.guard'
import { UserDto } from 'src/users/dto/user.dto';
import { RefreshTokenGuard } from './refreshToken.guard';
import { User } from 'src/users/entities/user.entity';
import { RolesGuard } from 'src/authorization/roles.guard';
import { UserRoles } from 'src/enum/userRoles.enum';
import { Roles } from 'src/authorization/roles.decorator';
import { ApproveUserRolesDto } from 'src/users/dto/approve-user-roles.dto';
import { UsersService } from 'src/users/users.service';


@Controller('api/auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private readonly authService: AuthService,
        private readonly usersService: UsersService,
    ) { }

    @Post('login')
    @UseGuards(LocalAuthGuard)
    @Serialize(JWTTokenDto)
    async login(@Req() req: Request): Promise<IJWTTokensPair> {
        if (req.user)
            return this.authService.login(req.user);
        throw new UnauthorizedException('credentials invalid')
    }

    @Post('local-create')
    @Serialize(JWTTokenDto)
    async create(@Body() body: CreateLocalUserDto): Promise<IJWTTokensPair> {
        return this.authService.createNewLocalUser(
            body.email,
            body.password,
            body.name,
        );
    }

    @Get('profile')
    @UseGuards(AccessTokenGuard)
    @Serialize(UserDto)
    getProfile(@Req() req: Request) {
        return req.user;
    }

    @Get('refresh')
    @UseGuards(RefreshTokenGuard)
    refreshTokens(@Req() req: Request): Promise<IJWTTokensPair> {
        const id = (req.user as User).id;
        const refreshToken = (req.user as User).refreshToken;
        return this.authService.refreshTokens(id, refreshToken);
    }

    @Get('logout')
    @UseGuards(AccessTokenGuard)
    @Serialize(UserDto)
    logout(@Req() req: Request): Promise<User> {
        return this.authService.logout((req.user as User).id);
    }

    @Patch('change-user-roles/:id')
    @UseGuards(AccessTokenGuard, RolesGuard)
    @Roles(UserRoles.superUser, UserRoles.admin)
    @Serialize(UserDto)
    approveUserRoles(
        @Param('id') id: string,
        @Body() body: ApproveUserRolesDto,
    ): Promise<User> {
        return this.usersService.changeUserRoles(parseInt(id), body);
    }
}
