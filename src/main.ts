import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env, loadEnv } from "./config/env";
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { resolveDeviceEnvVariable } from './helperFunctions/resolve-devices';


async function bootstrap() {
  loadEnv(); // <- load dotenv before creating app
  while (true) {
    await resolveDeviceEnvVariable(); // <-- resolves and updates env var

    console.info("JRD_DEVICES", env("JRD_DEVICES"))
    if (env("JRD_DEVICES") !== "(none)") {
      break
    }
  }
  const isProd = env("NODE_ENV") === 'production';
  console.warn("isProd", isProd)
  const app = await NestFactory.create(AppModule, { logger: isProd ? ['error'] : ['error', 'warn', 'log', 'debug', 'verbose'] });

  app.setGlobalPrefix('api'); // so /api/auth/* matches frontend

  app.enableCors({
    origin: ['http://127.0.0.1:1252', 'http://localhost:1252', 'http://127.0.0.1', 'http://localhost'],
    credentials: true, // Allow sending cookies from the client
  });


  app.use(cookieParser());


  /////// can remove on deploy ///////////
  const config = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, documentFactory);
  ////////////////////////////////////////


  await app.listen(env("SERVER_PORT") || 7219, isProd ? '127.0.0.1' : '0.0.0.0', async () => {
    console.log(`RFID app is running on: ${await app.getUrl()}`, env("NODE_ENV"));
  });

}
bootstrap();
