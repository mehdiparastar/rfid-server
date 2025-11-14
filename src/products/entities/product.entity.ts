import { SaleItem } from "src/sales/entities/sale-item.entity";
import { Tag } from "src/tags/entities/tag.entity";
import { User } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { GOLD_PRODUCT_SUB_TYPES, GOLD_PRODUCT_TYPES, type GoldProductSUBType, type GoldProductType } from "../dto/create-product.dto";


@Entity('products')
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar', { nullable: false, unique: false })
    name: string

    @Column('simple-array', { nullable: true })
    photos: string[];  // Local file paths for photos

    @Column('simple-array', { nullable: true })
    previews: string[];  // Local file paths for preview images

    @Column('decimal', { precision: 10, scale: 2, nullable: false })
    weight: number;  // In grams or kilograms, depending on your unit system

    @Column({ type: 'enum', enum: GOLD_PRODUCT_TYPES, nullable: false })
    type: GoldProductType;

    @Column({ type: 'enum', enum: GOLD_PRODUCT_SUB_TYPES.map(el => el.symbol), nullable: false })
    subType: GoldProductSUBType;

    @Column({ type: 'boolean', nullable: false })
    inventoryItem: boolean

    @ManyToOne(() => User, user => user.products)  // Relation with users table
    @JoinColumn({ name: 'userId' })
    createdBy: User;

    @Column('int', { nullable: false, default: 1 })
    quantity: number;  // Available quantity of the product

    @Column('tinyint', { unsigned: true, width: 3, default: 2, nullable: false })
    makingCharge: number; // 0..255; Charge for making the product

    @Column('tinyint', { unsigned: true, width: 3, default: 2, nullable: false })
    vat: number;  // vat for making the product

    @Column('tinyint', { unsigned: true, width: 3, default: 7, nullable: false })
    profit: number;  // profit for making the product

    @ManyToMany(() => Tag, tag => tag.products)  // Many-to-many relation with tags
    @JoinTable()  // Junction table for many-to-many
    tags: Tag[];

    @OneToMany(() => SaleItem, saleItem => saleItem.product)
    saleItems: SaleItem[];

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