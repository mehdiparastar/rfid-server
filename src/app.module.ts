import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { AllExceptionFilter } from './exceptions/all-exceptions.filter';
import { ProductsModule } from './products/products.module';
import { SerialModule } from './serial/serial.module';
import { TagsModule } from './tags/tags.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    DatabaseModule,  // <- configure DB first
    UsersModule,
    AuthModule,

    TagsModule,
    ProductsModule,
    SerialModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
      }),
    },
    AppService
  ],
})
export class AppModule { }
