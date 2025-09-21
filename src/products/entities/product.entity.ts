import { Sale } from "src/sales/entities/sale.entity";
import { Tag } from "src/tags/entities/tag.entity";
import { User } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { GOLD_PRODUCT_TYPES } from "../dto/create-product.dto";
import { type GoldProductType } from "../dto/create-product.dto";

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar', { nullable: false, unique: true })
    name: string

    @Column('simple-array', { nullable: true })
    photos: string[];  // Local file paths for photos

    @Column('simple-array', { nullable: true })
    previews: string[];  // Local file paths for preview images

    @Column('decimal', { precision: 10, scale: 2, nullable: false })
    weight: number;  // In grams or kilograms, depending on your unit system

    @Column({ type: 'enum', enum: GOLD_PRODUCT_TYPES, nullable: false })
    type: GoldProductType;

    @ManyToOne(() => User, user => user.products)  // Relation with users table
    @JoinColumn({ name: 'userId' })
    createdBy: User;

    @Column('int', { nullable: false, default: 1 })
    quantity: number;  // Available quantity of the product

    @Column('decimal', { precision: 10, scale: 2, nullable: false })
    makingCharge: number;  // Charge for making the product

    @Column('decimal', { precision: 10, scale: 2, nullable: false })
    vat: number;  // vat for making the product

    @Column('decimal', { precision: 10, scale: 2, nullable: false })
    profit: number;  // profit for making the product

    @ManyToMany(() => Tag, tag => tag.products)  // Many-to-many relation with tags
    @JoinTable()  // Junction table for many-to-many
    tags: Tag[];

    // Add this relation to define the reverse relationship with Sale
    @OneToMany(() => Sale, sale => sale.product)
    sales: Sale[];

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}