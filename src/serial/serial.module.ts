import { Module } from '@nestjs/common';
import { SocketModule } from 'src/socket/socket.module';
import { SerialController } from './serial.controller';
import { SerialService } from './serial.service';
import { TagsModule } from 'src/tags/tags.module';
import { JrdHubService } from './jrd-hub.service';
import { JrdController } from './jrd.controller';
import { TagLogService } from './tag-log.service';
import { JrdStateStore } from './jrd-state.store';
import { JrdService } from './jrd.service';

@Module({
  imports: [SocketModule, TagsModule],
  providers: [SerialService, JrdHubService, TagLogService, JrdStateStore, JrdService],
  controllers: [SerialController, JrdController],
  exports: [JrdHubService]
})
export class SerialModule { }
