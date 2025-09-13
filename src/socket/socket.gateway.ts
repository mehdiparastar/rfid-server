import { Injectable, Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Roles } from 'src/authorization/roles.decorator';
import { RolesGuard } from 'src/authorization/roles.guard';
import { env } from 'src/config/env';
import { UserRoles } from 'src/enum/userRoles.enum';
import { extractTokenFromCookie, WsJwtAccessGuard } from './ws-jwt-access.guard';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: ['http://127.0.0.1:1252', 'http://localhost:1252','http://127.0.0.1', 'http://localhost'],
    credentials: true,
  },
})
@UseGuards(WsJwtAccessGuard, RolesGuard)
@Roles(UserRoles.superUser)
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) { }

  private readonly logger = new Logger(SocketGateway.name);

  afterInit(server: Server) {
    server.use(async (client: Socket, next) => {
      try {
        // 1) Read from cookies or auth field (client set with `withCredentials: true`)
        const cookies = client.handshake.headers.cookie ?? '';
        const tokenFromCookie = extractTokenFromCookie(cookies, 'access_token');
        const tokenFromAuth = (client.handshake.auth as any)?.token;    // optional
        const token = tokenFromCookie ?? tokenFromAuth;
        if (!token) throw new Error('No token');

        // 2) Verify & attach user
        try {
          const payload = this.jwtService.verify(token, {
            secret: env('JWT_ACCESS_SECRET'),
          });
          (client as any).user = payload;

        } catch (error) {
          this.logger.warn('Access token invalid or expired');
        }

        return next();
      } catch (err) {
        next(err instanceof Error ? err : new Error('Unauthorized'));
      }
    });
  }

  handleConnection(client: Socket) {
    this.logger.warn(`Client connected: ${client.id}, User: ${JSON.stringify((client as any)?.user)}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.warn(`Client disconnected: ${client.id}, User: ${JSON.stringify((client as any)?.user)}`);
  }

  emitScanResult(newScanResult: any) {
    this.server.emit('new-scan-result', newScanResult)
  }

  @SubscribeMessage('scan')
  handleMessage(client: Socket, @MessageBody() message: string): void {
    this.server.emit('scan-response', {
      user: (client as any)?.user || 'Not Authenticated User',
      message,
      timestamp: new Date(),
    });
  }

}
