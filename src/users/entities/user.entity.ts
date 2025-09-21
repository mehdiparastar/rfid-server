import { Customer } from "src/customers/entities/customer.entity";
import { Product } from "src/products/entities/product.entity";
import { Sale } from "src/sales/entities/sale.entity";
import { Tag } from "src/tags/entities/tag.entity";
import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column({ type: "varchar", length: 190 })
    email: string;

    @Column({ type: "varchar", length: 255 })
    passwordHash: string;

    @Column('simple-array', { nullable: false })
    roles: string[];

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;

    @OneToMany(() => Tag, tag => tag.createdBy)
    tags: Tag[];

    @OneToMany(() => Product, product => product.createdBy)
    products: Product[];

    @OneToMany(() => Customer, customer => customer.createdBy)
    customers: Customer[];

    @OneToMany(() => Sale, sale => sale.createdBy)
    sales: Sale[];
}