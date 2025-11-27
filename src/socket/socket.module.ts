import { Module } from '@nestjs/common';
import { RedisCacheModule } from 'src/redis-cache/redis-cache.module';
import { TagsModule } from 'src/tags/tags.module';
import { AuthModule } from '../auth/auth.module'; // Adjust path to your AuthModule
import { SocketGateway } from './socket.gateway'; // Same directory, or adjust path

@Module({
    imports: [AuthModule, TagsModule, RedisCacheModule], // Imports dependencies needed by SocketGateway (e.g., AuthService)
    providers: [SocketGateway], // Declares SocketGateway as a provider
    exports: [SocketGateway], // Exports it so other modules can inject it
})
export class SocketModule { }