import { Module } from '@nestjs/common';
import { SocketModule } from 'src/socket/socket.module';
import { TagsModule } from 'src/tags/tags.module';
import { JrdHubService } from './jrd-hub.service';
import { JrdController } from './jrd.controller';
import { TagLogService } from './tag-log.service';
import { JrdStateStore } from './jrd-state.store';
import { JrdService } from './jrd.service';

@Module({
  imports: [SocketModule, TagsModule],
  providers: [JrdHubService, TagLogService, JrdStateStore, JrdService],
  controllers: [JrdController],
  exports: [JrdHubService]
})
export class SerialModule { }
