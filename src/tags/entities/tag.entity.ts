import { Product } from 'src/products/entities/product.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';

@Entity('tags')
export class Tag {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    epc: string;

    @Column({ nullable: true })
    rssi: number;

    @Column({ nullable: true })
    pc: string;

    @Column()
    module: string;  // /dev/ttyUSBx

    @ManyToOne(() => Product, product => product.tags, { nullable: true })
    product: Product;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}
