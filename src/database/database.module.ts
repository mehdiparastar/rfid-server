import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';
import { env } from 'src/config/env';
import { DataSource } from 'typeorm';

const envPath = resolve(process.cwd(), `.env.${process.env.NODE_ENV}`);
config({ path: envPath });

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            useFactory: () => ({
                type: 'mariadb',
                host: env("MYSQL_ROOT_HOST"),
                port: Number(env("DB_PORT")),
                username: env("MYSQL_USER"),
                password: env("MYSQL_PASSWORD"),
                database: env("MYSQL_DATABASE"),
                autoLoadEntities: true,
                synchronize: true,
            })
        })
    ],
    exports: [TypeOrmModule],
})
export class DatabaseModule {
    constructor(private dataSource: DataSource) { }
}
