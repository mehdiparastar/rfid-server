import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { redisStore } from 'cache-manager-redis-store';

@Module({
    imports: [
        CacheModule.registerAsync({
            useFactory: async () => ({
                store: await redisStore({
                    socket: {
                        host: '127.0.0.1',  // Local Redis on M2 Berry
                        port: 6379,
                    },
                    ttl: 120,  // Your 2-min default
                }),
            }),
        }),
    ],
    exports: [CacheModule]
})
export class RedisCacheModule { }
