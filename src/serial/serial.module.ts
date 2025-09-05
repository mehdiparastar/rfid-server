import { Module } from '@nestjs/common';
import { SerialService } from './serial.service';
import { SerialController } from './serial.controller';

@Module({
  providers: [SerialService],
  controllers: [SerialController]
})
export class SerialModule {}
