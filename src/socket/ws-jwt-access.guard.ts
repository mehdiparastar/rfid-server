import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from 'src/config/env';

@Injectable()
export class WsJwtAccessGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) { }

    private readonly logger = new Logger(WsJwtAccessGuard.name);

    async canActivate(context: ExecutionContext) {
        const client = context.switchToWs().getClient();
        const cookies = client.handshake.headers.cookie;

        if (!cookies) {
            return false;
        }

        // Try access token first
        const accessToken = extractTokenFromCookie(cookies, 'access_token');
        this.logger.verbose(`AccessToken is: ${accessToken}`)
        if (accessToken) {
            try {
                const payload = this.jwtService.verify(accessToken, {
                    secret: env('JWT_ACCESS_SECRET'),
                });
                client.user = payload;
                this.logger.warn(Math.floor(Date.now() / 1000) - payload.exp);
                return true;
            } catch (error) {
                this.logger.warn('Access token invalid or expired');
            }
        }

        // Fallback to refresh token
        const refreshToken = extractTokenFromCookie(cookies, 'refresh_token');
        if (!refreshToken) {
            this.logger.warn('No refresh token provided');
            return false;
        }

        try {
            const refreshPayload = this.jwtService.verify(refreshToken, {
                secret: env('JWT_REFRESH_SECRET'),
            });

            if (!!refreshPayload.sub) {
                client.emit('renew-token')
                return true
            }

            return false;
        } catch (error) {
            this.logger.error('Refresh token validation failed', error);
            return false;
        }
    }
}

export const extractTokenFromCookie = (cookies: string, tokenName: string): string | null => {
    const cookieArray = cookies.split(';');
    const tokenCookie = cookieArray.find((cookie) =>
        cookie.trim().startsWith(`${tokenName}=`),
    );
    return tokenCookie ? tokenCookie.split('=')[1] : null;
}