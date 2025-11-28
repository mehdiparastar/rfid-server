import { Module } from '@nestjs/common';
import { ProductsModule } from 'src/products/products.module';
import { RedisCacheModule } from 'src/redis-cache/redis-cache.module';
import { SocketModule } from 'src/socket/socket.module';
import { TagsModule } from 'src/tags/tags.module';
import { Esp32WsService } from './esp32-ws.service';
import { JrdController } from './jrd.controller';

@Module({
  imports: [
    RedisCacheModule,
    SocketModule,
    TagsModule,
    ProductsModule
  ],
  providers: [
    Esp32WsService
  ],
  controllers: [JrdController],
  exports: [Esp32WsService]
})
export class SerialModule { }
