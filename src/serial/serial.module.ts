import { Module } from '@nestjs/common';
import { SocketModule } from 'src/socket/socket.module';
import { SerialController } from './serial.controller';
import { SerialService } from './serial.service';

@Module({
  imports: [SocketModule],
  providers: [SerialService],
  controllers: [SerialController]
})
export class SerialModule { }
