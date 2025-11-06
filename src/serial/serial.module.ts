import { Module } from '@nestjs/common';
import { SocketModule } from 'src/socket/socket.module';
import { TagsModule } from 'src/tags/tags.module';
import { JrdHubService } from './jrd-hub.service';
import { JrdController } from './jrd.controller';
import { TagLogService } from './tag-log.service';
import { JrdStateStore } from './jrd-state.store';
import { JrdService } from './jrd.service';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { LockService } from './lock.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => ({
        store: await redisStore({
          socket: {
            host: 'localhost',  // Local Redis on M2 Berry
            port: 6379,
          },
          ttl: 120,  // Your 2-min default
        }),
      }),
    }),
    SocketModule,
    TagsModule
  ],
  providers: [
    JrdHubService,
    JrdStateStore,
    JrdService,
    TagLogService,
    LockService
  ],
  controllers: [JrdController],
  exports: [JrdHubService]
})
export class SerialModule { }
