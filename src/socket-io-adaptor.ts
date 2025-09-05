import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions, Socket } from 'socket.io';
import { config } from 'dotenv';
import { resolve } from 'path';
import { TagsService } from './tags/tags.service';
import { ProductsService } from './products/products.service';

const envPath = resolve(process.cwd(), `.env.${process.env.NODE_ENV}`);
config({ path: envPath });

export class ApplicationSocketIOAdapter extends IoAdapter {
  private readonly logger = new Logger(ApplicationSocketIOAdapter.name);
  constructor(
    private app: INestApplicationContext,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    this.logger.warn(port);
    const optionsWithCORS: ServerOptions = {
      ...options,
      cors: { origin: '*' },
    } as ServerOptions;

    const productsService = this.app.get(ProductsService);
    const tagsService = this.app.get(TagsService);

    const server: Server = super.createIOServer(port, optionsWithCORS);

    server.of('api/products/socket-initing').use(createProductsMiddleware(productsService, this.logger));
    server.of('api/tags/socket-initing').use(createTagsMiddleware(tagsService, this.logger));

    return server;
  }
}


const createProductsMiddleware = (productsService: ProductsService, logger: Logger) => async (socket: Socket, next) => {
  // for Postman testing support, fallback to token header
  try {
    logger.debug(`MiddleWare before connection of socket ${socket.id}`);
    next();
  } catch (ex) {
    next(ex);
    // next(new Error('FORBIDDEN'));
  }
};

const createTagsMiddleware = (tagsService: TagsService, logger: Logger) => async (socket: Socket, next) => {
  // for Postman testing support, fallback to token header
  try {
    logger.debug(`MiddleWare before connection of socket ${socket.id}`);
    next();
  } catch (ex) {
    next(ex);
    // next(new Error('FORBIDDEN'));
  }
};
