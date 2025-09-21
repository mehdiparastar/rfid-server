import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from 'src/auth/entities/refresh-token.entity';
import { env } from 'src/config/env';
import { Customer } from 'src/customers/entities/customer.entity';
import { Product } from 'src/products/entities/product.entity';
import { Sale } from 'src/sales/entities/sale.entity';
import { Tag } from 'src/tags/entities/tag.entity';
import { User } from 'src/users/entities/user.entity';
import { DataSource } from 'typeorm';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            useFactory: () => {
                console.log("environment is", env("NODE_ENV"), "in connecting to DB.")
                return ({
                    type: 'mariadb',
                    host: env("MYSQL_ROOT_HOST"),
                    port: Number(env("DB_PORT")),
                    username: env("MYSQL_USER"),
                    password: env("MYSQL_PASSWORD"),
                    database: env("MYSQL_DATABASE"),
                    entities: [RefreshToken, User, Product, Tag, Customer, Sale],
                    // autoLoadEntities: true,
                    synchronize: true,
                    // logging: env("NODE_ENV") === 'development'
                })
            }
        })
    ],
    exports: [TypeOrmModule],
})
export class DatabaseModule {
    constructor(private dataSource: DataSource) { }
}
