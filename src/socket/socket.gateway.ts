import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Roles } from 'src/authorization/roles.decorator';
import { RolesGuard } from 'src/authorization/roles.guard';
import { env } from 'src/config/env';
import { ScanMode } from 'src/enum/scanMode.enum';
import { UserRoles } from 'src/enum/userRoles.enum';
import { Product } from 'src/products/entities/product.entity';
import { Esp32ClientInfo, ProductScan } from 'src/serial/esp32-ws.service';
import { DeviceId, JRDState, TagScan } from 'src/serial/jrd-state.store';
import { TagsService } from 'src/tags/tags.service';
import { User } from 'src/users/entities/user.entity';
import { extractTokenFromCookie, WsJwtAccessGuard } from './ws-jwt-access.guard';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: ['http://127.0.0.1:1252', 'http://localhost:1252', 'http://127.0.0.1', 'http://localhost'],
    credentials: true,
  },
})
@UseGuards(WsJwtAccessGuard, RolesGuard)
@Roles(UserRoles.superUser)
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly tagsService: TagsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) { }

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
    const user = (client as any)?.user;
    if (user?.id || user?.sub) {
      // Join the socket to a room named after the user ID for targeted emits
      client.join(`room-${(user?.id || user?.sub).toString()}`);
    }
    this.logger.warn(`Client connected: ${client.id}, User: ${JSON.stringify((client as any)?.user)}`);
  }

  handleDisconnect(client: Socket) {
    const user = (client as any)?.user;
    if (user?.id) {
      // Socket.IO automatically leaves rooms on disconnect, but explicit leave is optional for logging
      client.leave(`room-${(user?.id || user?.sub).toString()}`);
    }
    this.logger.warn(`Client disconnected: ${client.id}, User: ${JSON.stringify((client as any)?.user)}`);
  }

  async emitESPModulesScanResult(deviceId: number, epc: string, rssi: number, scantimestamp: number, mode: ScanMode, hardScanPower: number, softScanPower: number, thisModeTagScanResults: ProductScan[], clients: Map<number, Esp32ClientInfo>) {
    const rssiBasedPower = softScanPower === 14 ? -66 : softScanPower === 13 ? -64 : softScanPower === 12 ? -62 : softScanPower === 11 ? -60 : softScanPower === 10 ? -58 : softScanPower === 9 ? -56 : softScanPower === 8 ? -54 : softScanPower === 7 ? -52 : softScanPower === 6 ? -50 : softScanPower === 5 ? -48 : softScanPower === 4 ? -46 : softScanPower === 3 ? -44 : softScanPower === 2 ? -42 : -40
    const rssiBasedPowerCond = rssi > rssiBasedPower
    if ((softScanPower < 15 && rssiBasedPowerCond) || (hardScanPower > 15) || (hardScanPower === 15 && softScanPower === 15)) {
      const cacheKey = epc
      const ttlMiliSeconds = 600_000 // 10 min
      const cached = await this.cacheManager.get<{
        scantimestamp: number;
        id: number;
        epc: string;
        rssi: number;
        pc: number;
        pl: number;
        products: Product[];
        createdBy: User;
        createdAt: Date;
        updatedAt: Date;
      }[]>(cacheKey)

      const tags = (cached !== undefined) ? cached : (await this.tagsService.findtagsByTagEPC([epc]))
        .map(t => ({ ...t, scantimestamp }))

      if (cached === undefined) {
        await this.cacheManager.set(cacheKey, tags, ttlMiliSeconds)
      }

      const products: (Product & { scantimestamp: number, scanRSSI: number })[] = []

      for (const tag of tags) {
        for (const product of tag.products) {
          const soldQuantity = product.saleItems.reduce((p, c) => p + c.quantity, 0)
          if ((product.quantity - soldQuantity > 0) && product.inventoryItem) {
            products.push({ ...product, scantimestamp: tag.scantimestamp, scanRSSI: rssi })
          }
        }
      }

      if (products.length > 0) {
        const uniqueRes = [...new Map(products.map(item => [item.id, item])).values()]
        const prevScannedTag = thisModeTagScanResults.find(p => (p.tags || []).map(t => t.epc).includes(epc))
        const isTagScanned = prevScannedTag?.id != null
        const isTagScannedWithTheSameRSSI = isTagScanned && prevScannedTag.scanRSSI === rssi
        const isTagScannedWithTheSameScanTimestamp = isTagScanned && prevScannedTag.scantimestamp === scantimestamp

        if (!isTagScanned) {
          const newRes = [...thisModeTagScanResults, ...uniqueRes]
          clients.get(deviceId)!.tagScanResults[mode] = newRes
          this.server.emit('esp-modules-new-inventory-scan-recieved', uniqueRes.map(el => ({ ...el, deviceId })))
        } else if (isTagScanned && (!isTagScannedWithTheSameRSSI || isTagScannedWithTheSameScanTimestamp)) {
          const updatedRes = thisModeTagScanResults.map(el => el.tags?.map(x => x.epc).includes(epc) ? uniqueRes : el).flat()
          clients.get(deviceId)!.tagScanResults[mode] = updatedRes
          this.server.emit('esp-modules-new-inventory-scan-recieved', uniqueRes.map(el => ({ ...el, deviceId })))
        }
      }
    }
  }

  async emitScanResult(newTagScanResult: TagScan/*{ epc: string, pc: number, pl: number, rssi: number }*/, scanMode: ScanMode, deviceId?: DeviceId) {
    if (newTagScanResult.epc && scanMode === "Inventory") {
      const tags = (await this.tagsService.findtagsByTagEPC([newTagScanResult.epc])).map(t => ({ ...t, scantimestamp: newTagScanResult.scantimestamp }))
      const products: (Product & { scantimestamp?: number })[] = []

      for (const tag of tags) {
        for (const product of tag.products) {
          const soldQuantity = product.saleItems.reduce((p, c) => p + c.quantity, 0)
          if ((product.quantity - soldQuantity > 0) && product.inventoryItem) {
            products.push({ ...product, scantimestamp: tag.scantimestamp })
          }
        }
      }

      if (products.length > 0) {
        const uniqueRes = [...new Map(products.map(item => [item.id, item])).values()]
        this.server.emit('new-scan-result', { "Inventory": uniqueRes.map(el => ({ ...el, deviceId })) })
      }
    }

    if (newTagScanResult.epc && scanMode === "NewProduct") {
      const dbTags = await this.tagsService.findtagsByTagEPC([newTagScanResult.epc])
      const tags = dbTags.length > 0 ? dbTags.map(t => ({ ...t, scantimestamp: newTagScanResult.scantimestamp })) : [newTagScanResult]
      const validTags: TagScan[] = []
      for (const tag of tags) {
        if (!tag.products || tag.products.length === 0) {
          validTags.push(tag)
        } else {
          validTags.push(tag)
          for (const product of tag.products) {
            const soldQuantity = product.saleItems.reduce((p, c) => p + c.quantity, 0)
            if (product.quantity - soldQuantity > 0) {
              validTags.pop()
              break
            }
          }
        }
      }
      if (validTags.length > 0)
        this.server.emit('new-scan-result', { 'NewProduct': validTags.map(el => ({ ...el, deviceId })) })
    }

    if (newTagScanResult.epc && scanMode === "Scan") {
      const tags = (await this.tagsService.findtagsByTagEPC([newTagScanResult.epc])).map(t => ({ ...t, scantimestamp: newTagScanResult.scantimestamp }))
      const products: (Product & { scantimestamp: number })[] = []

      for (const tag of tags) {
        for (const product of tag.products) {
          const soldQuantity = product.saleItems.reduce((p, c) => p + c.quantity, 0)
          if (product.quantity - soldQuantity > 0) {
            products.push({ ...product, scantimestamp: tag.scantimestamp })
          }
        }
      }

      if (products.length > 0) {
        const uniqueRes = [...new Map(products.map(item => [item.id, item])).values()]
        this.server.emit('new-scan-result', { "Scan": uniqueRes.map(el => ({ ...el, deviceId })) })
      }
    }
  }

  async emitUpdateScanStartStop(
    mode: ScanMode,
    data: readonly {
      id: string;
      state: Readonly<JRDState>;
    }[]
  ) {
    this.server.emit('update-current-scenario', { mode, data })
  }

  @SubscribeMessage('scan')
  handleMessage(client: Socket, @MessageBody() message: string): void {
    this.server.emit('scan-response', {
      user: (client as any)?.user || 'Not Authenticated User',
      message,
      timestamp: new Date(),
    });
  }


  emitBackUpProgress(backupType: "backup_db" | "backup_files", progress: number, user: Partial<User>) {
    if (user?.id) {
      this.server
        .to(`room-${user.id.toString()}`)
        .emit('backupProgress', { [backupType]: progress });
    } else {
      this.logger.warn('Cannot emit backup progress: User ID is missing');
    }
  }

  emitRestoreDBProgress(restoreType: "restore_db" | "restore_files", progress: number, user: Partial<User>) {
    if (user?.id) {
      this.server
        .to(`room-${user.id.toString()}`)
        .emit('restoreProgress', { [restoreType]: progress })
    } else {
      this.logger.warn('Cannot emit restore progress: User ID is missing');
    }
  }


  async emitUpdateRegistrationStatus(clients: Map<number, Esp32ClientInfo>) {
    this.server.emit('esp-modules-registration-updated', Array.from(clients.entries()).map(el => el[1]).filter(el => el != null))
  }

  async emitUpdateESPModulesStatus(clientInfo: Esp32ClientInfo) {
    const { status, id } = clientInfo
    this.server.emit('esp-modules-status-updated', { id, status })
  }

  async emitUpdateESPModulesPower(id: number, hardPower: number, softPower: number) {
    this.server.emit('esp-modules-updated-power', { id, currentHardPower: hardPower, currentSoftPower: softPower, })
  }

  async emitUpdateESPModulesIsActive(id: number, isActive: boolean) {
    this.server.emit('esp-modules-updated-is-active', { id, isActive })
  }

  async emitUpdateESPModulesMode(id: number, mode: ScanMode) {
    this.server.emit('esp-modules-updated-mode', { id, mode })
  }

  async emitStartESPModulesScan(id: number) {
    this.server.emit('esp-modules-start-scan', { id })
  }

  async emitStopESPModulesScan(id: number) {
    this.server.emit('esp-modules-stop-scan', { id })
  }

  emitClearScanHistory(id: number, mode: ScanMode) {
    this.server.emit("esp-modules-clear-scan-history-by-mode", { id, mode })
  }

}
