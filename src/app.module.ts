import { Module, ValidationPipe } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { TagsModule } from './tags/tags.module';
import { ProductsModule } from './products/products.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AllExceptionFilter } from './exceptions/all-exceptions.filter';
import { SerialModule } from './serial/serial.module';

@Module({
  imports: [
    JwtModule.register({}),
    DatabaseModule,
    AuthModule,
    UsersModule,

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
  exports: [JwtModule, DatabaseModule]
})
export class AppModule { }
