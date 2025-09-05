import { Tag } from "src/tags/entities/tag.entity";
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @OneToMany(() => Tag, tag => tag.product)
    tags: Tag[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}
