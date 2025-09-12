import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { ProductsModule } from './products/products.module';
import { SerialModule } from './serial/serial.module';
import { TagsModule } from './tags/tags.module';
import { UsersModule } from './users/users.module';
import { SocketModule } from './socket/socket.module';

@Module({
  imports: [
    DatabaseModule,  // <- configure DB first
    UsersModule,
    AuthModule,
    SocketModule,

    TagsModule,
    ProductsModule,
    SerialModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,                 // strip unknown fields
        forbidNonWhitelisted: true,      // 400 if extra fields are sent
        transform: true,                 // enable DTO transforms
        transformOptions: { enableImplicitConversion: true },
        validateCustomDecorators: true,
      }),
    },
    AppService
  ],
})
export class AppModule { }
