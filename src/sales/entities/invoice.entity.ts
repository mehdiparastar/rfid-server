import { Customer } from "src/customers/entities/customer.entity";
import { Product } from "src/products/entities/product.entity";
import { User } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SaleItem } from "./sale-item.entity";

@Entity('invoices')
export class Invoice {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('date', { nullable: false })
    sellDate: Date;

    @ManyToOne(() => Customer, customer => customer.invoices)
    @JoinColumn({ name: 'customerId' })
    customer: Customer;

    @OneToMany(() => SaleItem, i => i.invoice, { cascade: true, eager: true })
    items: SaleItem[];

    @Column('varchar', { length: 20, nullable: false })
    payType: string;  // Payment type (e.g., 'credit', 'cash')

    @Column('text', { nullable: true })
    description: string;  // Description of the sale (optional)

    @ManyToOne(() => User, user => user.invoices)  // Relation with users table
    @JoinColumn({ name: 'userId' })
    createdBy: User;

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}