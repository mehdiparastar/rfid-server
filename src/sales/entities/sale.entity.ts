import { Customer } from "src/customers/entities/customer.entity";
import { Product } from "src/products/entities/product.entity";
import { User } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('sales')
export class Sale {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('date', { nullable: false })
    sellDate: Date;

    @ManyToOne(() => Customer, customer => customer.sales)
    @JoinColumn({ name: 'customerId' })
    customer: Customer;

    @ManyToOne(() => Product, product => product.sales)
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column('int', { nullable: false })
    quantity: number;  // Quantity sold

    @Column('varchar', { length: 20, nullable: false })
    payType: string;  // Payment type (e.g., 'credit', 'cash')

    @Column('text', { nullable: true })
    description: string;  // Description of the sale (optional)

    @Column('decimal', { precision: 10, scale: 2, nullable: false })
    spotPrice: number;  // Spot price at the time of sale

    @Column('decimal', { precision: 10, scale: 2, nullable: false })
    soldPrice: number;  // Final sold price

    @ManyToOne(() => User, user => user.sales)  // Relation with users table
    @JoinColumn({ name: 'userId' })
    createdBy: User;

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}