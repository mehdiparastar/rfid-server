import { Module } from '@nestjs/common';
import { SocketModule } from 'src/socket/socket.module';
import { SerialController } from './serial.controller';
import { SerialService } from './serial.service';
import { TagsModule } from 'src/tags/tags.module';

@Module({
  imports: [SocketModule, TagsModule],
  providers: [SerialService],
  controllers: [SerialController]
})
export class SerialModule { }
