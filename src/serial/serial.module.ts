import { Module } from '@nestjs/common';
import { RedisCacheModule } from 'src/redis-cache/redis-cache.module';
import { SocketModule } from 'src/socket/socket.module';
import { TagsModule } from 'src/tags/tags.module';
import { Esp32WsService } from './esp32-ws.service';
import { JrdHubService } from './jrd-hub.service';
import { JrdStateStore } from './jrd-state.store';
import { JrdController } from './jrd.controller';
import { JrdService } from './jrd.service';
import { LockService } from './lock.service';
import { TagLogService } from './tag-log.service';
import { ProductsModule } from 'src/products/products.module';

@Module({
  imports: [
    RedisCacheModule,
    SocketModule,
    TagsModule,
    ProductsModule
  ],
  providers: [
    JrdHubService,
    JrdStateStore,
    JrdService,
    TagLogService,
    LockService,
    Esp32WsService
  ],
  controllers: [JrdController],
  exports: [JrdHubService, Esp32WsService]
})
export class SerialModule { }
