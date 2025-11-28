import { Product } from "src/products/entities/product.entity";
import { User } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Invoice } from "./invoice.entity";

@Entity('sale_items')
export class SaleItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Invoice, invoice => invoice.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'invoiceId' })
    invoice: Invoice;

    @ManyToOne(() => Product, p => p.saleItems, { eager: true })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column('int', { nullable: false })
    quantity: number;

    @Column('decimal', { precision: 18, scale: 2, nullable: false })
    spotPrice: number;  // Spot price at the time of sale

    @Column('decimal', { precision: 18, scale: 2, nullable: false })
    soldPrice: number;

    @ManyToOne(() => User, user => user.saleItems)  // Relation with users table
    @JoinColumn({ name: 'userId' })
    createdBy: User;

    @CreateDateColumn({
        type: 'datetime',        // or 'timestamp'
        precision: 3,
        default: () => 'CURRENT_TIMESTAMP(3)',
    })
    createdAt: Date;

    @UpdateDateColumn({
        type: 'datetime',        // or 'timestamp'
        precision: 3,
        default: () => 'CURRENT_TIMESTAMP(3)',
    })
    updatedAt: Date;
}