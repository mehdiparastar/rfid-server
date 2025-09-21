import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { SerialModule } from './serial/serial.module';
import { SocketModule } from './socket/socket.module';
import { TagsModule } from './tags/tags.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/api/uploads', // add `/api` prefix
    }),
    DatabaseModule,  // <- configure DB first
    UsersModule,
    AuthModule,
    SocketModule,

    TagsModule,
    ProductsModule,
    SerialModule,
    CustomersModule,
    SalesModule,
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
