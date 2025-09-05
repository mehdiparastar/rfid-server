import { ForbiddenException, Injectable, Logger, NotAcceptableException, UnauthorizedException } from '@nestjs/common';
import { validateHashedData } from 'src/helperFunctions/validate-hashed-data';
import { User } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { config } from 'dotenv';
import { resolve } from 'path';
import { JwtService } from '@nestjs/jwt';
import { IJWTTokensPair } from 'src/types/IJWTTokensPair.interface';
import { hashData } from 'src/helperFunctions/hash-data';

const envPath = resolve(process.cwd(), `.env.${process.env.NODE_ENV}`);
config({ path: envPath });

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
    ) { }

    async login(user: Partial<User>): Promise<IJWTTokensPair> {
        if (user.id && user.email) {
            const tokens = await this.getTokens(user.id, user.email);
            await this.updateRefreshToken(user.id, tokens.refreshToken);
            return tokens;
        }
        throw new UnauthorizedException('credentials invalid.')
    }

    async getTokens(id: number, email: string): Promise<IJWTTokensPair> {
        const payload = { email, sub: id };
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_ACCESS_SECRET,
                expiresIn: process.env.JWT_ACCESS_EXPIRATION_TIME,
            }),
            this.jwtService.signAsync(payload, {
                secret: process.env.JWT_REFRESH_SECRET,
                expiresIn: process.env.JWT_REFRESH_EXPIRATION_TIME,
            }),
        ]);

        return {
            accessToken,
            refreshToken,
        };
    }

    async updateRefreshToken(id: number, refreshToken: string) {
        const hashedRefreshToken = await hashData(refreshToken);
        await this.usersService.update(id, {
            refreshToken: hashedRefreshToken,
        });
    }

    async localUserValidate(
        email: string,
        password: string,
    ): Promise<Partial<User> | null> {
        const [user] = await this.usersService.findByEmail(email);
        if (!user) {
            throw new NotAcceptableException('could not find the user');
        }

        const passwordValidation = await validateHashedData(password, user.password);

        if (user && passwordValidation) {
            const { password, ...rest } = user;
            return rest;
        }
        return null;
    }

    async createNewLocalUser(
        email: string,
        password: string,
        name: string,
    ): Promise<IJWTTokensPair> {
        // Hash password
        const hashedPassword = await hashData(password);

        // Create new User
        const newUser = await this.usersService.createUserWithUserPass(
            email,
            hashedPassword,
            name,
        );

        const tokens = await this.getTokens(newUser.id, newUser.email);
        await this.updateRefreshToken(newUser.id, tokens.refreshToken);
        return tokens;
    }

    async refreshTokens(
        id: number,
        refreshToken: string,
    ): Promise<IJWTTokensPair> {
        const user = await this.usersService.findOneById(id);
        if (!user || !user.refreshToken)
            throw new ForbiddenException('Access Denied');
        const refreshTokenMatches = await validateHashedData(
            refreshToken,
            user.refreshToken,
        );
        if (!refreshTokenMatches) throw new ForbiddenException('Access Denied');
        const tokens = await this.getTokens(user.id, user.email);
        await this.updateRefreshToken(user.id, tokens.refreshToken);
        return tokens;
    }

    async logout(id: number): Promise<User> {
        return this.usersService.update(id, {
            refreshToken: undefined,
        });
    }
}