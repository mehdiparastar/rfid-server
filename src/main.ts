import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), `.env.${process.env.NODE_ENV}`);
config({ path: envPath });

async function bootstrap() {

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: "*",
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: false, // Allow sending cookies from the client
  });

  await app.listen(process.env.SERVER_PORT || 3210, async () => {
    console.log(`RFID app is running on: ${await app.getUrl()}`, process.env.NODE_ENV);
  });

}
bootstrap();
