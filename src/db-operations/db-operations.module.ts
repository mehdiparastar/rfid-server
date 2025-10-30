import { Module } from '@nestjs/common';
import { DbOperationsController } from './db-operations.controller';
import { DbOperationsService } from './db-operations.service';
import { SocketModule } from 'src/socket/socket.module';

@Module({
  imports: [SocketModule],
  controllers: [DbOperationsController],
  providers: [DbOperationsService]
})
export class DbOperationsModule { }
