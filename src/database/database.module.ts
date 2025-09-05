import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

const envPath = resolve(process.cwd(), `.env.${process.env.NODE_ENV}`);
config({ path: envPath });

@Module({
    imports: [
        TypeOrmModule.forRoot({
            type: 'mysql',
            host: process.env.MYSQL_ROOT_HOST,
            port: Number(process.env.DB_PORT),
            username: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            autoLoadEntities: true,
            synchronize: true,
        }),
        TypeOrmModule.forRoot({
            type: 'sqlite',
            database: process.env.MYSQL_DATABASE,
            autoLoadEntities: true,
            synchronize: true,
        }),
    ],
    exports: [TypeOrmModule],
})
export class DatabaseModule {
    constructor(private dataSource: DataSource) { }
}
