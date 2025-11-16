import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module'; // Adjust path to your AuthModule
import { SocketGateway } from './socket.gateway'; // Same directory, or adjust path
import { TagsModule } from 'src/tags/tags.module';
import { EspGateway } from './esp.gateway';

@Module({
    imports: [AuthModule, TagsModule], // Imports dependencies needed by SocketGateway (e.g., AuthService)
    providers: [SocketGateway, EspGateway], // Declares SocketGateway as a provider
    exports: [SocketGateway, EspGateway], // Exports it so other modules can inject it
})
export class SocketModule { }