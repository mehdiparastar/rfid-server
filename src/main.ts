import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env, loadEnv } from "./config/env";


async function bootstrap() {
  loadEnv(); // <- load dotenv before creating app

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api'); // so /api/auth/* matches frontend

  app.enableCors({
    origin: "*",
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    credentials: true, // Allow sending cookies from the client
  });

  app.use(cookieParser());

  await app.listen(env("SERVER_PORT") || 3210, async () => {
    console.log(`RFID app is running on: ${await app.getUrl()}`, env("NODE_ENV"));
  });

}
bootstrap();
