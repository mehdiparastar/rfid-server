import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env, loadEnv } from "./config/env";


async function bootstrap() {
  loadEnv(); // <- load dotenv before creating app
  const isProd = env("NODE_ENV") === 'production';

  const app = await NestFactory.create(AppModule, { logger: isProd ? false : ['error', 'warn', 'log', 'debug', 'verbose'] });

  app.setGlobalPrefix('api'); // so /api/auth/* matches frontend

  app.enableCors({
    origin: ['http://127.0.0.1:1252', 'http://localhost:1252'],
    credentials: true, // Allow sending cookies from the client
  });

  app.use(cookieParser());

  await app.listen(env("SERVER_PORT") || 7219, isProd ? '127.0.0.1' : '0.0.0.0', async () => {
    console.log(`RFID app is running on: ${await app.getUrl()}`, env("NODE_ENV"));
  });

}
bootstrap();
